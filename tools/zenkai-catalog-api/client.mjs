const EXPECTED_SHOP_NAME = "Zenkai Clothing";
const EXPECTED_APP_HANDLE = "analyticsmcpapp";
const EXPECTED_STORE_DOMAIN = "n1t6es-qx.myshopify.com";
const REQUIRED_SCOPES = [
  "write_products",
  "write_files",
  "write_inventory",
  "write_publications",
  "read_locations",
];

export class CatalogApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CatalogApiError";
    this.details = details;
  }
}

function normalizeDomain(value) {
  return value
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class ShopifyAdminClient {
  constructor({ storeDomain, clientId, clientSecret, apiVersion = "2026-01", fetchImpl = fetch }) {
    this.storeDomain = normalizeDomain(storeDomain);
    this.clientId = clientId?.trim();
    this.clientSecret = clientSecret?.trim();
    this.apiVersion = apiVersion;
    this.fetch = fetchImpl;
    this.accessToken = null;

    if (!this.storeDomain || !this.clientId || !this.clientSecret) {
      throw new CatalogApiError(
        "Missing Shopify API credentials. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET.",
      );
    }
    if (!this.storeDomain.endsWith(".myshopify.com")) {
      throw new CatalogApiError("SHOPIFY_STORE_DOMAIN must be the store's .myshopify.com domain.");
    }
    if (this.storeDomain !== EXPECTED_STORE_DOMAIN) {
      throw new CatalogApiError("Store-domain guard failed before authentication; refusing all API access.", {
        expectedStoreDomain: EXPECTED_STORE_DOMAIN,
      });
    }
    if (!/^20\d{2}-(01|04|07|10)$/.test(this.apiVersion)) {
      throw new CatalogApiError(`Invalid SHOPIFY_API_VERSION: ${this.apiVersion}`);
    }
  }

  static fromEnvironment(env = process.env, fetchImpl = fetch) {
    return new ShopifyAdminClient({
      storeDomain: env.SHOPIFY_STORE_DOMAIN,
      clientId: env.SHOPIFY_CLIENT_ID,
      clientSecret: env.SHOPIFY_CLIENT_SECRET,
      apiVersion: env.SHOPIFY_API_VERSION || "2026-01",
      fetchImpl,
    });
  }

  async authenticate() {
    const response = await this.fetch(`https://${this.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new CatalogApiError(`Shopify OAuth token exchange failed (${response.status}).`, {
        response: body.slice(0, 500),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new CatalogApiError("Shopify OAuth returned invalid JSON.");
    }
    if (!parsed.access_token) {
      throw new CatalogApiError("Shopify OAuth response did not include an access token.");
    }
    this.accessToken = parsed.access_token;
  }

  async graphql(query, variables = {}, { retry = true } = {}) {
    if (!this.accessToken) await this.authenticate();

    const response = await this.fetch(
      `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    if (response.status === 401 && retry) {
      this.accessToken = null;
      await this.authenticate();
      return this.graphql(query, variables, { retry: false });
    }
    if (response.status === 429 && retry) {
      const retryAfter = Math.min(Number(response.headers.get("retry-after") || 2), 10);
      await sleep(retryAfter * 1000);
      return this.graphql(query, variables, { retry: false });
    }

    const body = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new CatalogApiError(`Shopify GraphQL returned invalid JSON (${response.status}).`, {
        response: body.slice(0, 500),
      });
    }
    if (!response.ok) {
      throw new CatalogApiError(`Shopify GraphQL request failed (${response.status}).`, {
        errors: parsed.errors || parsed,
      });
    }
    if (parsed.errors?.length) {
      throw new CatalogApiError("Shopify GraphQL rejected the operation.", {
        errors: parsed.errors,
      });
    }
    return parsed.data;
  }
}

const VERIFY_QUERY = `
  query VerifyZenkaiCatalogAccess {
    shop {
      name
      myshopifyDomain
    }
    currentAppInstallation {
      app {
        handle
        title
      }
      accessScopes {
        handle
      }
    }
  }
`;

export async function verifyZenkaiAccess(client) {
  const data = await client.graphql(VERIFY_QUERY);
  const shop = data.shop;
  const app = data.currentAppInstallation?.app;
  const scopes = (data.currentAppInstallation?.accessScopes || []).map(({ handle }) => handle).sort();
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));

  if (shop?.name !== EXPECTED_SHOP_NAME) {
    throw new CatalogApiError("Store identity guard failed; refusing all catalog operations.", {
      expectedShop: EXPECTED_SHOP_NAME,
      actualShop: shop?.name || null,
    });
  }
  if (shop?.myshopifyDomain?.toLowerCase() !== EXPECTED_STORE_DOMAIN) {
    throw new CatalogApiError("Store-domain identity guard failed; refusing all catalog operations.", {
      expectedStoreDomain: EXPECTED_STORE_DOMAIN,
      actualStoreDomain: shop?.myshopifyDomain || null,
    });
  }
  if (app?.handle !== EXPECTED_APP_HANDLE) {
    throw new CatalogApiError("App identity guard failed; refusing all catalog operations.", {
      expectedAppHandle: EXPECTED_APP_HANDLE,
      actualAppHandle: app?.handle || null,
    });
  }
  if (missingScopes.length) {
    throw new CatalogApiError("The Zenkai Shopify app is missing required catalog scopes.", {
      missingScopes,
    });
  }

  return {
    ok: true,
    shop: { name: shop.name, myshopifyDomain: shop.myshopifyDomain },
    app: { handle: app.handle, title: app.title },
    apiVersion: client.apiVersion,
    requiredScopes: REQUIRED_SCOPES,
    missingScopes: [],
  };
}

export function assertNoUserErrors(payload, operation) {
  if (payload?.userErrors?.length) {
    throw new CatalogApiError(`${operation} returned Shopify user errors.`, {
      operation,
      userErrors: payload.userErrors,
    });
  }
}

export const catalogGuards = {
  expectedShopName: EXPECTED_SHOP_NAME,
  expectedAppHandle: EXPECTED_APP_HANDLE,
  expectedStoreDomain: EXPECTED_STORE_DOMAIN,
  requiredScopes: REQUIRED_SCOPES,
};
