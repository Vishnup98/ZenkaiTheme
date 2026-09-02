import { createHmac } from "node:crypto";

export const ALIEXPRESS_SYNC_URL = "https://api-sg.aliexpress.com/sync";

export const API_OPERATIONS = Object.freeze({
  "aliexpress.offer.ds.product.simplequery": { access: "read" },
  "aliexpress.ds.product.get": { access: "read" },
  "aliexpress.trade.ds.order.get": { access: "read" },
  "aliexpress.ds.trade.order.get": { access: "read" },
  "aliexpress.logistics.ds.trackinginfo.query": { access: "read" },
  "aliexpress.logistics.buyer.freight.calculate": { access: "read" },
  "aliexpress.trade.buy.placeorder": { access: "write" },
});

export class AliExpressBusinessApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AliExpressBusinessApiError";
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

export function signTopRequest(parameters, appSecret) {
  if (!appSecret) throw new AliExpressBusinessApiError("App Secret is required to sign an AliExpress request.");
  const normalized = normalizedParameters(parameters);
  const canonical = Object.keys(normalized)
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
    subCode: error.sub_code || undefined,
    message: error.sub_msg || error.msg || error.message || undefined,
    requestId: error.request_id || payload?.request_id || undefined,
  };
}

function assertSupportedOperation(method, { confirmMutation = false } = {}) {
  const operation = API_OPERATIONS[method];
  if (!operation) {
    throw new AliExpressBusinessApiError(`Unsupported AliExpress method: ${method}.`, {
      method,
      supportedMethods: Object.keys(API_OPERATIONS),
    });
  }
  if (operation.access === "write" && !confirmMutation) {
    throw new AliExpressBusinessApiError(`AliExpress mutation requires explicit confirmation: ${method}.`, {
      method,
      requiredOption: "confirmMutation: true",
    });
  }
  return operation;
}

export class AliExpressBusinessClient {
  constructor({
    appKey,
    appSecret,
    accessToken,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    syncUrl = ALIEXPRESS_SYNC_URL,
  }) {
    if (!appKey || !appSecret || !accessToken) {
      throw new AliExpressBusinessApiError("App Key, App Secret, and access token are required.");
    }
    if (typeof fetchImpl !== "function") throw new AliExpressBusinessApiError("A fetch implementation is required.");
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.syncUrl = syncUrl;
  }

  async getSimpleProduct(productId, { country = "US", language = "en" } = {}) {
    const normalizedId = String(productId || "").trim();
    if (!/^\d{8,20}$/.test(normalizedId)) {
      throw new AliExpressBusinessApiError("AliExpress product ID must contain 8 to 20 digits.");
    }
    return this.call("aliexpress.offer.ds.product.simplequery", {
      product_id: normalizedId,
      local_country: country,
      local_language: language,
    });
  }

  async getProduct(productId, { country = "US", currency = "USD", language = "EN" } = {}) {
    const normalizedId = String(productId || "").trim();
    if (!/^\d{8,20}$/.test(normalizedId)) {
      throw new AliExpressBusinessApiError("AliExpress product ID must contain 8 to 20 digits.");
    }
    return this.call("aliexpress.ds.product.get", {
      product_id: normalizedId,
      ship_to_country: String(country || "US").toUpperCase(),
      target_currency: String(currency || "USD").toUpperCase(),
      target_language: String(language || "EN").toUpperCase(),
    });
  }

