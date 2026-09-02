import {
  AliExpressBusinessApiError,
  AliExpressBusinessClient,
  extractPlaceOrderResult,
} from "./top-client.mjs";
import { setTimeout as wait } from "node:timers/promises";
import { getSecret, KEYCHAIN_SERVICES } from "./keychain.mjs";
import {
  buildOrderDraft,
  buildSensitivePlaceOrderPayload,
  classifyShopifyOrder,
  loadLiveFulfillmentSources,
} from "./draft-planner.mjs";
import {
  COMPONENT_KEYS,
  DEFAULT_DRAFT_POLICY,
  emptyComponentCounts,
} from "./fulfillment-catalog.mjs";
import {
  fetchShopifyOrdersByName,
  fetchShopifyOrdersForAliExpressReview,
  normalizeShopifyOrderName,
} from "./shopify-orders.mjs";
import { OrderLedgerError, OrderPlacementLedger } from "./order-ledger.mjs";
import { couponForEligibleSubtotal } from "./coupon-policy.mjs";
import {
  BrowserCheckoutError,
  BrowserCheckoutJobStore,
  buildBrowserCheckoutJob,
} from "./browser-checkout-jobs.mjs";

export const ALIEXPRESS_ORDERS_URL = "https://www.aliexpress.com/p/order/index.html";
export const HANDLED_LEDGER_STATUSES = Object.freeze(new Set(["placed-unpaid", "paid", "handled-manually"]));
const ALIEXPRESS_READ_ATTEMPTS = 3;

export class DashboardActionError extends Error {
  constructor(message, { statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "DashboardActionError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function retryableAliExpressReadError(error) {
  if (!(error instanceof AliExpressBusinessApiError)) return false;
  const status = Number(error.details?.httpStatus);
  return error.message === "Could not reach the AliExpress API."
    || error.message === "AliExpress returned a non-JSON API response."
    || status === 429
    || status >= 500;
}

async function aliExpressReadWithRetry(operation, {
  attempts = ALIEXPRESS_READ_ATTEMPTS,
  waitImpl = wait,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!retryableAliExpressReadError(error) || attempt === attempts) throw error;
      await waitImpl(200 * (2 ** (attempt - 1)));
    }
  }
  throw new Error("AliExpress read retry loop ended unexpectedly.");
}

async function validatedAliExpressRead(operation) {
  try {
    return await aliExpressReadWithRetry(operation);
  } catch (error) {
    if (!(error instanceof AliExpressBusinessApiError)) throw error;
    const message = retryableAliExpressReadError(error)
      ? "AliExpress could not refresh current product and shipping data after three attempts. No AliExpress order was submitted. Try again in a moment."
      : `AliExpress could not validate the current fulfillment plan: ${error.message} No AliExpress order was submitted.`;
    throw new DashboardActionError(message, {
      statusCode: retryableAliExpressReadError(error) ? 503 : 409,
      details: { api: error.details },
    });
  }
}

export async function aliExpressClientFromKeychain() {
  const [appKey, appSecret, accessToken] = await Promise.all([
    getSecret(KEYCHAIN_SERVICES.appKey),
    getSecret(KEYCHAIN_SERVICES.appSecret),
    getSecret(KEYCHAIN_SERVICES.accessToken),
  ]);
  return new AliExpressBusinessClient({ appKey, appSecret, accessToken });
}

function orderCountry(order) {
  return String(order.shippingAddress?.countryCodeV2 || "").toUpperCase();
}

function aggregateBasket(orders) {
  const components = emptyComponentCounts();
  let collectorPacks = 0;
  for (const order of orders) {
    const basket = classifyShopifyOrder(order);
    collectorPacks += basket.collectorPacks;
    for (const component of COMPONENT_KEYS) components[component] += basket.components[component];
  }
  return { components, collectorPacks, unsupportedLines: [] };
}

export async function discoverDashboardOrderNames({
  shopifyReader = fetchShopifyOrdersForAliExpressReview,
  ledger = new OrderPlacementLedger(),
} = {}) {
  const candidates = await shopifyReader();
  const names = [];
  for (const order of candidates) {
    const basket = classifyShopifyOrder(order);
    if (!COMPONENT_KEYS.some((component) => basket.components[component] > 0)) continue;
    const name = normalizeShopifyOrderName(order.name);
    const entry = await ledger.get(name);
    if (HANDLED_LEDGER_STATUSES.has(entry?.status)) continue;
    names.push(name);
  }
  return names;
}

