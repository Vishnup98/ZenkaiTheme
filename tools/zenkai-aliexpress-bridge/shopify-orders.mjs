import { resolveAuth } from "/Users/vishnup/shopify-mcp/dist/auth/index.js";
import { ShopifyClient } from "/Users/vishnup/shopify-mcp/dist/client/graphql.js";

const EXPECTED_SHOP_NAME = "Zenkai Clothing";
const EXPECTED_STORE_DOMAIN = "n1t6es-qx.myshopify.com";

const ORDERS_QUERY = `
  query AliExpressDraftOrders($first: Int!, $query: String!) {
    shop { name myshopifyDomain }
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: false) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        phone
        billingAddress { phone }
        customer {
          phone
          defaultAddress { phone }
        }
        shippingAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        lineItems(first: 100) {
          nodes {
            id
            title
            vendor
            quantity
            fulfillableQuantity
            sku
            variantTitle
            fulfillmentStatus
            requiresShipping
            variant { sku title }
          }
        }
      }
    }
  }
`;

const REVIEW_CANDIDATES_QUERY = `
  query AliExpressReviewCandidates($first: Int!, $after: String, $query: String!) {
    shop { name myshopifyDomain }
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        phone
        billingAddress { phone }
        customer {
          phone
          defaultAddress { phone }
        }
        shippingAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        lineItems(first: 100) {
          nodes {
            id
            title
            vendor
            quantity
            fulfillableQuantity
            sku
            variantTitle
            fulfillmentStatus
            requiresShipping
            variant { sku title }
          }
        }
      }
    }
  }
`;

export class ShopifyOrderReadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ShopifyOrderReadError";
    this.details = details;
  }
}

export function normalizeShopifyOrderName(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const match = normalized.match(/^#?(ZK\d+)$/);
  if (!match) throw new ShopifyOrderReadError(`Invalid Shopify order name: ${value}. Expected ZK followed by digits.`);
  return `#${match[1]}`;
}

function assertExpectedShop(data) {
  if (data.shop?.name !== EXPECTED_SHOP_NAME || data.shop?.myshopifyDomain?.toLowerCase() !== EXPECTED_STORE_DOMAIN) {
    throw new ShopifyOrderReadError("Shopify store identity guard failed; refusing to use order data.", {
      expectedShopName: EXPECTED_SHOP_NAME,
      expectedStoreDomain: EXPECTED_STORE_DOMAIN,
      actualShopName: data.shop?.name || null,
      actualStoreDomain: data.shop?.myshopifyDomain || null,
    });
  }
}

function withResolvedPhone(order) {
  const { billingAddress, customer, phone, ...safeOrder } = order;
  return {
    ...safeOrder,
    shippingAddress: order.shippingAddress ? {
      ...order.shippingAddress,
      phone: order.shippingAddress.phone
        || phone
        || billingAddress?.phone
        || customer?.phone
        || customer?.defaultAddress?.phone
        || null,
    } : null,
  };
}

function orderNumber(value) {
  const match = String(value || "").trim().toUpperCase().match(/^#?ZK(\d+)$/);
  return match ? Number(match[1]) : null;
}

export async function fetchShopifyOrdersByName(orderNames, { client } = {}) {
  const normalizedNames = [...new Set(orderNames.map(normalizeShopifyOrderName))];
  if (!normalizedNames.length) throw new ShopifyOrderReadError("At least one Shopify order name is required.");
  if (normalizedNames.length > 50) throw new ShopifyOrderReadError("At most 50 Shopify orders can be drafted at once.");

  let shopifyClient = client;
  if (!shopifyClient) {
    const auth = await resolveAuth();
    shopifyClient = new ShopifyClient(auth, resolveAuth);
  }
  const search = normalizedNames.map((name) => `name:${name.slice(1)}`).join(" OR ");
  const result = await shopifyClient.query(ORDERS_QUERY, {
    first: Math.max(10, normalizedNames.length * 2),
    query: search,
  });
  if (result.errors?.length) {
    throw new ShopifyOrderReadError("Shopify rejected the read-only order query.", { errors: result.errors });
  }
  const data = result.data ?? result;
  assertExpectedShop(data);
  const wanted = new Set(normalizedNames);
  const orders = (data.orders?.nodes || [])
    .filter((order) => wanted.has(normalizeShopifyOrderName(order.name)))
    .map(withResolvedPhone);
  const found = new Set(orders.map((order) => normalizeShopifyOrderName(order.name)));
  const missing = normalizedNames.filter((name) => !found.has(name));
  if (missing.length) throw new ShopifyOrderReadError("One or more Shopify orders were not found.", { missing });
  return normalizedNames.map((name) => orders.find((order) => normalizeShopifyOrderName(order.name) === name));
}

export async function fetchShopifyOrdersForAliExpressReview({
  client,
  minimumOrderNumber = Number(process.env.ZENKAI_ALIEXPRESS_MIN_ORDER_NUMBER || 2795),
  pageSize = 100,
  maxPages = 10,
} = {}) {
  if (!Number.isInteger(minimumOrderNumber) || minimumOrderNumber < 1) {
    throw new ShopifyOrderReadError("ZENKAI_ALIEXPRESS_MIN_ORDER_NUMBER must be a positive integer.");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) {
    throw new ShopifyOrderReadError("Shopify discovery page size must be between 1 and 250.");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new ShopifyOrderReadError("Shopify discovery page limit must be between 1 and 50.");
  }

  let shopifyClient = client;
  if (!shopifyClient) {
    const auth = await resolveAuth();
    shopifyClient = new ShopifyClient(auth, resolveAuth);
  }

  const orders = [];
  let after = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await shopifyClient.query(REVIEW_CANDIDATES_QUERY, {
      first: pageSize,
      after,
      query: "financial_status:paid status:open",
    });
    if (result.errors?.length) {
      throw new ShopifyOrderReadError("Shopify rejected the automatic order-discovery query.", { errors: result.errors });
    }
    const data = result.data ?? result;
    assertExpectedShop(data);
    const nodes = data.orders?.nodes || [];
    let reachedMinimum = false;
    for (const order of nodes) {
      const number = orderNumber(order.name);
      if (number === null || number < minimumOrderNumber) {
        reachedMinimum = reachedMinimum || (number !== null && number < minimumOrderNumber);
        continue;
      }
      if (order.cancelledAt || order.displayFinancialStatus !== "PAID") continue;
      orders.push(withResolvedPhone(order));
    }
    const pageInfo = data.orders?.pageInfo || {};
    if (reachedMinimum || !pageInfo.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return orders.sort((left, right) => orderNumber(left.name) - orderNumber(right.name));
}

export const shopifyOrderInternals = {
  ORDERS_QUERY,
  REVIEW_CANDIDATES_QUERY,
  assertExpectedShop,
  orderNumber,
  withResolvedPhone,
};