  async calculateFreight({
    country,
    productId,
    skuId,
    quantity,
    price,
    currency = "USD",
    shipFromCountry = "CN",
  }) {
    const normalizedProductId = String(productId || "").trim();
    const normalizedSkuId = String(skuId || "").trim();
    const normalizedQuantity = Number(quantity);
    const normalizedPrice = Number(price);
    if (!/^[0-9]{8,20}$/.test(normalizedProductId)) {
      throw new AliExpressBusinessApiError("Freight quote product ID must contain 8 to 20 digits.");
    }
    if (!/^[0-9]{8,20}$/.test(normalizedSkuId)) {
      throw new AliExpressBusinessApiError("Freight quote SKU ID must contain 8 to 20 digits.");
    }
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1) {
      throw new AliExpressBusinessApiError("Freight quote quantity must be a positive integer.");
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      throw new AliExpressBusinessApiError("Freight quote price must be a non-negative number.");
    }
    return this.call("aliexpress.logistics.buyer.freight.calculate", {
      param_aeop_freight_calculate_for_buyer_d_t_o: JSON.stringify({
        country_code: String(country || "").toUpperCase(),
        product_id: normalizedProductId,
        sku_id: normalizedSkuId,
        product_num: normalizedQuantity,
        send_goods_country_code: String(shipFromCountry || "CN").toUpperCase(),
        price: normalizedPrice.toFixed(2),
        price_currency: String(currency || "USD").toUpperCase(),
      }),
    });
  }

  async placeOrder(orderPayload, { confirmMutation = false } = {}) {
    if (!orderPayload?.logistics_address || !Array.isArray(orderPayload?.product_items) || !orderPayload.product_items.length) {
      throw new AliExpressBusinessApiError("A logistics address and at least one product item are required.");
    }
    const invalidItem = orderPayload.product_items.find((item) => (
      !Number.isSafeInteger(Number(item?.product_id))
      || Number(item.product_id) <= 0
      || !Number.isInteger(Number(item?.product_count))
      || Number(item.product_count) <= 0
    ));
    if (invalidItem) {
      throw new AliExpressBusinessApiError("Every AliExpress order item requires a valid product_id and product_count.");
    }
    return this.call("aliexpress.trade.buy.placeorder", {
      param_place_order_request4_open_api_d_t_o: JSON.stringify(orderPayload),
    }, { confirmMutation });
  }

  async call(method, businessParameters = {}, { confirmMutation = false } = {}) {
    const operation = assertSupportedOperation(method, { confirmMutation });
    const parameters = normalizedParameters({
      app_key: this.appKey,
      access_token: this.accessToken,
      method,
      sign_method: "sha256",
      timestamp: String(this.now()),
      format: "json",
      v: "2.0",
      ...businessParameters,
    });
    parameters.sign = signTopRequest(parameters, this.appSecret);
    const url = new URL(this.syncUrl);
    const requestOptions = operation.access === "write"
      ? {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(30_000),
      }
      : {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      };
    if (operation.access === "read") {
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    }

    let response;
    try {
      response = await this.fetchImpl(url, requestOptions);
    } catch {
      throw new AliExpressBusinessApiError("Could not reach the AliExpress API.");
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AliExpressBusinessApiError("AliExpress returned a non-JSON API response.", {
        httpStatus: response.status,
      });
    }
    if (!response.ok || payload?.error_response) {
      throw new AliExpressBusinessApiError("AliExpress rejected the API request.", safeApiDetails(payload, response.status));
    }
    return payload;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function skuPropertyArray(sku) {
  const container = sku?.ae_sku_property_dtos ?? sku?.ae_sku_property_d_t_os;
  return asArray(container?.ae_sku_property_d_t_o ?? container?.ae_sku_property_dto ?? container);
}

export function normalizeSkuAttr(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.split("#", 1)[0])
    .filter(Boolean)
    .join(";");
}

export function extractProductSkus(payload, productId) {
  const result = payload?.aliexpress_ds_product_get_response?.result;
  if (!result || typeof result !== "object") {
    throw new AliExpressBusinessApiError("AliExpress returned an unexpected detailed-product response shape.", {
      productId: String(productId),
    });
  }
  const container = result?.ae_item_sku_info_dtos;
  const skus = asArray(
    container?.ae_item_sku_info_d_t_o
      ?? container?.ae_item_sku_info_dto
      ?? container,
  ).filter(Boolean);
  return skus.map((sku) => ({
    productId: String(productId),
    skuId: String(sku.sku_id ?? ""),
    skuAttrWithLabel: String(sku.id ?? ""),
    skuAttr: normalizeSkuAttr(sku.id),
    availableStock: Number(sku.sku_available_stock ?? sku.ipm_sku_stock ?? sku.sku_stock ?? 0),
    unitPrice: Number(sku.offer_sale_price ?? sku.sku_price),
    properties: skuPropertyArray(sku).map((property) => ({
      name: property.sku_property_name ?? null,
      value: property.sku_property_value ?? null,
      definition: property.property_value_definition_name ?? null,
      propertyId: property.sku_property_id === undefined ? null : String(property.sku_property_id),
      valueId: property.property_value_id === undefined ? null : String(property.property_value_id),
    })),
  }));
}

