import { timingSafeEqual } from "node:crypto";

export const ALIEXPRESS_AUTHORIZE_URL = "https://api-sg.aliexpress.com/oauth/authorize";
export const ZENKAI_CALLBACK_URL = "https://zenkaiclothing.com/";
export const AUTHORIZATION_CODE_MAX_AGE_MS = 30 * 60 * 1000;

export class OAuthValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OAuthValidationError";
    this.details = details;
  }
}
export function buildAuthorizationUrl({ appKey, state, redirectUri = ZENKAI_CALLBACK_URL }) {
  if (!appKey || !state) throw new OAuthValidationError("App Key and state are required.");
  const url = new URL(ALIEXPRESS_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_auth", "true");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("client_id", appKey);
  url.searchParams.set("state", state);
  return url.toString();
}

function sameCallback(actual, expected) {
  return actual.protocol === expected.protocol
    && actual.hostname === expected.hostname
    && actual.port === expected.port
    && actual.pathname === expected.pathname;
}

function statesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parseAuthorizationRedirect(
  redirectValue,
  pending,
  { now = Date.now(), redirectUri = ZENKAI_CALLBACK_URL } = {},
) {
  if (!pending?.state || !Number.isFinite(pending.createdAt)) {
    throw new OAuthValidationError("No valid pending authorization was found. Run authorize again.");
  }

  let actual;
  try {
    actual = new URL(String(redirectValue).trim());
  } catch {
    throw new OAuthValidationError("Paste the complete redirected https://zenkaiclothing.com URL.");
  }

  const expected = new URL(redirectUri);
  if (!sameCallback(actual, expected)) {
    throw new OAuthValidationError("The redirect URL does not match the callback registered for this app.");
  }

  const oauthError = actual.searchParams.get("error");
  if (oauthError) {
    throw new OAuthValidationError("AliExpress did not authorize the account.", {
      oauthError,
      description: actual.searchParams.get("error_description") || undefined,
    });
  }

  const state = actual.searchParams.get("state") || "";
  if (!statesMatch(state, pending.state)) {
    throw new OAuthValidationError("OAuth state did not match. Start a new authorization and do not reuse old tabs.");
  }

  if (now - pending.createdAt > AUTHORIZATION_CODE_MAX_AGE_MS || now < pending.createdAt - 60_000) {
    throw new OAuthValidationError("The authorization attempt is too old. Run authorize again.");
  }

  const code = actual.searchParams.get("code");
  if (!code) throw new OAuthValidationError("The redirected URL does not contain an authorization code.");
  return code;
}

function expiryFromSeconds(now, seconds) {
  const parsed = Number(seconds);
  return Number.isFinite(parsed) && parsed >= 0 ? new Date(now + parsed * 1000).toISOString() : null;
}

export function tokenMetadata(tokenResponse, { now = Date.now(), previous = null } = {}) {
  return {
    issuedAt: new Date(now).toISOString(),
    accessExpiresAt: expiryFromSeconds(now, tokenResponse.expires_in),
    refreshExpiresAt:
      expiryFromSeconds(now, tokenResponse.refresh_expires_in) || previous?.refreshExpiresAt || null,
  };
}
