import { createHash } from "node:crypto";

import {
  AliExpressBusinessApiError,
  extractFreightOptions,
  extractProductSkus,
} from "./top-client.mjs";
import {
  BADGE_COMPONENT_KEYS,
  COMPONENT_KEYS,
  DEFAULT_DRAFT_POLICY,
  emptyComponentCounts,
  FULFILLMENT_SOURCES,
} from "./fulfillment-catalog.mjs";

const COMPONENT_LABELS = Object.freeze({
  kanto: "Kanto badge set",
  johto: "Johto badge set",
  hoenn: "Hoenn badge set",
  sinnoh: "Sinnoh badge set",
  evolution8: "Evolution 8-pin set",
});

const PHONE_COUNTRY_CODES = Object.freeze({
  US: "1",
  CA: "1",
  GB: "44",
  AU: "61",
  NZ: "64",
});
const MISSING_PHONE_FALLBACK = Object.freeze({
  phone_country: "+1",
  mobile_no: "6027515492",
});
const ALIEXPRESS_CITY_ALIASES = Object.freeze({
  // AliExpress's buyer-address validator rejects Shopify/USPS's "Saint Johns"
  // spelling for this ZIP as though the city were blank. Its checkout region
  // tree uses the abbreviated spelling below. Keep this exception narrow so
  // the customer-facing Shopify address remains authoritative everywhere else.
  "US|FL|32259|SAINT JOHNS": "St Johns",
});

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function asLineItems(order) {
  const value = order?.lineItems?.nodes
    ?? order?.lineItems?.edges?.map((edge) => edge.node)
    ?? order?.lines
    ?? [];
  return Array.isArray(value) ? value : [];
}

function lineQuantity(line) {
  const value = line.fulfillableQuantity ?? line.fulfillable_quantity ?? line.quantity ?? line.qty ?? 0;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
}