export function extractFreightOptions(payload) {
  const result = payload?.aliexpress_logistics_buyer_freight_calculate_response?.result;
  if (!result || result.success !== true) {
    throw new AliExpressBusinessApiError("AliExpress could not calculate freight for this item.", {
      message: result?.error_desc || undefined,
    });
  }
  const container = result?.aeop_freight_calculate_result_for_buyer_d_t_o_list;
  const rawOptions = asArray(
    container?.aeop_freight_calculate_result_for_buyer_dto
      ?? container?.aeop_freight_calculate_result_for_buyer_d_t_o
      ?? container,
  );
  return rawOptions
    .filter((option) => option && Number(option.error_code ?? 0) === 0 && option.freight)
    .map((option) => ({
      serviceName: option.service_name || null,
      estimatedDeliveryTime: option.estimated_delivery_time || null,
      trackingAvailable: String(option.tracking_available ?? "").toLowerCase() === "true",
      amount: Number(option.freight?.amount),
      currency: option.freight?.currency_code || null,
    }))
    .filter((option) => option.serviceName && Number.isFinite(option.amount));
}

export function extractPlaceOrderResult(payload) {
  const result = payload?.aliexpress_trade_buy_placeorder_response?.result;
  const succeeded = result?.is_success === true || String(result?.is_success || "").toLowerCase() === "true";
  if (!result || !succeeded) {
    throw new AliExpressBusinessApiError("AliExpress rejected the unpaid-order placement request.", {
      definitiveRejection: true,
      apiCode: result?.error_code || undefined,
      message: result?.error_msg || undefined,
    });
  }
  const orderValue = result?.order_list?.number ?? result?.order_list ?? [];
  const orderIds = asArray(orderValue).map(String).filter((value) => /^\d+$/.test(value));
  if (!orderIds.length) {
    throw new AliExpressBusinessApiError("AliExpress reported success but returned no order IDs.", {
      definitiveRejection: false,
    });
  }
  return { orderIds, status: "awaiting-payment" };
}

export function summarizeSimpleProduct(payload, productId) {
  const result = payload?.aliexpress_offer_ds_product_simplequery_response;
  if (!result || typeof result !== "object") {
    throw new AliExpressBusinessApiError("AliExpress returned an unexpected product response shape.");
  }
  const skus = asArray(result?.aeop_ae_product_s_k_us?.aeop_ae_product_sku);
  const salePrices = skus
    .map((sku) => Number(sku.offer_sale_price ?? sku.sku_price))
    .filter(Number.isFinite);
  const currencies = [...new Set(skus.map((sku) => sku.currency_code).filter(Boolean))];
  return {
    ok: true,
    readOnly: true,
    method: "aliexpress.offer.ds.product.simplequery",
    productId: String(productId),
    productStatus: result.product_status_type || null,
    totalAvailableStock: result.total_available_stock ?? null,
    siteSalePrice: result.item_offer_site_sale_price ?? null,
    skuCount: skus.length,
    inStockSkuCount: skus.filter((sku) => sku.sku_stock === true || Number(sku.s_k_u_available_stock) > 0).length,
    currencyCodes: currencies,
    skuSalePriceRange: salePrices.length
      ? { min: Math.min(...salePrices), max: Math.max(...salePrices) }
      : null,
  };
}

export const topClientInternals = { assertSupportedOperation, normalizedParameters, safeApiDetails };
