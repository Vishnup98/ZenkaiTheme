#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

import { AliExpressApiError, AliExpressOAuthClient } from "./iop-client.mjs";
import {
  deleteSecret,
  getSecret,
  KEYCHAIN_SERVICES,
  KeychainError,
  secretExists,
  setSecret,
} from "./keychain.mjs";
import {
  AUTHORIZATION_CODE_MAX_AGE_MS,
  buildAuthorizationUrl,
  OAuthValidationError,
  parseAuthorizationRedirect,
  tokenMetadata,
  ZENKAI_CALLBACK_URL,
} from "./oauth.mjs";
import { PromptError, readHidden, readLine } from "./prompt.mjs";
import {
  AliExpressBusinessApiError,
  AliExpressBusinessClient,
  summarizeSimpleProduct,
} from "./top-client.mjs";

const execFileAsync = promisify(execFile);

const HELP = `Zenkai AliExpress buyer OAuth bridge

Usage:
  node tools/zenkai-aliexpress-bridge/cli.mjs setup
  node tools/zenkai-aliexpress-bridge/cli.mjs status
  node tools/zenkai-aliexpress-bridge/cli.mjs authorize [--open]
  node tools/zenkai-aliexpress-bridge/cli.mjs exchange
  node tools/zenkai-aliexpress-bridge/cli.mjs refresh
  node tools/zenkai-aliexpress-bridge/cli.mjs product-read --product-id <id>

Security:
  - App Secret, authorization codes, and tokens are never accepted as command arguments.
  - Credentials and OAuth state are stored in macOS Keychain, not this repository.
  - Token values are never printed.
  - Reads run directly; write operations require dedicated validation and explicit confirmation.
  - No order is placed by the current product-read command.
`;

function parseArguments(argv) {
  const command = argv[0];
  const options = { open: false, productId: null };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--open") {
      options.open = true;
      continue;
    }
    if (argument === "--product-id") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new OAuthValidationError("--product-id requires a value.");
      options.productId = value;
      index += 1;
      continue;
    }
    throw new OAuthValidationError(`Unknown argument: ${argument}`);
  }
  if (options.open && command !== "authorize") {
    throw new OAuthValidationError("--open is only valid with authorize.");
  }
  if (options.productId && command !== "product-read") {
    throw new OAuthValidationError("--product-id is only valid with product-read.");
  }
  return { command, options };
}