function lineIdentity(line) {
  return [line.title, line.variantTitle, line.variant, line.sku, line.variant?.title, line.variant?.sku]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyShopifyOrder(order) {
  const components = emptyComponentCounts();
  const externalLines = [];
  const unsupportedLines = [];
  let collectorPacks = 0;

  for (const line of asLineItems(order)) {
    const quantity = lineQuantity(line);
    if (!quantity || line.requiresShipping === false) continue;
    const identity = lineIdentity(line);
    const isBadge = identity.includes("gym badge") || identity.includes("badge pin set");
    const isCollector = isBadge && (
      identity.includes("collector")
      || identity.includes("4 regions")
      || identity.includes("4-region")
      || identity.includes("4 pack")
      || identity.includes("4-pack")
    );
    if (isCollector) {
      collectorPacks += quantity;
      for (const component of BADGE_COMPONENT_KEYS) components[component] += quantity;
      continue;
    }
    if (isBadge) {
      const component = BADGE_COMPONENT_KEYS.find((key) => identity.includes(key));
      if (component) {
        components[component] += quantity;
        continue;
      }
    }
    if (
      identity.includes("evolution pin")
      || identity.includes("zk-evolution-pin-8")
      || (identity.includes("8-pin") && identity.includes("evolution"))
    ) {
      components.evolution8 += quantity;
      continue;
    }
    const vendor = String(line.vendor || "").trim();
    if (/printify|gelato/i.test(vendor)) {
      externalLines.push({
        title: line.title || "Unknown item",
        variant: line.variantTitle || line.variant || line.variant?.title || null,
        vendor,
        quantity,
      });
      continue;
    }
    unsupportedLines.push({
      title: line.title || "Unknown item",
      variant: line.variantTitle || line.variant || line.variant?.title || null,
      sku: line.sku || line.variant?.sku || null,
      quantity,
    });
  }

  return { components, collectorPacks, externalLines, unsupportedLines };
}

function propertyMatches(actualProperties, expected) {
  return actualProperties.some((property) => (
    property.name === expected.name
    && property.definition === expected.definition
    && property.value === expected.value
  ));
}

function validateLiveVariant(source, expected, liveSkus, currency) {
  const live = liveSkus.find((sku) => sku.skuId === expected.skuId);
  if (!live) {
    throw new AliExpressBusinessApiError("An approved SKU is no longer present in its AliExpress listing.", {
      sourceId: source.sourceId,
      component: expected.component,
      skuId: expected.skuId,
    });
  }
  if (live.skuAttrWithLabel !== expected.skuAttrWithLabel || live.skuAttr !== expected.skuAttr) {
    throw new AliExpressBusinessApiError("An approved SKU attribute changed; manual review is required.", {
      sourceId: source.sourceId,
      component: expected.component,
      expectedSkuAttr: expected.skuAttrWithLabel,
      actualSkuAttr: live.skuAttrWithLabel,
    });
  }
  if (!propertyMatches(live.properties, expected.expectedProperty)) {
    throw new AliExpressBusinessApiError("An approved SKU property changed; manual review is required.", {
      sourceId: source.sourceId,
      component: expected.component,
      expectedProperty: expected.expectedProperty,
      actualProperties: live.properties,
    });
  }
  if (!Number.isFinite(live.unitPrice) || live.unitPrice < 0) {
    throw new AliExpressBusinessApiError("AliExpress did not return a usable current SKU price.", {
      sourceId: source.sourceId,
      component: expected.component,
    });
  }
  return {
    ...expected,
    unitPrice: roundMoney(live.unitPrice),
    availableStock: live.availableStock,
    currency,
    verifiedProperty: expected.expectedProperty,
  };
}

export async function loadLiveFulfillmentSources({
  client,
  basket,
  country = "US",
  currency = "USD",
  catalog = FULFILLMENT_SOURCES,
}) {
  const neededSourceIds = new Set();
  if (BADGE_COMPONENT_KEYS.some((key) => basket.components[key] > 0)) neededSourceIds.add("cute-brooch-core");
  if (basket.components.kanto > 0) neededSourceIds.add("fly-meng-kanto");
  if (basket.components.evolution8 > 0) neededSourceIds.add("mocake-evolution8");

  const sourceEntries = [...neededSourceIds].map((sourceId) => [sourceId, catalog[sourceId]]);
  const payloadEntries = await Promise.all(sourceEntries.map(async ([sourceId, source]) => [
    sourceId,
    await client.getProduct(source.productId, { country, currency, language: "EN" }),
  ]));
  const payloads = Object.fromEntries(payloadEntries);

  return Object.fromEntries(sourceEntries.map(([sourceId, source]) => {
    const liveSkus = extractProductSkus(payloads[sourceId], source.productId);
    const variants = Object.fromEntries(
      Object.entries(source.variants)
        .filter(([component]) => basket.components[component] > 0)
        .map(([component, expected]) => [
          component,
          validateLiveVariant(source, expected, liveSkus, currency),
        ]),
    );
    return [sourceId, { ...source, variants }];
  }));
}

function allocationKey(allocation) {
  return Object.entries(allocation)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, counts]) => `${sourceId}:${COMPONENT_KEYS.map((key) => counts[key] || 0).join(",")}`)
    .join("|");
}

function addCount(allocation, sourceId, component, quantity) {
  if (!quantity) return;
  allocation[sourceId] ||= emptyComponentCounts();
  allocation[sourceId][component] += quantity;
}

