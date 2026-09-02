import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AliExpressOAuthClient, signRestRequest } from "./iop-client.mjs";
import {
  AUTHORIZATION_CODE_MAX_AGE_MS,
  buildAuthorizationUrl,
  OAuthValidationError,
  parseAuthorizationRedirect,
  tokenMetadata,
  ZENKAI_CALLBACK_URL,
} from "./oauth.mjs";
import {
  AliExpressBusinessApiError,
  AliExpressBusinessClient,
  extractFreightOptions,
  extractPlaceOrderResult,
  extractProductSkus,
  signTopRequest,
  summarizeSimpleProduct,
} from "./top-client.mjs";
import {
  buildOrderDraft,
  buildSensitivePlaceOrderPayload,
  classifyShopifyOrder,
  selectFulfillmentPlan,
} from "./draft-planner.mjs";
import {
  DEFAULT_DRAFT_POLICY,
  FULFILLMENT_SOURCES,
} from "./fulfillment-catalog.mjs";
import { defaultLedgerPath, OrderPlacementLedger } from "./order-ledger.mjs";
import {
  DashboardActionError,
  dashboardServiceInternals,
  discoverDashboardOrderNames,
  markDashboardOrderHandled,
  placeUnpaidAliExpressOrder,
  prepareBrowserCouponCheckout,
  prepareDashboardOrders,
} from "./dashboard-service.mjs";
import { createDashboardServer } from "./dashboard-server.mjs";
import { fetchShopifyOrdersForAliExpressReview } from "./shopify-orders.mjs";
import { couponForEligibleSubtotal } from "./coupon-policy.mjs";
import {
  BrowserCheckoutJobStore,
  buildBrowserCheckoutJob,
} from "./browser-checkout-jobs.mjs";
import {
  ZENKAI_BROWSER_EXTENSION_ORIGIN,
  ZENKAI_BROWSER_EXTENSION_TOKEN,
} from "./browser-extension-config.mjs";

test("default placement ledger stays in ignored bridge-local state", () => {
  assert.equal(defaultLedgerPath({}), join(dirname(fileURLToPath(import.meta.url)), ".local-state", "placement-ledger.json"));
  assert.equal(defaultLedgerPath({ ZENKAI_ALIEXPRESS_LEDGER_PATH: "/tmp/custom-ledger.json" }), "/tmp/custom-ledger.json");
});