export async function markDashboardOrderHandled({ shopifyOrderName } = {}, {
  shopifyReader = fetchShopifyOrdersByName,
  ledger = new OrderPlacementLedger(),
} = {}) {
  const name = normalizeShopifyOrderName(shopifyOrderName);
  const orders = await shopifyReader([name]);
  const order = orders[0];
  if (!order) {
    throw new DashboardActionError(`Shopify order ${name} was not found.`, { statusCode: 404 });
  }
  try {
    const ledgerEntry = await ledger.markHandled({
      shopifyOrderId: order.id,
      shopifyOrderName: name,
      reason: "Operator marked this order as handled from the local fulfillment dashboard.",
    });
    return {
      ok: true,
      shopifyOrderName: name,
      status: ledgerEntry.status,
      message: `${name} was marked handled and removed from the review queue.`,
    };
  } catch (error) {
    if (error instanceof OrderLedgerError) {
      throw new DashboardActionError(error.message, { statusCode: 409, details: error.details });
    }
    throw error;
  }
}

function displayAddress(order) {
  const address = order.shippingAddress || {};
  return {
    fullName: [address.firstName, address.lastName].filter(Boolean).join(" ").trim(),
    address1: address.address1 || "",
    address2: address.address2 || "",
    city: address.city || "",
    province: address.province || address.provinceCode || "",
    provinceCode: address.provinceCode || "",
    country: address.country || address.countryCodeV2 || "",
    countryCode: address.countryCodeV2 || "",
    postalCode: address.zip || "",
    phone: address.phone || null,
  };
}

function ledgerAllowsPlacement(entry) {
  return !entry || entry.status === "rejected";
}