export function enumerateFulfillmentAllocations(basket) {
  const results = [];
  const seen = new Set();
  const add = (strategy, kantoMode) => {
    const allocation = {};
    for (const component of BADGE_COMPONENT_KEYS) {
      const quantity = basket.components[component];
      if (!quantity) continue;
      if (component !== "kanto" || kantoMode === "core") {
        addCount(allocation, "cute-brooch-core", component, quantity);
      } else if (kantoMode === "alternative") {
        addCount(allocation, "fly-meng-kanto", component, quantity);
      } else {
        const collectorQuantity = Math.min(basket.collectorPacks, quantity);
        addCount(allocation, "cute-brooch-core", component, collectorQuantity);
        addCount(allocation, "fly-meng-kanto", component, quantity - collectorQuantity);
      }
    }
    addCount(allocation, "mocake-evolution8", "evolution8", basket.components.evolution8);
    const key = allocationKey(allocation);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ strategy, allocation });
    }
  };

  add("all-core-badges", "core");
  if (basket.components.kanto > 0) add("kanto-price-alternative", "alternative");
  if (basket.collectorPacks > 0 && basket.components.kanto > basket.collectorPacks) {
    add("collector-core-extra-kanto-alternative", "extra-only");
  }
  return results;
}

function packageFromAllocation(source, counts) {
  const items = COMPONENT_KEYS
    .filter((component) => counts[component] > 0)
    .map((component) => {
      const variant = source.variants[component];
      if (!variant) {
        throw new AliExpressBusinessApiError("A fulfillment allocation references an unavailable approved variant.", {
          sourceId: source.sourceId,
          component,
        });
      }
      return {
        component,
        label: COMPONENT_LABELS[component],
        quantity: counts[component],
        productId: source.productId,
        skuId: variant.skuId,
        skuAttr: variant.skuAttr,
        skuAttrWithLabel: variant.skuAttrWithLabel,
        verifiedProperty: variant.verifiedProperty,
        unitPrice: variant.unitPrice,
        availableStock: variant.availableStock,
        currency: variant.currency,
      };
    });
  return {
    sourceId: source.sourceId,
    storeName: source.storeName,
    storeId: source.storeId,
    productId: source.productId,
    shipFromCountry: source.shipFromCountry,
    items,
    itemQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    itemSubtotal: roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)),
  };
}

function chooseFreightOption(options, policy) {
  const currencyMatches = options.filter((option) => option.currency === policy.currency);
  const tracked = currencyMatches.filter((option) => option.trackingAvailable);
  const eligible = policy.requireTrackedShipping ? tracked : currencyMatches;
  return eligible.sort((left, right) => left.amount - right.amount)[0] || null;
}

async function quoteWithCache(client, request, cache) {
  const key = JSON.stringify(request);
  if (!cache.has(key)) {
    cache.set(key, (async () => extractFreightOptions(await client.calculateFreight(request)))());
  }
  return cache.get(key);
}

async function quotePackage(client, pkg, country, policy, cache) {
  const failures = [];
  for (const probe of pkg.items) {
    try {
      const options = await quoteWithCache(client, {
        country,
        productId: pkg.productId,
        skuId: probe.skuId,
        quantity: pkg.itemQuantity,
        price: pkg.itemSubtotal,
        currency: policy.currency,
        shipFromCountry: pkg.shipFromCountry,
      }, cache);
      const selected = chooseFreightOption(options, policy);
      if (selected) return { ...selected, probeComponent: probe.component, quoteSource: "live-api" };
      failures.push(`${probe.component}: no eligible ${policy.currency} shipping option`);
    } catch (error) {
      failures.push(`${probe.component}: ${error.message}`);
    }
  }
  throw new AliExpressBusinessApiError("No live freight quote was available for a proposed supplier package.", {
    sourceId: pkg.sourceId,
    failures,
  });
}