test("dashboard placement is one deliberate click without typed confirmation", async () => {
  const html = await readFile(new URL("./dashboard/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("./dashboard/app.js", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("./dashboard/bootstrap.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<dialog|confirmation-input|Type <strong/);
  assert.match(script, /confirmation: order\.confirmationPhrase/);
  assert.doesNotMatch(script, /openConfirmation|confirmationInput/);
  assert.match(script, /API cannot select coupons/);
  assert.match(script, /Clear cart & prepare/);
  assert.match(script, /prepareBrowserCheckout/);
  assert.match(script, /Paid · awaiting shipment/);
  assert.match(script, /Clear as handled/);
  assert.match(script, /\/api\/mark-handled/);
  assert.match(bootstrap, /location\.protocol === "file:"/);
  assert.match(bootstrap, /http:\/\/127\.0\.0\.1:4317\//);
});

test("existing-browser checkout uses stable AliExpress address and promo hooks and never submits payment", async () => {
  const script = await readFile(new URL("./browser-extension/background.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("./browser-extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, "1.0.19");
  assert.match(script, /cart-header-checkbox input\[type='checkbox'\]/);
  assert.match(script, /cart-header-delete-btn/);
  assert.match(script, /confirmCartEmptyInPage/);
  assert.match(script, /checkoutCount\(\) === expectedUnitCount/);
  assert.match(script, /select all\(\?: items\)\?/i);
  assert.match(script, /waitForCheckoutTab/);
  assert.match(script, /\/\\\/p\\\/trade\\\/confirm\\\.html/);
  assert.match(script, /const addressAction = await waitFor/);
  assert.match(script, /enter manually/i);
  assert.match(script, /input\.main-part/);
  assert.match(script, /input\.pre-part/);
  assert.match(script, /phoneCountryDigits/);
  assert.match(script, /\\bunit\\b/);
  assert.match(script, /activateManualTarget/);
  assert.match(script, /elementsFromPoint/);
  assert.match(script, /uniqueManualTargets/);
  assert.match(script, /MouseEvent\("mousedown"/);
  assert.match(script, /chooseFromSelectRoot/);
  assert.match(script, /provinceStable/);
  assert.match(script, /cityStable/);
  assert.match(script, /finalAddressInputs/);
  assert.match(script, /textValuesPersisted/);
  assert.match(script, /20001/);
  assert.match(script, /data-pl='pl-address-change'/);
  assert.match(script, /findDefaultAddressEdit/);
  assert.match(script, /button, a, div, span, p, label/);
  assert.match(script, /Saved addresses exist.*No new address was added/);
  assert.match(script, /selected\/default shipping-address Edit control/);
  assert.match(script, /expectedAddressEntry/);
  assert.match(script, /addressEntryIsSelected/);
  assert.match(script, /activateAddressSelection/);
  assert.match(script, /elementsFromPoint\(modalRect\.right - 32/);
  assert.match(script, /chooseEditedAddress/);
  assert.match(script, /expectedPostalBase/);
  assert.match(script, /promoCodeRow/);
  assert.match(script, /currentPromoRow/);
  assert.match(script, /promoInputBesideApply/);
  assert.match(script, /expandedPromoControls/);
  assert.match(script, /_valueTracker/);
  assert.match(script, /KeyboardEvent\("keydown"/);
  assert.doesNotMatch(script, /let couponInput = promoInputIn\(\);/);
  assert.doesNotMatch(script, /promoInputIn\(currentRow \|\| document\)/);
  assert.match(script, /input\[placeholder='Enter'\]/);
  assert.match(script, /\[contenteditable=true\]/);
  assert.match(script, /fillCouponControl/);
  assert.match(script, /execCommand\?\.\("insertText"/);
  assert.match(script, /did not retain/);
  assert.match(script, /Enter control beside Promo codes/);
  assert.match(script, /input\[type=radio\]/);
  assert.match(script, /did not select.*edited address/);
  assert.match(script, /\.add-address/);
  assert.match(script, /\.deliver-address-form/);
  assert.match(script, /aria-label='coupon code input'/);
  assert.match(script, /promoCodeApplyRetVO\.usePromoCodeStatus/);
  assert.doesNotMatch(script, /\.click\(\).*pay now|\.click\(\).*place order/i);
});

test("coupon policy selects the highest eligible configured AliExpress code", () => {
  assert.equal(couponForEligibleSubtotal(14.99), null);
  assert.equal(couponForEligibleSubtotal(15).code, "LDUS02");
  assert.equal(couponForEligibleSubtotal(29.99).code, "LDUS02");
  assert.equal(couponForEligibleSubtotal(30).code, "LDUS04");
  assert.equal(couponForEligibleSubtotal(30).discountAmount, 4);
  assert.equal(couponForEligibleSubtotal(50, "EUR"), null);
});

test("AliExpress read retry uses bounded backoff only for transient read failures", async () => {
  let calls = 0;
  const delays = [];
  const value = await dashboardServiceInternals.aliExpressReadWithRetry(async () => {
    calls += 1;
    if (calls < 3) throw new AliExpressBusinessApiError("Could not reach the AliExpress API.");
    return "ready";
  }, {
    waitImpl: async (delay) => delays.push(delay),
  });
  assert.equal(value, "ready");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [200, 400]);

  calls = 0;
  await assert.rejects(() => dashboardServiceInternals.aliExpressReadWithRetry(async () => {
    calls += 1;
    throw new AliExpressBusinessApiError("An approved SKU property changed; manual review is required.");
  }, {
    waitImpl: async () => assert.fail("Non-transient validation failures must not be retried."),
  }), /property changed/i);
  assert.equal(calls, 1);
});

test("buildAuthorizationUrl creates the documented server-side OAuth URL", () => {
  const value = buildAuthorizationUrl({ appKey: "123456", state: "state-value" });
  const url = new URL(value);
  assert.equal(url.origin + url.pathname, "https://api-sg.aliexpress.com/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("force_auth"), "true");
  assert.equal(url.searchParams.get("redirect_uri"), ZENKAI_CALLBACK_URL);
  assert.equal(url.searchParams.get("client_id"), "123456");
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("parseAuthorizationRedirect returns only a code after callback and state validation", () => {
  const now = 1_800_000_000_000;
  const pending = { state: "random-state", createdAt: now - 1_000 };
  const redirect = `${ZENKAI_CALLBACK_URL}?code=short-lived-code&state=random-state`;
  assert.equal(parseAuthorizationRedirect(redirect, pending, { now }), "short-lived-code");
});

test("parseAuthorizationRedirect rejects callback, state, and age mismatches", () => {
  const now = 1_800_000_000_000;
  const pending = { state: "expected", createdAt: now - 1_000 };
  assert.throws(
    () => parseAuthorizationRedirect("https://example.com/?code=x&state=expected", pending, { now }),
    OAuthValidationError,
  );
  assert.throws(
    () => parseAuthorizationRedirect(`${ZENKAI_CALLBACK_URL}?code=x&state=wrong`, pending, { now }),
    /state did not match/i,
  );
  assert.throws(
    () => parseAuthorizationRedirect(
      `${ZENKAI_CALLBACK_URL}?code=x&state=expected`,
      { ...pending, createdAt: now - AUTHORIZATION_CODE_MAX_AGE_MS - 1 },
      { now },
    ),
    /too old/i,
  );
});

test("signRestRequest sorts parameters and prefixes the API path", () => {
  const parameters = {
    timestamp: "1517820392000",
    sign_method: "sha256",
    app_key: "123456",
    code: "oauth-code",
  };
  const canonical = "/auth/token/createapp_key123456codeoauth-codesign_methodsha256timestamp1517820392000";
  const expected = createHmac("sha256", "helloworld").update(canonical).digest("hex").toUpperCase();
  assert.equal(signRestRequest("/auth/token/create", parameters, "helloworld"), expected);
});

test("AliExpressOAuthClient sends a signed create-token request and returns tokens", async () => {
  let requestedUrl;
  const client = new AliExpressOAuthClient({
    appKey: "123456",
    appSecret: "secret",
    now: () => 1_800_000_000_000,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      assert.equal(options.method, "GET");
      return new Response(JSON.stringify({
        access_token: "access-value",
        refresh_token: "refresh-value",
        expires_in: 2_592_000,
        refresh_expires_in: 5_184_000,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await client.createToken("authorization-value");
  assert.equal(result.access_token, "access-value");
  assert.equal(requestedUrl.pathname, "/rest/auth/token/create");
  assert.equal(requestedUrl.searchParams.get("app_key"), "123456");
  assert.equal(requestedUrl.searchParams.get("code"), "authorization-value");
  assert.equal(requestedUrl.searchParams.get("sign_method"), "sha256");
  assert.match(requestedUrl.searchParams.get("sign"), /^[A-F0-9]{64}$/);
  assert.equal(requestedUrl.searchParams.has("app_secret"), false);
});

test("tokenMetadata calculates expiries without retaining tokens or account data", () => {
  const now = Date.parse("2026-08-30T00:00:00.000Z");
  const metadata = tokenMetadata({
    access_token: "do-not-store-here",
    refresh_token: "do-not-store-here-either",
    account: "private@example.com",
    expires_in: 60,
    refresh_expires_in: 120,
  }, { now });
  assert.deepEqual(metadata, {
    issuedAt: "2026-08-30T00:00:00.000Z",
    accessExpiresAt: "2026-08-30T00:01:00.000Z",
    refreshExpiresAt: "2026-08-30T00:02:00.000Z",
  });
});

test("signTopRequest signs ASCII-sorted TOP parameters without a path prefix", () => {
  const parameters = {
    v: "2.0",
    method: "aliexpress.offer.ds.product.simplequery",
    app_key: "123456",
    access_token: "access",
    timestamp: "1800000000000",
    sign_method: "sha256",
    format: "json",
    product_id: "3256808918476308",
  };
  const canonical = Object.keys(parameters).sort().map((key) => `${key}${parameters[key]}`).join("");
  const expected = createHmac("sha256", "secret").update(canonical).digest("hex").toUpperCase();
  assert.equal(signTopRequest(parameters, "secret"), expected);
});

test("AliExpressBusinessClient blocks unsupported methods", async () => {
  const client = new AliExpressBusinessClient({
    appKey: "123456",
    appSecret: "secret",
    accessToken: "access",
    fetchImpl: async () => {
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(
    () => client.call("unknown.external.method", {}),
    (error) => error instanceof AliExpressBusinessApiError && /Unsupported/.test(error.message),
  );
});

test("AliExpressBusinessClient requires explicit confirmation for place-order mutations", async () => {
  let fetchCalls = 0;
  let writeRequest;
  const client = new AliExpressBusinessClient({
    appKey: "123456",
    appSecret: "secret",
    accessToken: "access",
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      writeRequest = { url: new URL(url), options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await assert.rejects(
    () => client.call("aliexpress.trade.buy.placeorder", { order_payload: "test" }),
    (error) => error instanceof AliExpressBusinessApiError && /requires explicit confirmation/.test(error.message),
  );
  assert.equal(fetchCalls, 0);
  await client.call(
    "aliexpress.trade.buy.placeorder",
    { order_payload: "test" },
    { confirmMutation: true },
  );
  assert.equal(fetchCalls, 1);
  assert.equal(writeRequest.options.method, "POST");
  assert.equal(writeRequest.url.search, "");
  assert.equal(writeRequest.options.body.get("method"), "aliexpress.trade.buy.placeorder");
  assert.equal(writeRequest.options.body.get("access_token"), "access");
});

test("AliExpressBusinessClient blocks a place-order payload with a missing product_id before fetch", async () => {
  let fetchCalls = 0;
  const client = new AliExpressBusinessClient({
    appKey: "123456",
    appSecret: "secret",
    accessToken: "access",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(() => client.placeOrder({
    logistics_address: { address: "123 Test Street" },
    product_items: [{ product_count: 1, sku_attr: "14:123" }],
  }, { confirmMutation: true }), /requires a valid product_id/i);
  assert.equal(fetchCalls, 0);
});

test("AliExpressBusinessClient calls the signed product-read endpoint", async () => {
  let requestedUrl;
  const client = new AliExpressBusinessClient({
    appKey: "123456",
    appSecret: "secret",
    accessToken: "access",
    now: () => 1_800_000_000_000,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      assert.equal(options.method, "GET");
      return new Response(JSON.stringify({
        aliexpress_offer_ds_product_simplequery_response: {
          product_status_type: "onSelling",
          total_available_stock: 12,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  await client.getSimpleProduct("3256808918476308");
  assert.equal(requestedUrl.origin + requestedUrl.pathname, "https://api-sg.aliexpress.com/sync");
  assert.equal(requestedUrl.searchParams.get("method"), "aliexpress.offer.ds.product.simplequery");
  assert.equal(requestedUrl.searchParams.get("access_token"), "access");
  assert.equal(requestedUrl.searchParams.get("product_id"), "3256808918476308");
  assert.match(requestedUrl.searchParams.get("sign"), /^[A-F0-9]{64}$/);
  assert.equal(requestedUrl.searchParams.has("app_secret"), false);
});

test("summarizeSimpleProduct emits inventory and price aggregates without raw SKU data", () => {
  const summary = summarizeSimpleProduct({
    aliexpress_offer_ds_product_simplequery_response: {
      item_offer_site_sale_price: "8.50",
      total_available_stock: 8,
      product_status_type: "onSelling",
      aeop_ae_product_s_k_us: {
        aeop_ae_product_sku: [
          { sku_stock: true, offer_sale_price: "8.50", currency_code: "USD" },
          { sku_stock: false, s_k_u_available_stock: 0, offer_sale_price: "10.00", currency_code: "USD" },
        ],
      },
    },
  }, "3256808918476308");
  assert.deepEqual(summary, {
    ok: true,
    readOnly: true,
    method: "aliexpress.offer.ds.product.simplequery",
    productId: "3256808918476308",
    productStatus: "onSelling",
    totalAvailableStock: 8,
    siteSalePrice: "8.50",
    skuCount: 2,
    inStockSkuCount: 1,
    currencyCodes: ["USD"],
    skuSalePriceRange: { min: 8.5, max: 10 },
  });
  assert.equal("aeop_ae_product_s_k_us" in summary, false);
});

test("AliExpressBusinessClient includes the exact large numeric SKU string in freight requests", async () => {
  let requestDto;
  const client = new AliExpressBusinessClient({
    appKey: "123456",
    appSecret: "secret",
    accessToken: "access",
    now: () => 1_800_000_000_000,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requestDto = JSON.parse(parsed.searchParams.get("param_aeop_freight_calculate_for_buyer_d_t_o"));
      return new Response(JSON.stringify({
        aliexpress_logistics_buyer_freight_calculate_response: {
          result: {
            success: true,
            aeop_freight_calculate_result_for_buyer_d_t_o_list: {
              aeop_freight_calculate_result_for_buyer_dto: [],
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  await client.calculateFreight({
    country: "US",
    productId: "1005012262514551",
    skuId: "12000057909764251",
    quantity: 2,
    price: 13.6,
  });
  assert.equal(requestDto.product_id, "1005012262514551");
  assert.equal(requestDto.sku_id, "12000057909764251");
  assert.equal(requestDto.product_num, 2);
  assert.equal(requestDto.price, "13.60");
});

test("detailed-product and freight parsers retain exact SKU identity and tracked service", () => {
  const skus = extractProductSkus({
    aliexpress_ds_product_get_response: {
      result: {
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: [{
            id: "200001033:200003762#9",
            sku_id: "12000057340465797",
            sku_available_stock: 15,
            offer_sale_price: "6.67",
            ae_sku_property_dtos: {
              ae_sku_property_d_t_o: [{
                sku_property_name: "Metal color",
                sku_property_value: "Antique Bronze Plated",
                property_value_definition_name: "9",
                sku_property_id: 200001033,
                property_value_id: 200003762,
              }],
            },
          }],
        },
      },
    },
  }, "1005012035965982");
  assert.equal(skus[0].skuAttr, "200001033:200003762");
  assert.equal(skus[0].skuAttrWithLabel, "200001033:200003762#9");
  assert.equal(skus[0].properties[0].definition, "9");

  const freight = extractFreightOptions({
    aliexpress_logistics_buyer_freight_calculate_response: {
      result: {
        success: true,
        aeop_freight_calculate_result_for_buyer_d_t_o_list: {
          aeop_freight_calculate_result_for_buyer_dto: [{
            error_code: 0,
            service_name: "CAINIAO_FULFILLMENT_STD",
            estimated_delivery_time: "75",
            tracking_available: "true",
            freight: { amount: 1.99, currency_code: "USD" },
          }],
        },
      },
    },
  });
  assert.deepEqual(freight, [{
    serviceName: "CAINIAO_FULFILLMENT_STD",
    estimatedDeliveryTime: "75",
    trackingAvailable: true,
    amount: 1.99,
    currency: "USD",
  }]);
});

function fakeAddress() {
  return {
    firstName: "Test",
    lastName: "Buyer",
    address1: "123 Test Street",
    address2: "Unit 4",
    city: "Phoenix",
    province: "Arizona",
    provinceCode: "AZ",
    country: "United States",
    countryCodeV2: "US",
    zip: "85001",
    phone: "+16025550199",
  };
}

function fakeOrder(name, lines) {
  return {
    id: `gid://shopify/Order/${name.replace(/\D/g, "")}`,
    name: `#${name}`,
    createdAt: "2026-08-30T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    shippingAddress: fakeAddress(),
    lineItems: {
      nodes: lines.map((line, index) => ({
        id: `line-${index}`,
        quantity: 1,
        fulfillableQuantity: 1,
        requiresShipping: true,
        ...line,
      })),
    },
  };
}

function liveSource(sourceId, prices) {
  const source = FULFILLMENT_SOURCES[sourceId];
  return {
    ...source,
    variants: Object.fromEntries(Object.entries(source.variants).map(([component, variant]) => [
      component,
      {
        ...variant,
        unitPrice: prices[component],
        availableStock: 100,
        currency: "USD",
        verifiedProperty: variant.expectedProperty,
      },
    ])),
  };
}

function fakeSources({ flyKanto = 4.77 } = {}) {
  return {
    "cute-brooch-core": liveSource("cute-brooch-core", {
      kanto: 6.61,
      johto: 6.67,
      hoenn: 6.8,
      sinnoh: 6.73,
    }),
    "fly-meng-kanto": liveSource("fly-meng-kanto", { kanto: flyKanto }),
    "mocake-evolution8": liveSource("mocake-evolution8", { evolution8: 6.67 }),
  };
}

function fakeFreightClient() {
  return {
    async calculateFreight() {
      return {
        aliexpress_logistics_buyer_freight_calculate_response: {
          result: {
            success: true,
            aeop_freight_calculate_result_for_buyer_d_t_o_list: {
              aeop_freight_calculate_result_for_buyer_dto: [{
                error_code: 0,
                service_name: "CAINIAO_FULFILLMENT_STD",
                estimated_delivery_time: "75",
                tracking_available: "true",
                freight: { amount: 1.99, currency_code: "USD" },
              }],
            },
          },
        },
      };
    },
  };
}

test("Shopify basket classification expands collector packs and locks E8 as its own component", () => {
  const order = fakeOrder("ZKTEST1", [
    { title: "Gym Badge Pin Set", variantTitle: "4 Regions (Collector's Pack)" },
    { title: "Gym Badge Pin Set", variantTitle: "Kanto" },
    { title: "Evolution Pin Set", variantTitle: "8-Pin Collection", sku: "ZK-EVOLUTION-PIN-8" },
  ]);
  assert.deepEqual(classifyShopifyOrder(order), {
    components: { kanto: 2, johto: 1, hoenn: 1, sinnoh: 1, evolution8: 1 },
    collectorPacks: 1,
    externalLines: [],
    unsupportedLines: [],
  });
});

test("Shopify basket classification surfaces Printify lines without blocking mapped AliExpress items", () => {
  const order = fakeOrder("ZKTESTMIXED", [
    { title: "Gym Badge Pin Set", variantTitle: "4 Regions (Collector's Pack)", vendor: "Zenkai Clothing" },
    { title: "Pallet Town Social Club Tee", variantTitle: "Solid Black / 2XL", vendor: "Printify" },
  ]);
  const basket = classifyShopifyOrder(order);
  assert.deepEqual(basket.components, { kanto: 1, johto: 1, hoenn: 1, sinnoh: 1, evolution8: 0 });
  assert.equal(basket.unsupportedLines.length, 0);
  assert.deepEqual(basket.externalLines, [{
    title: "Pallet Town Social Club Tee",
    variant: "Solid Black / 2XL",
    vendor: "Printify",
    quantity: 1,
  }]);
});

test("automatic Shopify discovery paginates paid open orders and stops at the configured order floor", async () => {
  const calls = [];
  const responsePages = [
    {
      shop: { name: "Zenkai Clothing", myshopifyDomain: "n1t6es-qx.myshopify.com" },
      orders: {
        pageInfo: { hasNextPage: true, endCursor: "page-2" },
        nodes: [
          { ...fakeOrder("ZK9002", []), phone: "+16025550111", billingAddress: null, customer: null, cancelledAt: null },
          {
            ...fakeOrder("ZK9001", []),
            shippingAddress: { ...fakeAddress(), phone: null },
            phone: null,
            billingAddress: { phone: "+16025550112" },
            customer: null,
            cancelledAt: null,
          },
        ],
      },
    },
    {
      shop: { name: "Zenkai Clothing", myshopifyDomain: "n1t6es-qx.myshopify.com" },
      orders: {
        pageInfo: { hasNextPage: true, endCursor: "page-3" },
        nodes: [
          { ...fakeOrder("ZK8999", []), phone: null, billingAddress: null, customer: null, cancelledAt: null },
        ],
      },
    },
  ];
  const client = {
    async query(_query, variables) {
      calls.push(variables);
      return { data: responsePages[calls.length - 1] };
    },
  };
  const orders = await fetchShopifyOrdersForAliExpressReview({
    client,
    minimumOrderNumber: 9000,
    pageSize: 2,
  });
  assert.deepEqual(orders.map((order) => order.name), ["#ZK9001", "#ZK9002"]);
  assert.equal(orders[0].shippingAddress.phone, "+16025550112");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].after, "page-2");
  assert.equal(calls[0].query, "financial_status:paid status:open");
});

test("automatic dashboard discovery skips placed, paid, and manually handled orders but keeps uncertain work visible", async () => {
  const candidates = [
    fakeOrder("ZK9101", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]),
    fakeOrder("ZK9102", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]),
    fakeOrder("ZK9103", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]),
    fakeOrder("ZK9104", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]),
    fakeOrder("ZK9105", [{ title: "A Tee", vendor: "Printify" }]),
    fakeOrder("ZK9106", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]),
  ];
  const entries = {
    "#ZK9102": { status: "placed-unpaid" },
    "#ZK9103": { status: "paid" },
    "#ZK9104": { status: "placement-uncertain" },
    "#ZK9106": { status: "handled-manually" },
  };
  const names = await discoverDashboardOrderNames({
    shopifyReader: async () => candidates,
    ledger: { async get(name) { return entries[name] || null; } },
  });
  assert.deepEqual(names, ["#ZK9101", "#ZK9104"]);
});

test("collector pack selects one core-store package after item plus shipping comparison", async () => {
  const order = fakeOrder("ZKTEST2", [
    { title: "Gym Badge Pin Set", variantTitle: "4 Regions (Collector's Pack)" },
  ]);
  const draft = await buildOrderDraft({ order, client: fakeFreightClient(), sources: fakeSources() });
  assert.equal(draft.approvalState, "pending-user-approval");
  assert.equal(draft.decision.selected.strategy, "all-core-badges");
  assert.equal(draft.decision.selected.packageCount, 1);
  assert.equal(draft.decision.selected.quotedSubtotalBeforeTax, 28.8);
  const split = draft.decision.alternatives.find((candidate) => candidate.strategy === "kanto-price-alternative");
  assert.equal(split.packageCount, 2);
  assert.equal(split.quotedSubtotalBeforeTax, 28.95);
});

test("browser-checkout job contains exact approved SKUs, address, cart-reset authority, and LDUS02", async () => {
  const order = fakeOrder("ZKCOUPON1", [
    { title: "Gym Badge Pin Set", variantTitle: "4 Regions (Collector's Pack)" },
  ]);
  const draft = await buildOrderDraft({ order, client: fakeFreightClient(), sources: fakeSources() });
  const job = buildBrowserCheckoutJob(order, draft.decision.selected, {
    id: "fixed-browser-job-id",
    now: () => new Date("2026-08-30T00:00:00.000Z"),
  });
  assert.equal(job.shopifyOrder.name, "#ZKCOUPON1");
  assert.equal(job.destructiveCartResetAuthorized, true);
  assert.equal(job.stopBeforePlaceOrder, true);
  assert.equal(job.expectedCoupon.code, "LDUS02");
  assert.equal(job.expectedCoupon.discountAmount, 2);
  assert.equal(job.items.length, 4);
  assert.ok(job.items.every((item) => item.productUrl.includes(`sku_id=${item.skuId}`)));
  assert.equal(job.shippingAddress.address1, "123 Test Street");
  assert.equal(job.shippingAddress.province, "Arizona");
  assert.equal(job.shippingAddress.mobileNumber, "6025550199");
});

test("existing-browser extension claims one private job and writes only redacted status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-extension-job-"));
  try {
    const store = new BrowserCheckoutJobStore({ directory });
    const job = {
      id: "extension-job-9007",
      shopifyOrder: { name: "#ZK9007" },
      expectedCoupon: { code: "LDUS02" },
      items: [
        { skuId: "sku-a", quantity: 1 },
        { skuId: "sku-b", quantity: 1 },
        { skuId: "sku-c", quantity: 1 },
        { skuId: "sku-d", quantity: 1 },
      ],
      shippingAddress: { address1: "123 Private Street" },
    };
    await store.create(job);
    const claimed = await store.claimNextJob();
    assert.deepEqual(claimed.items.map((item) => item.skuId), ["sku-a", "sku-b", "sku-c", "sku-d"]);
    await assert.rejects(() => readFile(store.jobPath(job.id), "utf8"), /ENOENT/);
    const running = await store.readStatus(job.id);
    assert.equal(running.status, "running");
    assert.equal("shippingAddress" in running, false);

    const ready = await store.updateStatus(job.id, {
      status: "review-ready",
      message: "All four exact SKU variants are ready.",
      expectedItemCount: 4,
      observedItemCount: 4,
      missingSkuIds: [],
    });
    assert.equal(ready.status, "review-ready");
    assert.equal(ready.expectedItemCount, 4);
    assert.equal(ready.observedItemCount, 4);
    assert.equal("shippingAddress" in ready, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("single Kanto selects the cheaper approved supplier without increasing package count", async () => {
  const order = fakeOrder("ZKTEST3", [
    { title: "Gym Badge Pin Set", variantTitle: "Kanto" },
  ]);
  const draft = await buildOrderDraft({ order, client: fakeFreightClient(), sources: fakeSources() });
  assert.equal(draft.decision.selected.strategy, "kanto-price-alternative");
  assert.equal(draft.decision.selected.packageCount, 1);
  assert.equal(draft.decision.selected.quotedSubtotalBeforeTax, 6.76);
});

test("Kanto plus Hoenn stays consolidated for a trivial or negative split saving", async () => {
  const order = fakeOrder("ZKTEST4", [
    { title: "Gym Badge Pin Set", variantTitle: "Kanto" },
    { title: "Gym Badge Pin Set", variantTitle: "Hoenn" },
  ]);
  const draft = await buildOrderDraft({ order, client: fakeFreightClient(), sources: fakeSources() });
  assert.equal(draft.decision.selected.strategy, "all-core-badges");
  assert.equal(draft.decision.selected.packageCount, 1);
  assert.equal(draft.decision.selected.quotedSubtotalBeforeTax, 15.4);
});

test("a split wins only when its saving clears the per-extra-package threshold", async () => {
  const order = fakeOrder("ZKTEST5", [
    { title: "Gym Badge Pin Set", variantTitle: "Kanto" },
    { title: "Gym Badge Pin Set", variantTitle: "Hoenn" },
  ]);
  const draft = await buildOrderDraft({
    order,
    client: fakeFreightClient(),
    sources: fakeSources({ flyKanto: 1 }),
  });
  assert.equal(draft.decision.reason, "material-split-savings");
  assert.equal(draft.decision.selected.strategy, "kanto-price-alternative");
  assert.equal(draft.decision.selected.packageCount, 2);
  assert.ok(draft.decision.comparison.actualSavings >= 2);

  const direct = selectFulfillmentPlan([
    { strategy: "one-package", eligible: true, packageCount: 1, quotedSubtotalBeforeTax: 10 },
    { strategy: "two-packages", eligible: true, packageCount: 2, quotedSubtotalBeforeTax: 9.8 },
  ], DEFAULT_DRAFT_POLICY);
  assert.equal(direct.selected.strategy, "one-package");
  assert.equal(direct.reason, "consolidation-preferred");
  assert.equal(direct.comparison.actualSavings, 0.2);
});

test("two Kanto sets plus E8 uses Fly Meng and the exact Metal color 9 payload variant", async () => {
  const order = fakeOrder("ZKTEST6", [
    { title: "Gym Badge Pin Set", variantTitle: "Kanto", quantity: 2, fulfillableQuantity: 2 },
    { title: "Evolution Pin Set", variantTitle: "8-Pin Collection", sku: "ZK-EVOLUTION-PIN-8" },
  ]);
  const draft = await buildOrderDraft({ order, client: fakeFreightClient(), sources: fakeSources() });
  assert.equal(draft.decision.selected.strategy, "kanto-price-alternative");
  assert.equal(draft.decision.selected.packageCount, 2);
  const e8 = draft.decision.selected.packages
    .flatMap((pkg) => pkg.items)
    .find((item) => item.component === "evolution8");
  assert.equal(e8.skuId, "12000057340465797");
  assert.equal(e8.skuAttrWithLabel, "200001033:200003762#9");
  assert.deepEqual(e8.verifiedProperty, {
    name: "Metal color",
    definition: "9",
    value: "Antique Bronze Plated",
  });
  const e8Payload = draft.placeOrderPayloadPreview.product_items.find(
    (item) => item.product_id === 1005012035965982,
  );
  assert.equal(e8Payload.sku_attr, "200001033:200003762");

  const sensitive = buildSensitivePlaceOrderPayload(order, draft.decision.selected);
  assert.equal(sensitive.logistics_address.country, "US");
  assert.equal(sensitive.logistics_address.province, "Arizona");
  assert.equal(sensitive.logistics_address.phone_country, "+1");
  assert.equal(sensitive.logistics_address.mobile_no, "6025550199");
  assert.equal(sensitive.product_items.length, 2);
  assert.ok(sensitive.product_items.every((item) => Number.isSafeInteger(item.product_id)));

  const missingPhoneOrder = {
    ...order,
    shippingAddress: { ...order.shippingAddress, phone: "" },
  };
  const fallbackPhone = buildSensitivePlaceOrderPayload(missingPhoneOrder, draft.decision.selected);
  assert.equal(fallbackPhone.logistics_address.phone_country, "+1");
  assert.equal(fallbackPhone.logistics_address.mobile_no, "6027515492");

  const saintJohnsOrder = {
    ...order,
    shippingAddress: {
      ...order.shippingAddress,
      city: "Saint Johns",
      province: "Florida",
      provinceCode: "FL",
      zip: "32259",
    },
  };
  const aliExpressCityAlias = buildSensitivePlaceOrderPayload(saintJohnsOrder, draft.decision.selected);
  assert.equal(aliExpressCityAlias.logistics_address.city, "St Johns");
  assert.equal(sensitive.logistics_address.city, "Phoenix");
});

test("extractPlaceOrderResult requires success and returns AliExpress order IDs", () => {
  assert.deepEqual(extractPlaceOrderResult({
    aliexpress_trade_buy_placeorder_response: {
      result: {
        is_success: true,
        order_list: { number: ["8213000000000001", "8213000000000002"] },
      },
    },
  }), {
    orderIds: ["8213000000000001", "8213000000000002"],
    status: "awaiting-payment",
  });
  assert.throws(() => extractPlaceOrderResult({
    aliexpress_trade_buy_placeorder_response: {
      result: { is_success: false, error_code: "INVENTORY_HOLD_ERROR" },
    },
  }), /rejected/i);
});

function productPayloadForSource(source, prices) {
  return {
    aliexpress_ds_product_get_response: {
      result: {
        ae_item_sku_info_dtos: {
          ae_item_sku_info_d_t_o: Object.values(source.variants).map((variant) => ({
            id: variant.skuAttrWithLabel,
            sku_id: variant.skuId,
            sku_available_stock: 100,
            offer_sale_price: String(prices[variant.component]),
            ae_sku_property_dtos: {
              ae_sku_property_d_t_o: [{
                sku_property_name: variant.expectedProperty.name,
                sku_property_value: variant.expectedProperty.value,
                property_value_definition_name: variant.expectedProperty.definition,
              }],
            },
          })),
        },
      },
    },
  };
}

function dashboardAliClient() {
  const payloads = new Map([
    [FULFILLMENT_SOURCES["cute-brooch-core"].productId, productPayloadForSource(
      FULFILLMENT_SOURCES["cute-brooch-core"],
      { kanto: 6.61, johto: 6.67, hoenn: 6.8, sinnoh: 6.73 },
    )],
    [FULFILLMENT_SOURCES["fly-meng-kanto"].productId, productPayloadForSource(
      FULFILLMENT_SOURCES["fly-meng-kanto"],
      { kanto: 4.77 },
    )],
    [FULFILLMENT_SOURCES["mocake-evolution8"].productId, productPayloadForSource(
      FULFILLMENT_SOURCES["mocake-evolution8"],
      { evolution8: 6.67 },
    )],
  ]);
  const calls = { place: [] };
  return {
    calls,
    async getProduct(productId) {
      return payloads.get(String(productId));
    },
    async calculateFreight() {
      return fakeFreightClient().calculateFreight();
    },
    async placeOrder(payload, options) {
      calls.place.push({ payload, options });
      return {
        aliexpress_trade_buy_placeorder_response: {
          result: { is_success: true, order_list: { number: ["8213999999999999"] } },
        },
      };
    },
  };
}

test("unpaid-order placement revalidates a fingerprint and blocks duplicate placement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-"));
  try {
    const ledger = new OrderPlacementLedger({
      filePath: join(directory, "ledger.json"),
      uuid: (() => {
        let count = 0;
        return () => `test-attempt-${++count}`;
      })(),
    });
    const order = fakeOrder("ZK9001", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]);
    const shopifyReader = async () => [order];
    const client = dashboardAliClient();
    const preview = await prepareDashboardOrders(["ZK9001"], { shopifyReader, client, ledger });
    const draft = preview.orders[0];
    assert.equal(draft.canPlace, true);

    const placed = await placeUnpaidAliExpressOrder({
      shopifyOrderName: "ZK9001",
      expectedDraftFingerprint: draft.draftFingerprint,
      confirmation: "CREATE UNPAID #ZK9001",
    }, { shopifyReader, client, ledger });
    assert.deepEqual(placed.aliExpressOrderIds, ["8213999999999999"]);
    assert.equal(client.calls.place.length, 1);
    assert.equal(client.calls.place[0].options.confirmMutation, true);
    assert.equal(client.calls.place[0].payload.logistics_address.address, "123 Test Street");
    assert.equal(
      client.calls.place[0].payload.product_items[0].product_id,
      Number(FULFILLMENT_SOURCES["fly-meng-kanto"].productId),
    );
    assert.equal(client.calls.place[0].payload.product_items[0].product_count, 1);
    assert.equal((await ledger.get("#ZK9001")).status, "placed-unpaid");

    await assert.rejects(() => placeUnpaidAliExpressOrder({
      shopifyOrderName: "ZK9001",
      expectedDraftFingerprint: draft.draftFingerprint,
      confirmation: "CREATE UNPAID #ZK9001",
    }, { shopifyReader, client, ledger }), /duplicate placement is blocked/i);
    assert.equal(client.calls.place.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("coupon browser checkout revalidates the draft, queues a private job, and never calls placeorder", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-browser-checkout-"));
  try {
    const ledger = new OrderPlacementLedger({ filePath: join(directory, "ledger.json") });
    const browserCheckoutJobs = new BrowserCheckoutJobStore({ directory: join(directory, "browser") });
    const order = fakeOrder("ZK9011", [
      { title: "Gym Badge Pin Set", variantTitle: "4 Regions (Collector's Pack)" },
    ]);
    const shopifyReader = async () => [order];
    const client = dashboardAliClient();
    const preview = await prepareDashboardOrders(["ZK9011"], {
      shopifyReader,
      client,
      ledger,
      browserCheckoutJobs,
    });
    const draft = preview.orders[0];
    assert.equal(draft.coupon.code, "LDUS02");
    assert.equal(draft.canPrepareCouponCheckout, true);

    const launches = [];
    const queued = await prepareBrowserCouponCheckout({
      shopifyOrderName: "ZK9011",
      expectedDraftFingerprint: draft.draftFingerprint,
    }, {
      shopifyReader,
      client,
      ledger,
      browserCheckoutJobs,
      launchWorker: async (options) => launches.push(options),
    });
    assert.equal(queued.coupon.code, "LDUS02");
    assert.equal(queued.status.status, "queued");
    assert.equal(client.calls.place.length, 0);
    assert.equal(launches.length, 1);

    const storedJob = JSON.parse(await readFile(browserCheckoutJobs.jobPath(queued.browserCheckoutJobId), "utf8"));
    assert.equal(storedJob.shippingAddress.address1, "123 Test Street");
    assert.equal(storedJob.destructiveCartResetAuthorized, true);
    const blocked = await prepareDashboardOrders(["ZK9011"], {
      shopifyReader,
      client,
      ledger,
      browserCheckoutJobs,
    });
    assert.equal(blocked.orders[0].canPlace, false);
    assert.equal(blocked.orders[0].canPrepareCouponCheckout, false);
    assert.equal(blocked.orders[0].browserCheckout.status, "queued");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unpaid-order placement rejects stale fingerprints before mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-"));
  try {
    const ledger = new OrderPlacementLedger({ filePath: join(directory, "ledger.json") });
    const order = fakeOrder("ZK9002", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]);
    const shopifyReader = async () => [order];
    const client = dashboardAliClient();
    await assert.rejects(() => placeUnpaidAliExpressOrder({
      shopifyOrderName: "ZK9002",
      expectedDraftFingerprint: "0".repeat(64),
      confirmation: "CREATE UNPAID #ZK9002",
    }, { shopifyReader, client, ledger }), /changed/i);
    assert.equal(client.calls.place.length, 0);
    assert.equal(await ledger.get("#ZK9002"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a definitive AliExpress business rejection is shown precisely and remains retry-blocked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-"));
  try {
    const ledger = new OrderPlacementLedger({
      filePath: join(directory, "ledger.json"),
      uuid: () => "definitive-rejection-attempt",
    });
    const order = fakeOrder("ZK9005", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]);
    const shopifyReader = async () => [order];
    const client = dashboardAliClient();
    client.placeOrder = async (payload, options) => {
      client.calls.place.push({ payload, options });
      return {
        aliexpress_trade_buy_placeorder_response: {
          result: {
            is_success: false,
            error_code: "DELIVERY_METHOD_NOT_EXIST",
            error_msg: "The selected delivery method is unavailable.",
          },
        },
      };
    };
    const preview = await prepareDashboardOrders(["ZK9005"], { shopifyReader, client, ledger });
    const draft = preview.orders[0];

    await assert.rejects(() => placeUnpaidAliExpressOrder({
      shopifyOrderName: "ZK9005",
      expectedDraftFingerprint: draft.draftFingerprint,
      confirmation: "CREATE UNPAID #ZK9005",
    }, { shopifyReader, client, ledger }), (error) => {
      assert.ok(error instanceof DashboardActionError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.definitiveRejection, true);
      assert.match(error.message, /DELIVERY_METHOD_NOT_EXIST/);
      assert.match(error.message, /did not create it/i);
      return true;
    });

    assert.equal(client.calls.place.length, 1);
    const entry = await ledger.get("#ZK9005");
    assert.equal(entry.status, "placement-rejected");
    assert.equal(entry.errorCode, "DELIVERY_METHOD_NOT_EXIST");
    assert.equal(entry.error, "The selected delivery method is unavailable.");

    const blockedPreview = await prepareDashboardOrders(["ZK9005"], { shopifyReader, client, ledger });
    assert.equal(blockedPreview.orders[0].canPlace, false);
    assert.equal(blockedPreview.orders[0].ledger.status, "placement-rejected");
    await assert.rejects(() => ledger.beginPlacement({
      shopifyOrderId: order.id,
      shopifyOrderName: "#ZK9005",
      draftFingerprint: draft.draftFingerprint,
      quotedSubtotalBeforeTax: 10,
      currency: "USD",
    }), /duplicate placement is blocked/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a manually confirmed rejection can be resolved and placed again without deleting audit history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-"));
  try {
    let attemptNumber = 0;
    const ledger = new OrderPlacementLedger({
      filePath: join(directory, "ledger.json"),
      uuid: () => `resolved-attempt-${++attemptNumber}`,
    });
    const first = await ledger.beginPlacement({
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#ZK9004",
      draftFingerprint: "a".repeat(64),
      quotedSubtotalBeforeTax: 10,
      currency: "USD",
    });
    await ledger.markUncertain("#ZK9004", first.attemptId, "MissingParameter");
    const rejected = await ledger.rejectPlacement(
      "#ZK9004",
      first.attemptId,
      "AliExpress confirmed no order was created.",
    );
    assert.equal(rejected.status, "rejected");
    assert.match(rejected.error, /no order was created/i);

    const second = await ledger.beginPlacement({
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#ZK9004",
      draftFingerprint: "b".repeat(64),
      quotedSubtotalBeforeTax: 11,
      currency: "USD",
    });
    assert.notEqual(second.attemptId, first.attemptId);
    assert.equal(second.status, "placement-started");
    assert.equal(second.previousAttempts.length, 1);
    assert.equal(second.previousAttempts[0].status, "rejected");
    assert.equal(second.previousAttempts[0].attemptId, first.attemptId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a confirmed unpaid-order cancellation clears the retry freeze and preserves the AliExpress attempt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-cancelled-"));
  try {
    let attemptNumber = 0;
    const ledger = new OrderPlacementLedger({
      filePath: join(directory, "ledger.json"),
      uuid: () => `cancelled-attempt-${++attemptNumber}`,
    });
    const first = await ledger.beginPlacement({
      shopifyOrderId: "gid://shopify/Order/2",
      shopifyOrderName: "#ZK9006",
      draftFingerprint: "c".repeat(64),
      quotedSubtotalBeforeTax: 28.8,
      currency: "USD",
    });
    await ledger.completePlacement("#ZK9006", first.attemptId, ["8214508050378118"]);
    const cancelled = await ledger.cancelPlacedOrder(
      "#ZK9006",
      "8214508050378118",
      "Operator confirmed the unpaid AliExpress order was cancelled.",
    );
    assert.equal(cancelled.status, "rejected");
    assert.ok(cancelled.cancelledAt);
    assert.match(cancelled.error, /was cancelled/i);

    const second = await ledger.beginPlacement({
      shopifyOrderId: "gid://shopify/Order/2",
      shopifyOrderName: "#ZK9006",
      draftFingerprint: "d".repeat(64),
      quotedSubtotalBeforeTax: 27,
      currency: "USD",
    });
    assert.equal(second.status, "placement-started");
    assert.deepEqual(second.previousAttempts[0].aliExpressOrderIds, ["8214508050378118"]);
    assert.ok(second.previousAttempts[0].cancelledAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mark handled records an auditable terminal state and suppresses future placement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-order-ledger-handled-"));
  try {
    const ledger = new OrderPlacementLedger({
      filePath: join(directory, "ledger.json"),
      now: () => new Date("2026-09-02T05:00:00.000Z"),
    });
    const order = fakeOrder("ZK9014", [{ title: "Gym Badge Pin Set", variantTitle: "Kanto" }]);
    const result = await markDashboardOrderHandled({ shopifyOrderName: "ZK9014" }, {
      shopifyReader: async () => [order],
      ledger,
    });
    assert.equal(result.status, "handled-manually");
    const entry = await ledger.get("#ZK9014");
    assert.equal(entry.shopifyOrderId, order.id);
    assert.equal(entry.manualConfirmation, true);
    assert.equal(entry.handledAt, "2026-09-02T05:00:00.000Z");
    await assert.rejects(() => ledger.beginPlacement({
      shopifyOrderId: order.id,
      shopifyOrderName: "#ZK9014",
      draftFingerprint: "e".repeat(64),
      quotedSubtotalBeforeTax: 8.61,
      currency: "USD",
    }), /duplicate placement is blocked/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dashboard server requires same-origin action token for placement and clearing", async () => {
  let placeCalls = 0;
  let markHandledCalls = 0;
  const { server, actionToken } = createDashboardServer({
    defaultOrders: ["#ZK9003"],
    prepareOrders: async () => ({ generatedAt: new Date().toISOString(), policy: DEFAULT_DRAFT_POLICY, orders: [] }),
    placeOrder: async () => {
      placeCalls += 1;
      return { ok: true, aliExpressOrderIds: ["1"] };
    },
    markHandled: async () => {
      markHandledCalls += 1;
      return { ok: true, shopifyOrderName: "#ZK9003", status: "handled-manually" };
    },
    actionToken: "test-action-token",
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const configResponse = await fetch(`${origin}/api/config`, {
      headers: { "Sec-Fetch-Site": "none" },
    });
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.actionToken, actionToken);

    const rejected = await fetch(`${origin}/api/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: "{}",
    });
    assert.equal(rejected.status, 403);
    assert.equal(placeCalls, 0);

    const accepted = await fetch(`${origin}/api/place`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "X-Zenkai-Action-Token": actionToken,
      },
      body: JSON.stringify({ shopifyOrderName: "#ZK9003" }),
    });
    assert.equal(accepted.status, 201);
    assert.equal(placeCalls, 1);

    const handled = await fetch(`${origin}/api/mark-handled`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "X-Zenkai-Action-Token": actionToken,
      },
      body: JSON.stringify({ shopifyOrderName: "#ZK9003" }),
    });
    assert.equal(handled.status, 200);
    assert.equal(markHandledCalls, 1);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("dashboard server rediscovers unhandled Shopify orders on every automatic refresh", async () => {
  let discoveryCalls = 0;
  const prepared = [];
  const { server } = createDashboardServer({
    defaultOrders: null,
    discoverOrders: async () => {
      discoveryCalls += 1;
      return discoveryCalls === 1 ? ["#ZK9201"] : ["#ZK9202", "#ZK9203"];
    },
    prepareOrders: async (names) => {
      prepared.push(names);
      return { generatedAt: new Date().toISOString(), policy: DEFAULT_DRAFT_POLICY, orders: [] };
    },
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(`${origin}/api/config`, {
      headers: { "Sec-Fetch-Site": "none" },
    })).json();
    assert.equal(config.orderSelectionMode, "auto-discovery");

    assert.equal((await fetch(`${origin}/api/orders`, {
      headers: { "Sec-Fetch-Site": "none" },
    })).status, 200);
    assert.equal((await fetch(`${origin}/api/orders`, {
      headers: { "Sec-Fetch-Site": "none" },
    })).status, 200);
    assert.equal(discoveryCalls, 2);
    assert.deepEqual(prepared, [["#ZK9201"], ["#ZK9202", "#ZK9203"]]);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("dashboard server protects browser-checkout creation and exposes redacted local status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-browser-server-"));
  const browserCheckoutJobs = new BrowserCheckoutJobStore({ directory });
  let prepareCalls = 0;
  const prepareBrowserCheckout = async (body, { browserCheckoutJobs: passedStore }) => {
    prepareCalls += 1;
    assert.equal(body.shopifyOrderName, "#ZK9010");
    assert.equal(passedStore, browserCheckoutJobs);
    const job = {
      id: "browser-job-9010",
      shopifyOrder: { name: "#ZK9010" },
      expectedCoupon: { code: "LDUS02" },
    };
    const status = await passedStore.create(job);
    return {
      ok: true,
      shopifyOrderName: "#ZK9010",
      browserCheckoutJobId: job.id,
      status,
      coupon: { code: "LDUS02" },
    };
  };
  const { server } = createDashboardServer({
    defaultOrders: ["#ZK9010"],
    prepareOrders: async () => ({ generatedAt: new Date().toISOString(), policy: DEFAULT_DRAFT_POLICY, orders: [] }),
    prepareBrowserCheckout,
    browserCheckoutJobs,
    actionToken: "browser-action-token",
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const rejected = await fetch(`${origin}/api/browser-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "X-Zenkai-Action-Token": "browser-action-token",
      },
      body: JSON.stringify({ shopifyOrderName: "#ZK9010" }),
    });
    assert.equal(rejected.status, 403);
    assert.equal(prepareCalls, 0);

    const accepted = await fetch(`${origin}/api/browser-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "X-Zenkai-Action-Token": "browser-action-token",
      },
      body: JSON.stringify({ shopifyOrderName: "#ZK9010" }),
    });
    assert.equal(accepted.status, 202);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.browserCheckoutJobId, "browser-job-9010");
    assert.equal(prepareCalls, 1);

    const statusResponse = await fetch(`${origin}/api/browser-checkout/browser-job-9010/status`, {
      headers: { "Sec-Fetch-Site": "none" },
    });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.status.status, "queued");
    assert.equal("shippingAddress" in status.status, false);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});

test("only a paired existing-browser extension can claim and update checkout jobs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zenkai-extension-server-"));
  const browserCheckoutJobs = new BrowserCheckoutJobStore({ directory });
  await browserCheckoutJobs.create({
    id: "extension-server-job-1",
    shopifyOrder: { name: "#ZK9012" },
    expectedCoupon: { code: "LDUS02" },
    items: [
      { skuId: "sku-a", quantity: 1 },
      { skuId: "sku-b", quantity: 1 },
      { skuId: "sku-c", quantity: 1 },
      { skuId: "sku-d", quantity: 1 },
    ],
    shippingAddress: { address1: "123 Private Street" },
  });
  const { server } = createDashboardServer({
    defaultOrders: ["#ZK9012"],
    prepareOrders: async () => ({ generatedAt: new Date().toISOString(), policy: DEFAULT_DRAFT_POLICY, orders: [] }),
    browserCheckoutJobs,
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const installedExtensionOrigin = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  try {
    const rejected = await fetch(`${origin}/api/browser-extension/job`, {
      headers: { Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(rejected.status, 403);

    const originlessHealth = await fetch(`${origin}/api/browser-extension/health`, {
      headers: {
        "Sec-Fetch-Site": "none",
        "X-Zenkai-Extension-Token": ZENKAI_BROWSER_EXTENSION_TOKEN,
      },
    });
    assert.equal(originlessHealth.status, 200);
    assert.equal(originlessHealth.headers.get("access-control-allow-origin"), null);

    const claimedResponse = await fetch(`${origin}/api/browser-extension/job`, {
      headers: {
        Origin: installedExtensionOrigin,
        "Sec-Fetch-Site": "cross-site",
        "X-Zenkai-Extension-Token": ZENKAI_BROWSER_EXTENSION_TOKEN,
      },
    });
    assert.equal(claimedResponse.status, 200);
    assert.equal(claimedResponse.headers.get("access-control-allow-origin"), installedExtensionOrigin);
    const claimed = await claimedResponse.json();
    assert.equal(claimed.job.items.length, 4);
    assert.equal(claimed.job.shippingAddress.address1, "123 Private Street");

    const updatedResponse = await fetch(`${origin}/api/browser-extension/job/extension-server-job-1/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: installedExtensionOrigin,
        "Sec-Fetch-Site": "cross-site",
        "X-Zenkai-Extension-Token": ZENKAI_BROWSER_EXTENSION_TOKEN,
      },
      body: JSON.stringify({
        status: "review-ready",
        message: "Four exact variants are ready.",
        expectedItemCount: 4,
        observedItemCount: 4,
      }),
    });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.equal(updated.status.expectedItemCount, 4);
    assert.equal("shippingAddress" in updated.status, false);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});
