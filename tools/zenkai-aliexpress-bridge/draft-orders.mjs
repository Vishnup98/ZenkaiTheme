#!/usr/bin/env node
import {
  AliExpressBusinessApiError,
  AliExpressBusinessClient,
} from "./top-client.mjs";
import { getSecret, KEYCHAIN_SERVICES, KeychainError } from "./keychain.mjs";
import {
  buildOrderDraft,
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
  normalizeShopifyOrderName,
  ShopifyOrderReadError,
} from "./shopify-orders.mjs";

const HELP = `Read-only Shopify → AliExpress order draft planner

Usage:
  node tools/zenkai-aliexpress-bridge/draft-orders.mjs \\
    --shopify-order ZK2805 \\
    [--shopify-order ZK2806 ...] \\
    [--min-split-savings 2.00]

The command reads the named Shopify orders, validates approved AliExpress variants,
quotes current item prices and tracked shipping, and prints redacted drafts for review.
It never invokes aliexpress.trade.buy.placeorder and cannot place an order.
`;

function parseArguments(argv) {
  const orderNames = [];
  let minSplitSavings = DEFAULT_DRAFT_POLICY.minSavingsPerExtraPackageUsd;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true, orderNames, minSplitSavings };
    if (argument === "--shopify-order") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new ShopifyOrderReadError("--shopify-order requires a value.");
      orderNames.push(normalizeShopifyOrderName(value));
      index += 1;
      continue;
    }
    if (argument === "--min-split-savings") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new ShopifyOrderReadError("--min-split-savings must be a number from 0 to 100.");
      }
      minSplitSavings = value;
      index += 1;
      continue;
    }
    throw new ShopifyOrderReadError(`Unknown argument: ${argument}`);
  }
  if (!orderNames.length) throw new ShopifyOrderReadError("At least one --shopify-order is required.");
  return { help: false, orderNames: [...new Set(orderNames)], minSplitSavings };
}

function orderCountry(order) {
  const address = order.shippingAddress || {};
  return String(address.countryCodeV2 || address.countryCode || "").toUpperCase();
}

function aggregateBasket(orders) {
  const components = emptyComponentCounts();
  let collectorPacks = 0;
  for (const order of orders) {
    const basket = classifyShopifyOrder(order);
    collectorPacks += basket.collectorPacks;
    for (const key of COMPONENT_KEYS) components[key] += basket.components[key];
  }
  return { components, collectorPacks, unsupportedLines: [] };
}

async function aliExpressClientFromKeychain() {
  const [appKey, appSecret, accessToken] = await Promise.all([
    getSecret(KEYCHAIN_SERVICES.appKey),
    getSecret(KEYCHAIN_SERVICES.appSecret),
    getSecret(KEYCHAIN_SERVICES.accessToken),
  ]);
  return new AliExpressBusinessClient({ appKey, appSecret, accessToken });
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const policy = {
    ...DEFAULT_DRAFT_POLICY,
    minSavingsPerExtraPackageUsd: options.minSplitSavings,
  };
  const [orders, client] = await Promise.all([
    fetchShopifyOrdersByName(options.orderNames),
    aliExpressClientFromKeychain(),
  ]);
  const freightCache = new Map();
  const draftsByName = new Map();
  const countryGroups = new Map();
  for (const order of orders) {
    const country = orderCountry(order);
    if (!countryGroups.has(country)) countryGroups.set(country, []);
    countryGroups.get(country).push(order);
  }
  for (const [country, countryOrders] of countryGroups) {
    if (!country) {
      for (const order of countryOrders) {
        draftsByName.set(order.name, {
          shopifyOrder: { id: order.id, name: order.name },
          approvalState: "blocked",
          blockers: ["Shopify shipping address has no country code"],
        });
      }
      continue;
    }
    const sources = await loadLiveFulfillmentSources({
      client,
      basket: aggregateBasket(countryOrders),
      country,
      currency: policy.currency,
    });
    const drafts = await Promise.all(countryOrders.map((order) => buildOrderDraft({
      order,
      client,
      sources,
      policy,
      freightCache,
    })));
    for (const draft of drafts) draftsByName.set(draft.shopifyOrder.name, draft);
  }

  const orderedDrafts = options.orderNames.map((name) => draftsByName.get(name));
  const selectedCost = orderedDrafts.reduce(
    (sum, draft) => sum + Number(draft?.decision?.selected?.quotedSubtotalBeforeTax || 0),
    0,
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    policy,
    mutationMethodCalled: false,
    orderPlacementEnabled: false,
    orderCount: orderedDrafts.length,
    draftReadyCount: orderedDrafts.filter((draft) => draft?.approvalState === "pending-user-approval").length,
    selectedQuotedSubtotalBeforeTax: Math.round((selectedCost + Number.EPSILON) * 100) / 100,
    currency: policy.currency,
    orders: orderedDrafts,
  }, null, 2)}\n`);
}

run().catch((error) => {
  const known = error instanceof AliExpressBusinessApiError
    || error instanceof KeychainError
    || error instanceof ShopifyOrderReadError;
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: known ? error.message : "Unexpected local draft-planner error.",
    details: known ? error.details || {} : {},
  }, null, 2)}\n`);
  process.exitCode = 1;
});

export const draftOrdersCliInternals = { aggregateBasket, orderCountry, parseArguments };