async function evaluateAllocation({ allocation, strategy }, { client, sources, country, policy, freightCache }) {
  const packages = Object.entries(allocation).map(([sourceId, counts]) => {
    const source = sources[sourceId];
    if (!source) {
      throw new AliExpressBusinessApiError("A fulfillment plan references a source that was not loaded.", { sourceId });
    }
    return packageFromAllocation(source, counts);
  });
  const stockFailures = packages.flatMap((pkg) => pkg.items
    .filter((item) => item.availableStock < item.quantity)
    .map((item) => ({
      sourceId: pkg.sourceId,
      component: item.component,
      requested: item.quantity,
      available: item.availableStock,
    })));
  if (stockFailures.length) {
    return { strategy, eligible: false, packageCount: packages.length, rejection: "insufficient-stock", stockFailures };
  }

  try {
    const quotedPackages = await Promise.all(packages.map(async (pkg) => ({
      ...pkg,
      shipping: await quotePackage(client, pkg, country, policy, freightCache),
    })));
    const itemSubtotal = roundMoney(quotedPackages.reduce((sum, pkg) => sum + pkg.itemSubtotal, 0));
    const shippingTotal = roundMoney(quotedPackages.reduce((sum, pkg) => sum + pkg.shipping.amount, 0));
    return {
      strategy,
      eligible: true,
      packageCount: quotedPackages.length,
      itemSubtotal,
      shippingTotal,
      quotedSubtotalBeforeTax: roundMoney(itemSubtotal + shippingTotal),
      currency: policy.currency,
      packages: quotedPackages,
    };
  } catch (error) {
    return {
      strategy,
      eligible: false,
      packageCount: packages.length,
      rejection: "freight-quote-unavailable",
      details: error.details || {},
    };
  }
}

export function selectFulfillmentPlan(candidates, policy = DEFAULT_DRAFT_POLICY) {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  if (!eligible.length) return { selected: null, reason: "no-eligible-plan", comparison: null };
  const byCost = [...eligible].sort((left, right) => (
    left.quotedSubtotalBeforeTax - right.quotedSubtotalBeforeTax
    || left.packageCount - right.packageCount
    || left.strategy.localeCompare(right.strategy)
  ));
  const lowestCost = byCost[0];
  const minimumPackageCount = Math.min(...eligible.map((candidate) => candidate.packageCount));
  const bestConsolidated = byCost.find((candidate) => candidate.packageCount === minimumPackageCount);
  const extraPackages = lowestCost.packageCount - minimumPackageCount;
  const savings = roundMoney(bestConsolidated.quotedSubtotalBeforeTax - lowestCost.quotedSubtotalBeforeTax);
  const requiredSavings = roundMoney(extraPackages * policy.minSavingsPerExtraPackageUsd);

  if (extraPackages > 0 && savings < requiredSavings) {
    return {
      selected: bestConsolidated,
      reason: "consolidation-preferred",
      comparison: {
        cheaperStrategy: lowestCost.strategy,
        actualSavings: savings,
        requiredSavings,
        avoidedExtraPackages: extraPackages,
      },
    };
  }
  return {
    selected: lowestCost,
    reason: extraPackages > 0 ? "material-split-savings" : "lowest-cost-at-best-package-count",
    comparison: {
      consolidatedStrategy: bestConsolidated.strategy,
      actualSavings: Math.max(0, savings),
      requiredSavings,
      extraPackages: Math.max(0, extraPackages),
    },
  };
}

function normalizedOrderName(value) {
  const name = String(value || "").trim();
  return name.startsWith("#") ? name : `#${name}`;
}

function statusBlockers(order) {
  const blockers = [];
  if (order.cancelledAt) blockers.push("Shopify order is cancelled");
  const financial = String(order.displayFinancialStatus || order.financial || "").toUpperCase();
  if (financial && financial !== "PAID" && financial !== "PARTIALLY_REFUNDED") {
    blockers.push(`Shopify financial status is ${financial}, not PAID`);
  }
  const fulfillment = String(order.displayFulfillmentStatus || order.fulfillment || "").toUpperCase();
  if (fulfillment === "FULFILLED") blockers.push("Shopify order is already fulfilled");
  return blockers;
}

function redactedAddressReadiness(order) {
  const address = order.shippingAddress || order.address || {};
  const required = {
    name: Boolean([address.firstName, address.lastName].filter(Boolean).join(" ").trim() || address.name),
    address1: Boolean(address.address1),
    city: Boolean(address.city),
    province: Boolean(address.provinceCode || address.province),
    country: Boolean(address.countryCodeV2 || address.countryCode || address.country),
    postalCode: Boolean(address.zip),
    phone: Boolean(address.phone),
  };
  return {
    country: address.countryCodeV2 || address.countryCode || null,
    province: address.provinceCode || null,
    fieldsPresent: required,
    ready: ["name", "address1", "city", "province", "country", "postalCode"]
      .every((key) => required[key]),
  };
}

