import { createHmac } from "node:crypto";

export const ALIEXPRESS_REST_BASE_URL = "https://api-sg.aliexpress.com/rest";

export class AliExpressApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AliExpressApiError";
    this.details = details;
  }
}

function normalizedParameters(parameters) {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([key, value]) => key !== "sign" && key && value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}

export function signRestRequest(apiPath, parameters, appSecret) {
  if (!apiPath.startsWith("/")) throw new AliExpressApiError("AliExpress API paths must start with a slash.");
  if (!appSecret) throw new AliExpressApiError("App Secret is required to sign an AliExpress request.");
  const normalized = normalizedParameters(parameters);
  const canonical = apiPath + Object.keys(normalized)
    .sort()
    .map((key) => `${key}${normalized[key]}`)
    .join("");
  return createHmac("sha256", appSecret).update(canonical, "utf8").digest("hex").toUpperCase();
}

function safeApiDetails(payload, status) {
  const error = payload?.error_response || payload || {};
  return {
    httpStatus: status,
    apiCode: error.code === undefined ? undefined : String(error.code),
    message: error.msg || error.message || error.sub_msg || undefined,
    requestId: error.request_id || payload?.request_id || undefined,
  };
}

function validateTokenPayload(payload, status) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AliExpressApiError("AliExpress returned an invalid token response.", { httpStatus: status });
  }
  if (!payload.access_token) {
    throw new AliExpressApiError("AliExpress did not return an access token.", safeApiDetails(payload, status));
  }
  return payload;
}

export class AliExpressOAuthClient {
  constructor({ appKey, appSecret, fetchImpl = globalThis.fetch, now = Date.now, baseUrl = ALIEXPRESS_REST_BASE_URL }) {
    if (!appKey || !appSecret) throw new AliExpressApiError("App Key and App Secret are required.");
    if (typeof fetchImpl !== "function") throw new AliExpressApiError("A fetch implementation is required.");
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createToken(code) {
    if (!code) throw new AliExpressApiError("Authorization code is required.");
    return this.#requestToken("/auth/token/create", { code });
  }

  async refreshToken(refreshToken) {
    if (!refreshToken) throw new AliExpressApiError("Refresh token is required.");
    return this.#requestToken("/auth/token/refresh", { refresh_token: refreshToken });
  }

  async #requestToken(apiPath, businessParameters) {
    const parameters = normalizedParameters({
      app_key: this.appKey,
      sign_method: "sha256",
      timestamp: String(this.now()),
      ...businessParameters,
    });
    parameters.sign = signRestRequest(apiPath, parameters, this.appSecret);
    const url = new URL(`${this.baseUrl}${apiPath}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new AliExpressApiError("Could not reach the AliExpress token service.");
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AliExpressApiError("AliExpress returned a non-JSON token response.", {
        httpStatus: response.status,
      });
    }

    if (!response.ok) {
      throw new AliExpressApiError("AliExpress rejected the token request.", safeApiDetails(payload, response.status));
    }
    return validateTokenPayload(payload, response.status);
  }
}

export const clientInternals = { normalizedParameters, safeApiDetails, validateTokenPayload };