async function readMetadata() {
  const value = await getSecret(KEYCHAIN_SERVICES.tokenMetadata, { allowMissing: true });
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function hasValidPendingAuthorization() {
  const value = await getSecret(KEYCHAIN_SERVICES.oauthState, { allowMissing: true });
  if (!value) return false;
  try {
    const pending = JSON.parse(value);
    const age = Date.now() - pending.createdAt;
    return typeof pending.state === "string"
      && pending.state.length >= 32
      && Number.isFinite(pending.createdAt)
      && age >= -60_000
      && age <= AUTHORIZATION_CODE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function publicMetadata(metadata) {
  if (!metadata) return null;
  const now = Date.now();
  return {
    issuedAt: metadata.issuedAt || null,
    accessExpiresAt: metadata.accessExpiresAt || null,
    accessExpired: metadata.accessExpiresAt ? Date.parse(metadata.accessExpiresAt) <= now : null,
    refreshExpiresAt: metadata.refreshExpiresAt || null,
    refreshExpired: metadata.refreshExpiresAt ? Date.parse(metadata.refreshExpiresAt) <= now : null,
  };
}

async function setup() {
  const appKey = (await readLine("AliExpress App Key: ")).trim();
  if (!/^\d+$/.test(appKey)) throw new OAuthValidationError("App Key must contain only digits.");
  const appSecret = (await readHidden("AliExpress App Secret (hidden): ")).trim();
  if (!appSecret) throw new OAuthValidationError("App Secret cannot be empty.");
  await setSecret(KEYCHAIN_SERVICES.appKey, appKey);
  await setSecret(KEYCHAIN_SERVICES.appSecret, appSecret);
  return {
    ok: true,
    credentialsStored: true,
    location: "macOS Keychain",
    next: "Run authorize --open.",
  };
}

async function status() {
  const [appKey, appSecret, accessToken, refreshToken, pending, metadata] = await Promise.all([
    secretExists(KEYCHAIN_SERVICES.appKey),
    secretExists(KEYCHAIN_SERVICES.appSecret),
    secretExists(KEYCHAIN_SERVICES.accessToken),
    secretExists(KEYCHAIN_SERVICES.refreshToken),
    hasValidPendingAuthorization(),
    readMetadata(),
  ]);
  return {
    ok: true,
    appCredentialsConfigured: appKey && appSecret,
    authorizationPending: pending,
    accessTokenStored: accessToken,
    refreshTokenStored: refreshToken,
    token: publicMetadata(metadata),
    callbackUrl: ZENKAI_CALLBACK_URL,
  };
}

async function authorize({ open }) {
  const appKey = await getSecret(KEYCHAIN_SERVICES.appKey);
  const state = randomBytes(32).toString("base64url");
  const pending = { state, createdAt: Date.now(), redirectUri: ZENKAI_CALLBACK_URL };
  await setSecret(KEYCHAIN_SERVICES.oauthState, JSON.stringify(pending));
  const authorizationUrl = buildAuthorizationUrl({ appKey, state });
  if (open) await execFileAsync("/usr/bin/open", [authorizationUrl]);
  return {
    ok: true,
    browserOpened: open,
    authorizationUrl,
    next: "Authorize your AliExpress buyer account, copy the full redirected zenkaiclothing.com URL, then run exchange.",
  };
}

async function exchange() {
  const pendingValue = await getSecret(KEYCHAIN_SERVICES.oauthState);
  let pending;
  try {
    pending = JSON.parse(pendingValue);
  } catch {
    throw new OAuthValidationError("Pending OAuth state is invalid. Run authorize again.");
  }

  const redirectedUrl = await readHidden("Paste the full redirected zenkaiclothing.com URL (hidden): ");
  const code = parseAuthorizationRedirect(redirectedUrl, pending);
  const [appKey, appSecret] = await Promise.all([
    getSecret(KEYCHAIN_SERVICES.appKey),
    getSecret(KEYCHAIN_SERVICES.appSecret),
  ]);
  const client = new AliExpressOAuthClient({ appKey, appSecret });
  const tokens = await client.createToken(code);
  const metadata = tokenMetadata(tokens);

  await setSecret(KEYCHAIN_SERVICES.accessToken, String(tokens.access_token));
  if (tokens.refresh_token) {
    await setSecret(KEYCHAIN_SERVICES.refreshToken, String(tokens.refresh_token));
  } else {
    await deleteSecret(KEYCHAIN_SERVICES.refreshToken);
  }
  await setSecret(KEYCHAIN_SERVICES.tokenMetadata, JSON.stringify(metadata));
  await deleteSecret(KEYCHAIN_SERVICES.oauthState);
  return {
    ok: true,
    authorized: true,
    token: publicMetadata(metadata),
    next: "Run status. Do not share or export the stored token values.",
  };
}

async function refresh() {
  const [appKey, appSecret, refreshToken, previous] = await Promise.all([
    getSecret(KEYCHAIN_SERVICES.appKey),
    getSecret(KEYCHAIN_SERVICES.appSecret),
    getSecret(KEYCHAIN_SERVICES.refreshToken),
    readMetadata(),
  ]);
  const client = new AliExpressOAuthClient({ appKey, appSecret });
  const tokens = await client.refreshToken(refreshToken);
  const metadata = tokenMetadata(tokens, { previous });
  await setSecret(KEYCHAIN_SERVICES.accessToken, String(tokens.access_token));
  await setSecret(KEYCHAIN_SERVICES.refreshToken, String(tokens.refresh_token || refreshToken));
  await setSecret(KEYCHAIN_SERVICES.tokenMetadata, JSON.stringify(metadata));
  return {
    ok: true,
    refreshed: true,
    token: publicMetadata(metadata),
  };
}

async function productRead(productId) {
  if (!productId) throw new OAuthValidationError("product-read requires --product-id <id>.");
  const [appKey, appSecret, accessToken] = await Promise.all([
    getSecret(KEYCHAIN_SERVICES.appKey),
    getSecret(KEYCHAIN_SERVICES.appSecret),
    getSecret(KEYCHAIN_SERVICES.accessToken),
  ]);
  const client = new AliExpressBusinessClient({ appKey, appSecret, accessToken });
  return summarizeSimpleProduct(await client.getSimpleProduct(productId), productId);
}

async function run() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }
  const commands = new Set(["setup", "status", "authorize", "exchange", "refresh", "product-read"]);
  if (!commands.has(command)) throw new OAuthValidationError(`Unknown command: ${command}`, { help: HELP });
  const result = command === "setup"
    ? await setup()
    : command === "status"
      ? await status()
      : command === "authorize"
        ? await authorize(options)
        : command === "exchange"
          ? await exchange()
          : command === "refresh"
            ? await refresh()
            : await productRead(options.productId);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

run().catch((error) => {
  const known = error instanceof AliExpressApiError
    || error instanceof AliExpressBusinessApiError
    || error instanceof KeychainError
    || error instanceof OAuthValidationError
    || error instanceof PromptError;
  const output = {
    ok: false,
    error: known ? error.message : "Unexpected local authorization error.",
    details: known && error.details ? error.details : {},
  };
  if (process.env.DEBUG_ZENKAI_ALIEXPRESS === "1" && !known) output.stack = error.stack;
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
});

export const cliInternals = { parseArguments, publicMetadata };