function productItemsForPlan(plan, orderName) {
  return plan.packages.flatMap((pkg) => pkg.items.map((item) => {
    const productId = Number(item.productId ?? pkg.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new AliExpressBusinessApiError("A selected fulfillment item is missing a valid AliExpress product ID.", {
        sourceId: pkg.sourceId,
        component: item.component,
      });
    }
    return {
      product_count: item.quantity,
      product_id: productId,
      sku_attr: item.skuAttr,
      logistics_service_name: pkg.shipping.serviceName,
      order_memo: `Zenkai Shopify ${orderName}`,
    };
  }));
}

function publicCandidate(candidate) {
  if (!candidate.eligible) return candidate;
  return {
    strategy: candidate.strategy,
    eligible: true,
    packageCount: candidate.packageCount,
    itemSubtotal: candidate.itemSubtotal,
    shippingTotal: candidate.shippingTotal,
    quotedSubtotalBeforeTax: candidate.quotedSubtotalBeforeTax,
    currency: candidate.currency,
    packages: candidate.packages.map((pkg) => ({
      sourceId: pkg.sourceId,
      storeName: pkg.storeName,
      storeId: pkg.storeId,
      productId: pkg.productId,
      itemSubtotal: pkg.itemSubtotal,
      shipping: pkg.shipping,
      items: pkg.items.map((item) => ({
        component: item.component,
        label: item.label,
        quantity: item.quantity,
        productId: item.productId ?? pkg.productId,
        skuId: item.skuId,
        skuAttr: item.skuAttr,
        skuAttrWithLabel: item.skuAttrWithLabel,
        verifiedProperty: item.verifiedProperty,
        unitPrice: item.unitPrice,
        availableStock: item.availableStock,
      })),
    })),
  };
}

export async function buildOrderDraft({
  order,
  client,
  sources,
  policy = DEFAULT_DRAFT_POLICY,
  freightCache = new Map(),
}) {
  const basket = classifyShopifyOrder(order);
  const blockers = statusBlockers(order);
  if (!COMPONENT_KEYS.some((key) => basket.components[key] > 0)) {
    blockers.push("No approved AliExpress-managed components were found");
  }
  if (basket.unsupportedLines.length) blockers.push("Order contains lines outside the approved AliExpress mapping");
  const address = redactedAddressReadiness(order);
  if (!address.ready) blockers.push("Shipping address is missing a required AliExpress draft field");
  const orderName = normalizedOrderName(order.name);
  const country = address.country;

  const allocations = enumerateFulfillmentAllocations(basket);
  const candidates = blockers.length
    ? []
    : await Promise.all(allocations.map((allocation) => evaluateAllocation(allocation, {
      client,
      sources,
      country,
      policy,
      freightCache,
    })));
  const decision = selectFulfillmentPlan(candidates, policy);
  if (!decision.selected && !blockers.length) blockers.push("No candidate had sufficient stock and a live tracked freight quote");

  const selected = decision.selected ? publicCandidate(decision.selected) : null;
  const productItems = decision.selected ? productItemsForPlan(decision.selected, orderName) : [];
  const fingerprint = decision.selected
    ? createHash("sha256").update(JSON.stringify({
      shopifyOrderId: order.id,
      shopifyOrderName: orderName,
      shippingAddress: order.shippingAddress || order.address || null,
      productItems,
      quotedSubtotalBeforeTax: decision.selected.quotedSubtotalBeforeTax,
      packageQuotes: decision.selected.packages.map((pkg) => ({
        sourceId: pkg.sourceId,
        shippingService: pkg.shipping.serviceName,
        shippingAmount: pkg.shipping.amount,
      })),
    })).digest("hex")
    : null;

  return {
    shopifyOrder: {
      id: order.id || null,
      name: orderName,
      createdAt: order.createdAt || null,
      financialStatus: order.displayFinancialStatus || order.financial || null,
      fulfillmentStatus: order.displayFulfillmentStatus || order.fulfillment || null,
    },
    basket,
    shippingAddress: address,
    approvalState: blockers.length ? "blocked" : "pending-user-approval",
    blockers,
    decision: {
      reason: decision.reason,
      comparison: decision.comparison,
      selected,
      alternatives: candidates
        .filter((candidate) => candidate !== decision.selected)
        .map(publicCandidate),
    },
    placeOrderPayloadPreview: decision.selected ? {
      requestField: "param_place_order_request4_open_api_d_t_o",
      logisticsAddress: "[validated in memory; redacted from output]",
      product_items: productItems,
    } : null,
    draftFingerprint: fingerprint,
    warnings: [
      "Item and shipping prices are live estimates before tax, coupons, or final AliExpress checkout adjustments.",
      "AliExpress delivery-time values are preserved exactly as returned by the freight API.",
      ...(!address.fieldsPresent.phone
        ? ["Shopify has no phone for this order. The configured Zenkai fallback phone will be sent to AliExpress."]
        : []),
      "No AliExpress order has been placed; this draft requires explicit user approval and a separate mutation workflow.",
    ],
  };
}