export async function prepareDashboardOrders(orderNames, {
  shopifyReader = fetchShopifyOrdersByName,
  client,
  ledger = new OrderPlacementLedger(),
  browserCheckoutJobs = new BrowserCheckoutJobStore(),
  policy = DEFAULT_DRAFT_POLICY,
  freightCache = new Map(),
} = {}) {
  const normalizedNames = orderNames.map(normalizeShopifyOrderName);
  if (!normalizedNames.length) {
    return {
      generatedAt: new Date().toISOString(),
      readOnlyPreview: true,
      ordersPageUrl: ALIEXPRESS_ORDERS_URL,
      policy,
      orders: [],
    };
  }
  const aliClient = client || await aliExpressClientFromKeychain();
  const orders = await shopifyReader(normalizedNames);
  const countryGroups = new Map();
  for (const order of orders) {
    const country = orderCountry(order);
    if (!countryGroups.has(country)) countryGroups.set(country, []);
    countryGroups.get(country).push(order);
  }

  const draftsByName = new Map();
  for (const [country, countryOrders] of countryGroups) {
    if (!country) continue;
    const drafts = await validatedAliExpressRead(async () => {
      const liveSources = await loadLiveFulfillmentSources({
        client: aliClient,
        basket: aggregateBasket(countryOrders),
        country,
        currency: policy.currency,
      });
      return Promise.all(countryOrders.map((order) => buildOrderDraft({
        order,
        client: aliClient,
        sources: liveSources,
        policy,
        freightCache,
      })));
    });
    for (let index = 0; index < countryOrders.length; index += 1) {
      draftsByName.set(drafts[index].shopifyOrder.name, { order: countryOrders[index], draft: drafts[index] });
    }
  }

  const result = [];
  for (const name of normalizedNames) {
    const prepared = draftsByName.get(name);
    if (!prepared) {
      result.push({
        shopifyOrder: { name },
        approvalState: "blocked",
        blockers: ["The Shopify shipping address has no country code"],
        canPlace: false,
      });
      continue;
    }
    const ledgerEntry = await ledger.get(name);
    const browserCheckout = await browserCheckoutJobs.findActiveForOrder(name);
    const canPlace = prepared.draft.approvalState === "pending-user-approval" && ledgerAllowsPlacement(ledgerEntry);
    const selected = prepared.draft.decision?.selected;
    const coupon = selected
      ? couponForEligibleSubtotal(selected.itemSubtotal, selected.currency)
      : null;
    result.push({
      ...prepared.draft,
      address: displayAddress(prepared.order),
      ledger: ledgerEntry,
      browserCheckout,
      coupon,
      canPlace: canPlace && !browserCheckout,
      canPrepareCouponCheckout: canPlace && Boolean(coupon) && !browserCheckout,
      confirmationPhrase: `CREATE UNPAID ${name}`,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    readOnlyPreview: true,
    ordersPageUrl: ALIEXPRESS_ORDERS_URL,
    policy,
    orders: result,
  };
}

export async function placeUnpaidAliExpressOrder({
  shopifyOrderName,
  expectedDraftFingerprint,
  confirmation,
}, {
  shopifyReader = fetchShopifyOrdersByName,
  client,
  ledger = new OrderPlacementLedger(),
  browserCheckoutJobs = new BrowserCheckoutJobStore(),
  policy = DEFAULT_DRAFT_POLICY,
} = {}) {
  const name = normalizeShopifyOrderName(shopifyOrderName);
  const requiredConfirmation = `CREATE UNPAID ${name}`;
  if (confirmation !== requiredConfirmation) {
    throw new DashboardActionError(`Confirmation must exactly match: ${requiredConfirmation}`, { statusCode: 400 });
  }
  if (!/^[a-f0-9]{64}$/.test(String(expectedDraftFingerprint || ""))) {
    throw new DashboardActionError("A valid reviewed draft fingerprint is required.", { statusCode: 400 });
  }
  const activeBrowserCheckout = await browserCheckoutJobs.findActiveForOrder(name);
  if (activeBrowserCheckout) {
    throw new DashboardActionError("This Shopify order already has an active browser checkout; API placement is blocked.", {
      statusCode: 409,
      details: { browserCheckout: activeBrowserCheckout },
    });
  }
  const aliClient = client || await aliExpressClientFromKeychain();
  const orders = await shopifyReader([name]);
  const order = orders[0];
  const basket = classifyShopifyOrder(order);
  const country = orderCountry(order);
  const freshDraft = await validatedAliExpressRead(async () => {
    const sources = await loadLiveFulfillmentSources({
      client: aliClient,
      basket,
      country,
      currency: policy.currency,
    });
    return buildOrderDraft({ order, client: aliClient, sources, policy });
  });
  if (freshDraft.approvalState !== "pending-user-approval" || !freshDraft.decision.selected) {
    throw new DashboardActionError("The fresh order draft is blocked and cannot be placed.", {
      statusCode: 409,
      details: { blockers: freshDraft.blockers },
    });
  }
  if (freshDraft.draftFingerprint !== expectedDraftFingerprint) {
    throw new DashboardActionError("Price, shipping, inventory, products, or address changed. Refresh and review the new draft.", {
      statusCode: 409,
      details: {
        expectedDraftFingerprint,
        currentDraftFingerprint: freshDraft.draftFingerprint,
      },
    });
  }

  let attempt;
  try {
    attempt = await ledger.beginPlacement({
      shopifyOrderId: order.id,
      shopifyOrderName: name,
      draftFingerprint: freshDraft.draftFingerprint,
      quotedSubtotalBeforeTax: freshDraft.decision.selected.quotedSubtotalBeforeTax,
      currency: freshDraft.decision.selected.currency,
    });
  } catch (error) {
    if (error instanceof OrderLedgerError) {
      throw new DashboardActionError(error.message, { statusCode: 409, details: error.details });
    }
    throw error;
  }

  try {
    const payload = buildSensitivePlaceOrderPayload(order, freshDraft.decision.selected);
    const response = await aliClient.placeOrder(payload, { confirmMutation: true });
    const placed = extractPlaceOrderResult(response);
    const ledgerEntry = await ledger.completePlacement(name, attempt.attemptId, placed.orderIds);
    return {
      ok: true,
      shopifyOrderName: name,
      status: ledgerEntry.status,
      aliExpressOrderIds: placed.orderIds,
      ordersPageUrl: ALIEXPRESS_ORDERS_URL,
      message: "Unpaid AliExpress order created. Review it on AliExpress and pay manually.",
    };
  } catch (error) {
    if (error instanceof AliExpressBusinessApiError && error.details?.definitiveRejection === true) {
      const apiCode = String(error.details.apiCode || "ALIEXPRESS_BUSINESS_REJECTION");
      const apiMessage = String(error.details.message || error.message);
      const ledgerEntry = await ledger.markDefinitivelyRejected(name, attempt.attemptId, {
        code: apiCode,
        message: apiMessage,
      });
      throw new DashboardActionError(
        `AliExpress rejected the order and did not create it (${apiCode}: ${apiMessage}). Fix the issue before retrying.`,
        {
          statusCode: 409,
          details: {
            definitiveRejection: true,
            ledgerStatus: ledgerEntry.status,
            api: error.details,
          },
        },
      );
    }
    await ledger.markUncertain(name, attempt.attemptId, error.message);
    if (error instanceof AliExpressBusinessApiError) {
      throw new DashboardActionError(
        "AliExpress placement did not complete cleanly. Duplicate retry is blocked until the AliExpress orders page is checked.",
        { statusCode: 502, details: { ordersPageUrl: ALIEXPRESS_ORDERS_URL, api: error.details } },
      );
    }
    throw error;
  }
}

export async function prepareBrowserCouponCheckout({
  shopifyOrderName,
  expectedDraftFingerprint,
}, {
  shopifyReader = fetchShopifyOrdersByName,
  client,
  ledger = new OrderPlacementLedger(),
  browserCheckoutJobs = new BrowserCheckoutJobStore(),
  launchWorker = null,
  policy = DEFAULT_DRAFT_POLICY,
} = {}) {
  const name = normalizeShopifyOrderName(shopifyOrderName);
  if (!/^[a-f0-9]{64}$/.test(String(expectedDraftFingerprint || ""))) {
    throw new DashboardActionError("A valid reviewed draft fingerprint is required.", { statusCode: 400 });
  }
  const ledgerEntry = await ledger.get(name);
  if (!ledgerAllowsPlacement(ledgerEntry)) {
    throw new DashboardActionError("This Shopify order already has a placement record; browser checkout is blocked.", {
      statusCode: 409,
      details: { ledger: ledgerEntry },
    });
  }
  const aliClient = client || await aliExpressClientFromKeychain();
  const orders = await shopifyReader([name]);
  const order = orders[0];
  const basket = classifyShopifyOrder(order);
  const country = orderCountry(order);
  const freshDraft = await validatedAliExpressRead(async () => {
    const sources = await loadLiveFulfillmentSources({
      client: aliClient,
      basket,
      country,
      currency: policy.currency,
    });
    return buildOrderDraft({ order, client: aliClient, sources, policy });
  });
  if (freshDraft.approvalState !== "pending-user-approval" || !freshDraft.decision.selected) {
    throw new DashboardActionError("The fresh order draft is blocked and cannot start browser checkout.", {
      statusCode: 409,
      details: { blockers: freshDraft.blockers },
    });
  }
  if (freshDraft.draftFingerprint !== expectedDraftFingerprint) {
    throw new DashboardActionError("Price, shipping, inventory, products, or address changed. Refresh and review the new draft.", {
      statusCode: 409,
      details: {
        expectedDraftFingerprint,
        currentDraftFingerprint: freshDraft.draftFingerprint,
      },
    });
  }

  try {
    const job = buildBrowserCheckoutJob(order, freshDraft.decision.selected);
    const status = await browserCheckoutJobs.create(job);
    if (launchWorker) await launchWorker({ stateDirectory: browserCheckoutJobs.directory });
    return {
      ok: true,
      shopifyOrderName: name,
      browserCheckoutJobId: job.id,
      status,
      coupon: job.expectedCoupon,
      message: `Existing-browser checkout queued with ${job.expectedCoupon.code}. The extension will clear the cart, add every exact SKU, and stop before final order submission.`,
    };
  } catch (error) {
    if (error instanceof BrowserCheckoutError) {
      throw new DashboardActionError(error.message, { statusCode: 409, details: error.details });
    }
    throw error;
  }
}

export const dashboardServiceInternals = {
  aggregateBasket,
  aliExpressReadWithRetry,
  displayAddress,
  ledgerAllowsPlacement,
  orderCountry,
  retryableAliExpressReadError,
};