function normalizePhone(phone, country) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return { ...MISSING_PHONE_FALLBACK };
  const countryDigits = PHONE_COUNTRY_CODES[country];
  if (!countryDigits) return { phone_country: "", mobile_no: digits };
  return {
    phone_country: `+${countryDigits}`,
    mobile_no: digits.startsWith(countryDigits) ? digits.slice(countryDigits.length) : digits,
  };
}

function normalizeAliExpressCity(source, country) {
  const city = String(source.city || "").trim();
  const province = String(source.provinceCode || source.province || "").trim().toUpperCase();
  const postalCode = String(source.zip || source.postalCode || "").trim().toUpperCase();
  const key = [country, province, postalCode, city.toUpperCase()].join("|");
  return ALIEXPRESS_CITY_ALIASES[key] || city;
}

export function buildSensitivePlaceOrderPayload(order, selectedPlan) {
  if (!selectedPlan?.packages?.length) {
    throw new AliExpressBusinessApiError("A selected fulfillment plan is required to build an order payload.");
  }
  const source = order.shippingAddress || order.address || {};
  const country = String(source.countryCodeV2 || source.countryCode || source.country || "").toUpperCase();
  const fullName = [source.firstName, source.lastName].filter(Boolean).join(" ").trim() || source.name || "";
  const phone = normalizePhone(source.phone, country);
  const city = normalizeAliExpressCity(source, country);
  const logisticsAddressWithOptionalFields = {
    full_name: fullName,
    contact_person: fullName,
    country,
    province: source.province || source.provinceCode || "",
    city,
    address: source.address1 || "",
    address2: source.address2 || "",
    zip: source.zip || "",
    locale: country === "US" ? "en_US" : "en",
    ...phone,
  };
  const missing = Object.entries(logisticsAddressWithOptionalFields)
    .filter(([key, value]) => ["full_name", "country", "province", "city", "address", "zip"].includes(key) && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new AliExpressBusinessApiError("Shipping address is incomplete for an AliExpress place-order payload.", { missing });
  }
  const logisticsAddress = Object.fromEntries(
    Object.entries(logisticsAddressWithOptionalFields).filter(([, value]) => value !== "" && value !== null),
  );
  return {
    logistics_address: logisticsAddress,
    product_items: productItemsForPlan(selectedPlan, normalizedOrderName(order.name)),
  };
}

export const draftPlannerInternals = {
  chooseFreightOption,
  normalizeAliExpressCity,
  packageFromAllocation,
  propertyMatches,
  roundMoney,
};
