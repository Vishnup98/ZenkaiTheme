const API_ROOT = "http://127.0.0.1:4317/api/browser-extension";
const EXTENSION_TOKEN = "90cc5f80919b6978c5830b0af90a1ab78bf1491e308625733edfab3b41f86eb4";
const CART_URL = "https://www.aliexpress.com/p/shoppingcart/index.html";
const ALIEXPRESS_PATTERNS = ["https://*.aliexpress.com/*", "https://*.aliexpress.us/*"];
let activeRun = null;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "X-Zenkai-Extension-Token": EXTENSION_TOKEN,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Local dashboard returned HTTP ${response.status}.`);
  return body;
}

async function updateStatus(job, status, message, extra = {}) {
  return api(`/job/${encodeURIComponent(job.id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status, message, ...extra }),
  });
}

async function waitForTab(tabId, timeoutMs = 45_000) {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === "complete") return existing;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("AliExpress page loading timed out."));
    }, timeoutMs);
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForCheckoutTab(tabId, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (/\/p\/trade\/confirm\.html(?:[?#]|$)/i.test(tab.url || "") && tab.status === "complete") return tab;
    await sleep(120);
  }
  throw new Error("AliExpress checkout navigation timed out.");
}

async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  return waitForTab(tabId);
}

async function execute(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result;
}

async function executeInMainWorld(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args,
  });
  return result;
}

async function existingAliExpressTab() {
  const tabs = await chrome.tabs.query({ url: ALIEXPRESS_PATTERNS });
  return tabs.find((tab) => tab.active) || tabs[0] || null;
}

async function checkoutTab() {
  const existing = await existingAliExpressTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing;
  }
  return chrome.tabs.create({ url: CART_URL, active: true });
}

async function signedOutInPage() {
  const body = document.body?.innerText || "";
  return /login\.aliexpress|\/login(?:[/?#]|$)/i.test(location.href)
    || Boolean(document.querySelector('input[type="password"]'))
    || /^sign in$/im.test(body);
}

async function waitForLogin(job, tabId) {
  if (!await execute(tabId, signedOutInPage)) return;
  await chrome.tabs.update(tabId, { active: true });
  await updateStatus(job, "login-required", "Sign in to AliExpress in this existing Chrome window. Checkout preparation will resume automatically.");
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await sleep(1_000);
    if (!await execute(tabId, signedOutInPage).catch(() => true)) return;
  }
  throw new Error("AliExpress sign-in was not completed within ten minutes.");
}

async function clearCartInPage() {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const normalized = (element) => String(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "").trim();
  const waitFor = async (predicate, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleepInPage(150);
    }
    return null;
  };
  const cartLineCount = () => document.querySelectorAll(".cart-product-wrap-group-new").length;
  const cartHeaderCount = () => {
    const title = document.querySelector(".cart-header-title");
    const match = normalized(title).match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
  };
  const emptyNow = () => {
    const bodyText = document.body?.innerText || "";
    if (/shopping cart is empty|cart is empty|no items in your cart/i.test(bodyText)) return true;
    const headerCount = cartHeaderCount();
    return headerCount === 0 && cartLineCount() === 0;
  };
  const ready = await waitFor(() => {
    if (emptyNow()) return "empty";
    if (cartLineCount() > 0 || (cartHeaderCount() ?? 0) > 0) return "populated";
    return null;
  }, 12_000);
  if (ready === "empty") return { ok: true, alreadyEmpty: true };
  if (ready !== "populated") return { ok: false, error: "AliExpress did not finish loading the current cart." };

  // The current AliExpress Checkbox component keeps its native input hidden.
  // Clicking only visible inputs misses it and can make a later selector fall
  // through to a per-line trash icon. Always operate on the cart header's own
  // select-all input and delete-all control.
  const headerCheckbox = document.querySelector(".cart-header-checkbox input[type='checkbox'], .cart-header-checkbox [role='checkbox']");
  if (!headerCheckbox) return { ok: false, error: "The cart Select all items control was not found." };
  const selected = headerCheckbox.checked || headerCheckbox.getAttribute("aria-checked") === "true";
  if (!selected) headerCheckbox.click();
  const deleteControl = await waitFor(() => {
    const element = document.querySelector(".cart-header-delete-btn");
    return visible(element) ? element : null;
  }, 6_000);
  if (!deleteControl) return { ok: false, error: "AliExpress did not enable the cart Delete all control after selecting every item." };
  deleteControl.click();
  await sleepInPage(350);
  const dialog = document.querySelector('[role="dialog"]') || document;
  const confirm = [...dialog.querySelectorAll("button, [role=button], span")]
    .filter(visible)
    .find((element) => /^(delete|remove|confirm|yes)$/i.test(normalized(element)));
  if (confirm && confirm !== deleteControl) confirm.click();
  let emptySince = 0;
  const emptied = await waitFor(() => {
    if (!emptyNow()) {
      emptySince = 0;
      return null;
    }
    if (!emptySince) emptySince = Date.now();
    return Date.now() - emptySince >= 900;
  }, 15_000);
  if (!emptied) return { ok: false, error: "AliExpress did not confirm that the cart was empty after removal." };
  return { ok: true, alreadyEmpty: false };
}

async function confirmCartEmptyInPage() {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const normalized = (element) => String(element?.innerText || element?.textContent || "").trim();
  const deadline = Date.now() + 12_000;
  let emptySince = 0;
  while (Date.now() < deadline) {
    const bodyText = document.body?.innerText || "";
    const titleMatch = normalized(document.querySelector(".cart-header-title")).match(/\((\d+)\)/);
    const headerCount = titleMatch ? Number(titleMatch[1]) : null;
    const lineCount = document.querySelectorAll(".cart-product-wrap-group-new").length;
    const hasEmptyMessage = /shopping cart is empty|cart is empty|no items in your cart/i.test(bodyText);
    const empty = hasEmptyMessage || (headerCount === 0 && lineCount === 0);
    const populated = lineCount > 0 || (headerCount ?? 0) > 0;
    if (populated) return { ok: false, headerCount, lineCount };
    if (empty) {
      if (!emptySince) emptySince = Date.now();
      if (Date.now() - emptySince >= 700) return { ok: true, headerCount: headerCount ?? 0, lineCount };
    } else {
      emptySince = 0;
    }
    await sleepInPage(120);
  }
  return { ok: false, error: "AliExpress did not show a stable empty cart after the verification reload." };
}

async function addExactSkuInPage(item) {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const text = (element) => String(
    element?.innerText
      || element?.textContent
      || element?.value
      || element?.getAttribute?.("aria-label")
      || element?.getAttribute?.("title")
      || "",
  ).trim();
  const deadline = Date.now() + 22_000;
  let button;
  while (Date.now() < deadline && !button) {
    const candidates = [...document.querySelectorAll([
      "button",
      "[role=button]",
      "a",
      "input[type=button]",
      "input[type=submit]",
      "[class*='addtocart' i]",
      "[class*='add-to-cart' i]",
    ].join(","))].filter(visible);
    button = candidates.find((element) => /add\s*to\s*(cart|bag)/i.test(text(element)))
      || candidates.find((element) => /addtocart|add-to-cart/i.test(String(element.className || "")));
    if (button && (button.disabled || button.getAttribute("aria-disabled") === "true")) button = null;
    if (!button) await sleepInPage(150);
  }
  const selectedSkuId = new URL(location.href).searchParams.get("sku_id");
  if (selectedSkuId !== String(item.skuId)) {
    return { ok: false, error: `AliExpress did not retain exact SKU ${item.skuId} in the product URL.` };
  }
  if (!button) {
    const pageHint = `${document.title || "Untitled page"} · ${location.pathname}`.slice(0, 180);
    return { ok: false, error: `Add to cart was not found for ${item.label} (${pageHint}).` };
  }
  button.click();
  await sleepInPage(1_100);
  return { ok: true, skuId: String(item.skuId), label: item.label };
}

async function prepareItemTab(job, item, unitIndex) {
  const url = new URL(item.productUrl);
  url.searchParams.set("sku_id", item.skuId);
  url.searchParams.set("zenkai_order", job.shopifyOrder.name.replace(/^#/, ""));
  const tab = await chrome.tabs.create({ url: url.toString(), active: false });
  try {
    await waitForTab(tab.id);
    await waitForLogin(job, tab.id);
    return { tabId: tab.id, item, unitIndex };
  } catch (error) {
    await chrome.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
}

async function addUnitsWithParallelLoading(job, units) {
  const prepared = [];
  try {
    const loaded = await Promise.allSettled(units.map(({ item, unitIndex }) => prepareItemTab(job, item, unitIndex)));
    prepared.push(...loaded.filter((result) => result.status === "fulfilled").map((result) => result.value));
    const loadFailure = loaded.find((result) => result.status === "rejected");
    if (loadFailure) throw loadFailure.reason;
    const results = [];
    for (const { tabId, item, unitIndex } of prepared) {
      const result = await execute(tabId, addExactSkuInPage, [{ ...item, unitIndex }]);
      if (!result?.ok) throw new Error(result?.error || `Could not add ${item.label}.`);
      results.push(result);
      // Cart writes against the same AliExpress account can overwrite each
      // other when issued simultaneously. Pages load concurrently, but cart
      // mutations are deliberately serialized.
      await sleep(650);
    }
    return results;
  } finally {
    await Promise.all(prepared.map(({ tabId }) => chrome.tabs.remove(tabId).catch(() => {})));
  }
}

async function addExactItemsViaMtopInPage(request) {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !window.lib?.mtop?.request) await sleepInPage(100);
  if (!window.lib?.mtop?.request) {
    return { ok: false, error: "AliExpress's signed cart client did not load on the cart page." };
  }
  const addItems = request.items.flatMap((item) => Array.from({ length: item.quantity }, () => ({
    bundleCode: null,
    logisticService: item.shippingService || null,
    itemId: String(item.productId),
    toRemovedAttributeKeys: [],
    quantity: 1,
    subItems: [],
    bundleId: 0,
    attributes: { carAdditionalInfo: null, warranty_ext: null },
    skuId: String(item.skuId),
    bundleSellerId: 0,
    channelCode: null,
  })));
  try {
    const response = await window.lib.mtop.request({
      api: "mtop.aliexpress.trade.cart.add",
      v: "1.0",
      type: "POST",
      dataType: "originaljsonp",
      needLogin: true,
      timeout: 15_000,
      data: {
        locale: "en_US",
        shipToCountry: request.countryCode,
        state: request.province,
        city: request.city,
        currency: request.currency,
        _saasRegion: "AEG",
        addFrom: "",
        addItems: JSON.stringify(addItems),
      },
    });
    const responseCode = Array.isArray(response?.ret) ? response.ret.join(",") : String(response?.ret || "SUCCESS");
    return {
      ok: /SUCCESS/i.test(responseCode),
      responseCode: responseCode.slice(0, 240),
      cartNum: Number(response?.data?.cartNum || 0),
      addedItemCount: addItems.length,
    };
  } catch (error) {
    const responseCode = Array.isArray(error?.ret) ? error.ret.join(",") : String(error?.message || error?.ret || error || "Unknown cart error");
    return { ok: false, error: responseCode.slice(0, 400) };
  }
}

async function inspectAndSelectCartInPage(expectedItems) {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const normalized = (element) => String(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim();
  const waitFor = async (predicate, timeout = 10_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleepInPage(120);
    }
    return null;
  };
  const expectedItemCount = expectedItems.length;
  const expectedUnitCount = expectedItems.reduce((total, item) => total + Number(item.quantity || 1), 0);
  const rendered = await waitFor(() => {
    const lines = document.querySelectorAll(".cart-product-wrap-group-new").length;
    const title = normalized(document.querySelector(".cart-header-title"));
    return lines >= expectedItemCount || new RegExp(`\\(${expectedUnitCount}\\)`).test(title);
  }, 15_000);
  if (!rendered) {
    return { ok: false, missingSkuIds: [], observedItemCount: 0, expectedItemCount, expectedUnitCount, cartRenderTimedOut: true };
  }
  const html = document.documentElement.innerHTML;
  const missingSkuIds = expectedItems
    .filter((item) => {
      const attributeValue = String(item.skuAttr || "").split(":").pop();
      const hrefMatch = [...document.querySelectorAll("a[href]")].some((link) => {
        const href = link.href || "";
        return href.includes(`sku_id=${item.skuId}`) || href.includes(encodeURIComponent(`sku_id=${item.skuId}`));
      });
      return !hrefMatch && !html.includes(String(item.skuId)) && !(attributeValue && html.includes(attributeValue));
    })
    .map((item) => String(item.skuId));

  const cartLines = [...document.querySelectorAll(".cart-product-wrap-group-new")];
  const productLinks = [...document.querySelectorAll('a[href*="/item/"]')].filter(visible);
  const observedItemCount = cartLines.length || new Set(productLinks.map((link) => link.href)).size;
  if (missingSkuIds.length || observedItemCount < expectedItemCount) {
    return { ok: false, missingSkuIds, observedItemCount, expectedItemCount, expectedUnitCount };
  }

  const checkoutControl = () => [...document.querySelectorAll("button, [role=button], a")]
    .filter(visible)
    .find((element) => /checkout|check out/i.test(normalized(element)));
  const checkoutCount = () => {
    const match = normalized(checkoutControl()).match(/check\s*out\s*\((\d+)\)/i);
    return match ? Number(match[1]) : null;
  };
  const selectionConfirmed = () => checkoutCount() === expectedUnitCount;
  const header = document.querySelector(".cart-header-checkbox");
  const hiddenNativeCheckbox = header?.querySelector("input[type='checkbox']");
  const selectAllLabel = [...document.querySelectorAll("label, button, span, div")]
    .filter(visible)
    .filter((element) => /^select all(?: items)?$/i.test(normalized(element)))
    .sort((left, right) => left.childElementCount - right.childElementCount)[0];
  const candidates = [
    hiddenNativeCheckbox,
    header?.querySelector("[role='checkbox']"),
    selectAllLabel?.closest("label"),
    selectAllLabel?.parentElement,
    selectAllLabel,
  ].filter((element, index, elements) => element && elements.indexOf(element) === index);
  for (const candidate of candidates) {
    if (selectionConfirmed()) break;
    candidate.click();
    await waitFor(selectionConfirmed, 2_500);
  }
  if (!selectionConfirmed()) {
    return {
      ok: false,
      missingSkuIds: [],
      observedItemCount,
      expectedItemCount,
      expectedUnitCount,
      selectedUnitCount: checkoutCount() ?? 0,
      selectionFailed: true,
    };
  }
  const checkout = checkoutControl();
  if (!checkout || checkout.disabled || checkout.getAttribute("aria-disabled") === "true") {
    return { ok: false, missingSkuIds: [], observedItemCount, expectedItemCount, expectedUnitCount, checkoutMissing: true };
  }
  checkout.click();
  return { ok: true, missingSkuIds: [], observedItemCount, expectedItemCount, expectedUnitCount, selectedUnitCount: expectedUnitCount };
}

async function fillCheckoutInPage(job) {
  const sleepInPage = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const visible = (element) => Boolean(
    element
      && element.getClientRects().length
      && getComputedStyle(element).visibility !== "hidden"
      && getComputedStyle(element).display !== "none",
  );
  const normalized = (element) => String(
    element?.innerText
      || element?.textContent
      || element?.value
      || element?.getAttribute?.("aria-label")
      || element?.getAttribute?.("title")
      || "",
  ).replace(/\s+/g, " ").trim();
  const waitFor = async (predicate, timeout = 10_000, interval = 120) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleepInPage(interval);
    }
    return null;
  };
  const click = (element) => {
    if (!element) return false;
    const target = element.closest?.("button, [role=button], a") || element;
    target.scrollIntoView?.({ block: "center", inline: "center" });
    target.click();
    return true;
  };
  const controls = (scope = document) => [...scope.querySelectorAll("button, [role=button], a, [role=option], span")].filter(visible);
  const formRootFor = (element) => element?.closest?.([
    ".comet-form-item",
    ".default-input-wrap",
    ".combine-input-wrap",
    ".default-select-wrap",
    ".search-input-wrap",
    "[class*='form-item']",
  ].join(",")) || element?.parentElement;
  const descriptionFor = (element) => {
    const formRoot = formRootFor(element);
    return [
      element?.labels?.[0]?.innerText,
      element?.closest?.("label")?.innerText,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("placeholder"),
      element?.getAttribute?.("name"),
      element?.getAttribute?.("id"),
      formRoot?.innerText,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  };
  const directDescriptionFor = (element) => [
    element?.labels?.[0]?.innerText,
    element?.closest?.("label")?.innerText,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("placeholder"),
    element?.getAttribute?.("name"),
    element?.getAttribute?.("id"),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const nativeSetValue = (input, value) => {
    if (!input || value === undefined || value === null || value === "") return false;
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(input, String(value));
    else input.value = String(value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return input.value === String(value);
  };
  const inputFor = (scope, patterns, { exclude = [] } = {}) => {
    const candidates = [...scope.querySelectorAll("input:not([type=hidden]), textarea, select")].filter(visible);
    const matches = (input, describe) => {
      const description = describe(input);
      return patterns.some((pattern) => pattern.test(description))
        && !exclude.some((pattern) => pattern.test(description));
    };
    // Prefer the input's own label/name/placeholder. Wrapper text can contain
    // adjacent fields (for example, both phone prefix and mobile number) and
    // is only a fallback for AliExpress controls with no useful attributes.
    return candidates.find((input) => matches(input, directDescriptionFor))
      || candidates.find((input) => matches(input, descriptionFor));
  };
  const visibleOptions = () => [...document.querySelectorAll([
    "[role=option]",
    ".drawer-cascade-list .group-item",
    ".drawer-list-wrap .search-item",
    ".sdk-select-menu [class*='option']",
    ".sdk-select-menu [class*='item']",
    "[class*='select-menu'] [class*='option']",
    "[class*='select-dropdown'] [class*='option']",
    "[class*='dropdown-menu'] [class*='option']",
  ].join(","))].filter(visible);
  const chooseOption = async (scope, patterns, values, { optional = false } = {}) => {
    const aliases = values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
    if (!aliases.length) return optional;
    const field = inputFor(scope, patterns);
    if (!field) return optional;
    const current = `${field.value || ""} ${normalized(formRootFor(field))}`.toLowerCase();
    if (aliases.some((alias) => current.includes(alias.toLowerCase()))) return true;
    if (field instanceof HTMLSelectElement) {
      const option = [...field.options].find((candidate) => aliases.some((alias) => (
        candidate.value.toLowerCase() === alias.toLowerCase()
          || normalized(candidate).toLowerCase() === alias.toLowerCase()
      )));
      return option ? nativeSetValue(field, option.value) : optional;
    }
    const root = formRootFor(field);
    const trigger = root?.querySelector?.("[role=combobox], input, [class*='select-item'], [class*='select']") || field;
    click(trigger);
    await sleepInPage(180);
    if (trigger instanceof HTMLInputElement && !trigger.readOnly) nativeSetValue(trigger, aliases[0]);
    const option = await waitFor(() => visibleOptions().find((candidate) => {
      const optionText = normalized(candidate).toLowerCase();
      return aliases.some((alias) => optionText === alias.toLowerCase() || optionText.startsWith(`${alias.toLowerCase()} `));
    }), 3_500);
    if (option) {
      click(option);
      await sleepInPage(250);
      return true;
    }
    return trigger instanceof HTMLInputElement && !trigger.readOnly && trigger.value === aliases[0];
  };
  const chooseFromSelectRoot = async (root, values) => {
    const aliases = values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
    if (!root || !aliases.length) return false;
    const current = normalized(root).toLowerCase();
    if (aliases.some((alias) => current.includes(alias.toLowerCase()))) return true;
    const trigger = root.querySelector("[role=combobox], input:not([type=hidden]), .select-item, [class*='select-item']") || root;
    click(trigger);
    await sleepInPage(220);
    const option = await waitFor(() => visibleOptions().find((candidate) => {
      const optionText = normalized(candidate).toLowerCase();
      return aliases.some((alias) => optionText === alias.toLowerCase() || optionText.startsWith(`${alias.toLowerCase()} `));
    }), 4_500);
    if (!option) return false;
    click(option);
    await sleepInPage(350);
    return true;
  };
  const address = job.shippingAddress;
  const expectedAddressText = [address.fullName, address.address1, address.address2]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const expectedPostalText = String(address.postalCode || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const expectedPostalBase = String(address.postalCode || "").split("-")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedAddressMatches = (actual) => (
    expectedAddressText.every((part) => actual.includes(part))
      && (!expectedPostalText || actual.includes(expectedPostalText) || actual.includes(expectedPostalBase))
  );
  const displayedAddressMatches = () => {
    const matchesExpected = (element) => {
      if (!element || !visible(element) || element.closest(".pl-address-model-cls-pc, .pl-address-model-cls")) return false;
      const actual = normalized(element).toLowerCase().replace(/[^a-z0-9]/g, "");
      return normalizedAddressMatches(actual);
    };
    const stableDetails = [
      ...document.querySelectorAll("[data-pl='pl-address-detail'], [data-pl='pl-address']"),
    ];
    if (stableDetails.some(matchesExpected)) return true;
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, div, span")]
      .filter(visible)
      .filter((element) => /^shipping address$/i.test(normalized(element)))
      .sort((left, right) => left.childElementCount - right.childElementCount);
    for (const heading of headings) {
      let container = heading.parentElement;
      for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
        if (matchesExpected(container)) return true;
      }
    }
    return false;
  };

  // AliExpress renders the address book and then the address form in two
  // separate asynchronous stages. Use its stable data-pl/class hooks and do
  // not inspect the page for form inputs until each stage is actually ready.
  const addressAction = await waitFor(() => {
    const stableHook = document.querySelector("[data-pl='pl-address-change'] a, [data-pl='pl-address-new'] button");
    if (visible(stableHook)) return stableHook;
    const addressContainer = document.querySelector("[data-pl='pl-address']")
      || [...document.querySelectorAll("section, article, div")]
        .filter(visible)
        .find((element) => /^shipping address$/i.test(normalized(element.querySelector("h1, h2, h3, [data-pl='pl-address-title']"))));
    return controls(addressContainer || document).find((element) => (
      /^(add shipping address|change|edit shipping address)$/i.test(normalized(element))
      && visible(element)
    )) || null;
  }, 20_000);
  if (!click(addressAction)) return { ok: false, error: "The Shipping address Change control was not found." };
  const addressModal = await waitFor(() => {
    const element = document.querySelector(".pl-address-model-cls-pc, .pl-address-model-cls");
    return visible(element) ? element : null;
  }, 10_000);
  if (!addressModal) return { ok: false, error: "AliExpress did not open the shipping-address panel." };

  let addressForm = [...addressModal.querySelectorAll(".deliver-address-form")].find(visible);
  if (!addressForm) {
    // AliExpress renders address-list actions such as Edit as plain divs in
    // the current desktop checkout, not as buttons or links.
    const uniqueActionControls = (scope, pattern) => [...scope.querySelectorAll(
      "button, a, div, span, p, label, [role=button]",
    )]
      .filter(visible)
      .filter((element) => pattern.test(normalized(element)))
      .sort((left, right) => left.childElementCount - right.childElementCount)
      .map((element) => element.closest?.("button, [role=button], a") || element)
      .filter((element, index, elements) => elements.indexOf(element) === index);
    const editWithinAddressEntry = (anchor) => {
      let entry = anchor;
      while (entry && entry !== addressModal) {
        const edits = uniqueActionControls(entry, /^edit$/i);
        if (edits.length) return edits[0];
        entry = entry.parentElement;
      }
      return null;
    };
    const findDefaultAddressEdit = () => {
      const defaultMarkers = [...addressModal.querySelectorAll("span, div, label")]
        .filter(visible)
        .filter((element) => /^default$/i.test(normalized(element)))
        .sort((left, right) => left.childElementCount - right.childElementCount);
      for (const marker of defaultMarkers) {
        const edit = editWithinAddressEntry(marker);
        if (edit) return edit;
      }
      const selectedAddress = addressModal.querySelector([
        "input[type=radio]:checked",
        "[role=radio][aria-checked=true]",
        "[class*='radio'][class*='checked']",
      ].join(","));
      return editWithinAddressEntry(selectedAddress);
    };

    // Reuse the selected default address as a single rolling dropshipping
    // destination. This avoids accumulating one saved address per customer,
    // and because it is already selected the checkout updates in place.
    const defaultAddressEdit = await waitFor(findDefaultAddressEdit, 8_000);
    if (defaultAddressEdit) {
      click(defaultAddressEdit);
    } else {
      const savedAddressEdits = uniqueActionControls(addressModal, /^edit$/i);
      if (savedAddressEdits.length) {
        return {
          ok: false,
          error: "Saved addresses exist, but AliExpress's Default address Edit control could not be identified safely. No new address was added.",
        };
      }
      // A brand-new buyer account with no editable saved addresses may use
      // the one-time Add new address path.
      const addNew = await waitFor(() => {
        const element = addressModal.querySelector(".add-address, [data-pl='address-add'] button");
        return visible(element) && !element.disabled ? element : null;
      }, 3_000);
      if (!click(addNew)) {
        return { ok: false, error: "AliExpress's selected/default shipping-address Edit control was not found." };
      }
    }
    addressForm = await waitFor(() => [...addressModal.querySelectorAll(".deliver-address-form")].find((element) => (
      visible(element) && element.querySelector("input, textarea, select")
    )), 12_000);
  }
  if (!addressForm) return { ok: false, error: "AliExpress did not finish loading the shipping-address edit form." };

  await chooseOption(addressForm, [/country/i], [address.country, address.countryCode, "United States", "US"], { optional: true });
  const findManualAddressInput = () => {
    const currentForm = [...addressModal.querySelectorAll(".deliver-address-form")].find(visible);
    if (currentForm) addressForm = currentForm;
    return inputFor(addressForm, [
      /street address/i,
      /address line 1/i,
      /street.*house/i,
      /detail address/i,
      /^street\*?$/i,
    ], { exclude: [/search by address/i] });
  };
  const activateManualTarget = (target) => {
    if (!target) return false;
    target.scrollIntoView?.({ block: "center", inline: "center" });
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.click();
    return true;
  };
  let manualAddressReady = findManualAddressInput();
  const exactManualNodes = [...addressModal.querySelectorAll("button, a, div, span, [role=button]")]
    .filter(visible)
    .filter((element) => /^enter manually$/i.test(normalized(element)))
    .sort((left, right) => left.childElementCount - right.childElementCount);
  const manualTargets = [];
  for (const node of exactManualNodes) {
    const rect = node.getBoundingClientRect();
    const pointTargets = [
      ...document.elementsFromPoint(rect.left + Math.max(1, rect.width / 2), rect.top + Math.max(1, rect.height / 2)),
      ...document.elementsFromPoint(rect.right + 10, rect.top + Math.max(1, rect.height / 2)),
    ].filter((element) => addressModal.contains(element));
    manualTargets.push(
      node,
      node.nextElementSibling,
      node.previousElementSibling,
      node.parentElement,
      node.parentElement?.parentElement,
      ...pointTargets,
    );
  }
  const uniqueManualTargets = manualTargets.filter((element, index, elements) => (
    element && visible(element) && elements.indexOf(element) === index
  ));
  for (const target of uniqueManualTargets) {
    if (manualAddressReady) break;
    activateManualTarget(target);
    manualAddressReady = await waitFor(findManualAddressInput, 1_800);
  }
  if (!manualAddressReady) {
    const targetSummary = exactManualNodes.slice(0, 4).map((element) => (
      `${element.tagName.toLowerCase()}.${String(element.className || "").trim().replace(/\s+/g, ".").slice(0, 80)}`
    )).join(" | ");
    return {
      ok: false,
      error: `AliExpress did not switch the address form into manual-entry mode.${targetSummary ? ` Manual controls: ${targetSummary}` : " The Enter manually text was not found."}`,
    };
  }
  // Selecting a state causes AliExpress to replace the entire manual form,
  // and selecting a city can replace its dependent controls again. Complete
  // those two controlled dropdowns first, then reacquire the final DOM before
  // entering any text. Otherwise React silently discards names/address/phone.
  const refreshAddressForm = () => {
    const currentForm = [...addressModal.querySelectorAll(".deliver-address-form")].find(visible);
    if (currentForm) addressForm = currentForm;
    return addressForm;
  };
  const manualSelectRoots = () => [...refreshAddressForm().querySelectorAll(".default-select-wrap")]
    .filter(visible)
    .filter((root) => !/country|region|united states/i.test(normalized(root)));
  const rootContainsAlias = (root, aliases) => {
    const text = normalized(root).toLowerCase();
    return Boolean(root && aliases.filter(Boolean).some((alias) => text.includes(String(alias).toLowerCase())));
  };
  const provinceAliases = [address.province, address.provinceCode];
  const cityAliases = [address.city];

  let provinceSelected = await chooseOption(
    refreshAddressForm(),
    [/state\/province|state.*province|province\/state|\bstate\b|\bprovince\b/i],
    provinceAliases,
    { optional: false },
  );
  if (!provinceSelected) {
    provinceSelected = await chooseFromSelectRoot(manualSelectRoots()[0], provinceAliases);
  }
  const provinceStable = provinceSelected && await waitFor(() => (
    rootContainsAlias(manualSelectRoots()[0], provinceAliases)
  ), 8_000);
  if (!provinceStable) {
    return { ok: false, error: `AliExpress did not retain the ${address.province} state/province selection.` };
  }

  // Reacquire after the state mutation before touching the dependent city.
  await sleepInPage(350);
  refreshAddressForm();
  let citySelected = await chooseOption(refreshAddressForm(), [/\bcity\b/i], cityAliases, { optional: false });
  if (!citySelected) citySelected = await chooseFromSelectRoot(manualSelectRoots()[1], cityAliases);
  const cityStable = citySelected && await waitFor(() => (
    rootContainsAlias(manualSelectRoots()[1], cityAliases)
  ), 8_000);
  if (!cityStable) {
    return { ok: false, error: `AliExpress did not retain the ${address.city} city selection.` };
  }

  const compactValue = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const sameValue = (actual, expected) => compactValue(actual).toLowerCase() === compactValue(expected).toLowerCase();
  const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
  const phoneCountryDigits = digitsOnly(address.phoneCountry || "1") || "1";
  const mobileDigits = digitsOnly(address.mobileNumber);
  const finalAddressInputs = () => {
    const form = refreshAddressForm();
    const fullNameInput = inputFor(form, [/contact name|full name|recipient name|name of recipient/i]);
    const firstNameInput = inputFor(form, [/first name|given name/i]);
    const lastNameInput = inputFor(form, [/last name|family name|surname/i]);
    const address1Input = inputFor(form, [
      /street address/,
      /address line 1/,
      /street.*house/,
      /detail address/,
      /^street\*?$/i,
    ], { exclude: [/search by address|\bapartment\b|\bsuite\b|\bunit\b|line 2|additional/i] });
    const address2Input = inputFor(form, [
      /\bapartment\b/i,
      /\bsuite\b/i,
      /\bunit\b/i,
      /address line 2/i,
      /additional address/i,
    ], { exclude: [/country|region/i] });
    const postalInput = inputFor(form, [/zip code|zip\/postal|postal code|postcode|20001/i]);
    const phoneGroup = [...form.querySelectorAll(".combine-input-wrap")]
      .find((element) => /mobile number|phone number|telephone/i.test(normalized(element)));
    const phoneInput = phoneGroup?.querySelector("input.main-part, .main-part input")
      || inputFor(form, [/mobile number|phone number|telephone/i], { exclude: [/country code|prefix/i] });
    const phoneCountryInput = phoneGroup?.querySelector("input.pre-part, .pre-part input")
      || inputFor(form, [/country code|phone prefix|dialing code/i]);
    return {
      form,
      fullNameInput,
      firstNameInput,
      lastNameInput,
      address1Input,
      address2Input,
      postalInput,
      phoneInput,
      phoneCountryInput,
    };
  };
  const address1ValueFor = (inputs) => (
    address.address2 && !inputs.address2Input ? `${address.address1} / ${address.address2}` : address.address1
  );
  const fillFinalAddressInputs = () => {
    const inputs = finalAddressInputs();
    const nameFilled = inputs.fullNameInput
      ? nativeSetValue(inputs.fullNameInput, address.fullName)
      : nativeSetValue(inputs.firstNameInput, address.firstName)
        && nativeSetValue(inputs.lastNameInput, address.lastName);
    const filled = {
      name: nameFilled,
      address1: nativeSetValue(inputs.address1Input, address1ValueFor(inputs)),
      address2: !address.address2 || !inputs.address2Input || nativeSetValue(inputs.address2Input, address.address2),
      postalCode: nativeSetValue(inputs.postalInput, address.postalCode),
      phoneCountry: inputs.phoneCountryInput
        ? nativeSetValue(inputs.phoneCountryInput, phoneCountryDigits)
        : true,
      phone: nativeSetValue(inputs.phoneInput, mobileDigits),
    };
    return { inputs, filled };
  };
  const textValuesPersisted = () => {
    const inputs = finalAddressInputs();
    const namePersisted = inputs.fullNameInput
      ? sameValue(inputs.fullNameInput.value, address.fullName)
      : sameValue(inputs.firstNameInput?.value, address.firstName)
        && sameValue(inputs.lastNameInput?.value, address.lastName);
    const address2Persisted = !address.address2
      || (inputs.address2Input
        ? sameValue(inputs.address2Input.value, address.address2)
        : sameValue(inputs.address1Input?.value, address1ValueFor(inputs)));
    const countryPersisted = !inputs.phoneCountryInput
      || digitsOnly(inputs.phoneCountryInput.value) === phoneCountryDigits;
    return namePersisted
      && sameValue(inputs.address1Input?.value, address1ValueFor(inputs))
      && address2Persisted
      && sameValue(inputs.postalInput?.value, address.postalCode)
      && countryPersisted
      && digitsOnly(inputs.phoneInput?.value) === mobileDigits;
  };

  let filled = {};
  let textStable = false;
  for (let attempt = 0; attempt < 3 && !textStable; attempt += 1) {
    ({ filled } = fillFinalAddressInputs());
    await sleepInPage(550);
    textStable = textValuesPersisted();
  }
  filled.province = Boolean(provinceStable);
  filled.city = Boolean(cityStable);
  filled.persisted = textStable;
  const requiredMissing = Object.entries(filled)
    .filter(([, value]) => !value)
    .map(([field]) => field);
  if (requiredMissing.length) {
    const available = [...addressForm.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter(visible)
      .map(descriptionFor)
      .filter(Boolean)
      .map((value) => value.slice(0, 80))
      .slice(0, 12);
    return {
      ok: false,
      error: `Shipping-address controls could not be completed: ${requiredMissing.join(", ")}.${available.length ? ` Visible fields: ${available.join(" | ")}` : ""}`,
    };
  }

  const saveAddress = await waitFor(() => controls(refreshAddressForm()).find((element) => (
    /^(save|save and use|confirm|use this address)$/i.test(normalized(element))
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
  )), 5_000);
  if (!click(saveAddress)) return { ok: false, error: "The shipping-address Save control was not found or enabled." };

  const addressEntryMatches = (element) => {
    if (!element || element.closest(".deliver-address-form")) return false;
    const actual = normalized(element).toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalizedAddressMatches(actual);
  };
  const selectionControlsFor = (entry) => [...entry.querySelectorAll([
    "input[type=radio]",
    "[role=radio]",
    "label[class*='radio']",
    ".next-radio",
    ".comet-radio",
    "[class*='radio']",
  ].join(","))].filter((element, index, elements) => elements.indexOf(element) === index);
  const expectedAddressEntry = () => {
    const candidates = [...addressModal.querySelectorAll([
      "article",
      "li",
      "[role=listitem]",
      "[class*='address-item']",
      "[class*='address-card']",
      "div",
    ].join(","))]
      .filter(visible)
      .filter(addressEntryMatches)
      .filter((element) => selectionControlsFor(element).length);
    candidates.sort((left, right) => {
      const leftDefault = [...left.querySelectorAll("span, div, label")]
        .some((element) => /^default$/i.test(normalized(element)));
      const rightDefault = [...right.querySelectorAll("span, div, label")]
        .some((element) => /^default$/i.test(normalized(element)));
      if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
      return left.querySelectorAll("*").length - right.querySelectorAll("*").length;
    });
    return candidates[0] || null;
  };
  const addressEntryIsSelected = (entry) => {
    const nativeRadios = [...entry.querySelectorAll("input[type=radio]")];
    if (nativeRadios.some((radio) => radio.checked)) return true;
    return selectionControlsFor(entry).some((control) => (
      control.getAttribute?.("aria-checked") === "true"
      || /(^|[-_\s])(checked|selected|active)([-_\s]|$)/i.test(String(control.className || ""))
    ));
  };
  const activateAddressSelection = (entry) => {
    const nativeRadio = entry.querySelector("input[type=radio]");
    const label = nativeRadio?.closest("label") || (nativeRadio?.id
      ? entry.querySelector(`label[for='${CSS.escape(nativeRadio.id)}']`)
      : null);
    const visualRadio = selectionControlsFor(entry).find(visible);
    const selectionTarget = label || visualRadio || nativeRadio || entry;
    selectionTarget.scrollIntoView?.({ block: "center", inline: "center" });
    selectionTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    selectionTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    selectionTarget.click();
    if (nativeRadio) nativeRadio.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const chooseEditedAddress = async () => {
    const entry = await waitFor(expectedAddressEntry, 12_000);
    if (!entry) return false;
    if (!addressEntryIsSelected(entry)) {
      activateAddressSelection(entry);
      if (!await waitFor(() => addressEntryIsSelected(entry), 5_000)) {
        // Some layouts delegate radio selection to the entire address card.
        entry.click();
        if (!await waitFor(() => addressEntryIsSelected(entry), 4_000)) return false;
      }
    }
    return true;
  };

  const addressSelected = await chooseEditedAddress();
  if (!addressSelected) {
    const formError = [...addressModal.querySelectorAll(".comet-form-item-error, [class*='error'], [role=alert]")]
      .filter(visible)
      .map(normalized)
      .find(Boolean);
    return { ok: false, error: `AliExpress did not select ${address.fullName}'s edited address.${formError ? ` ${formError}` : ""}` };
  }
  if (visible(addressModal)) {
    let closeAddressPanel = addressModal.querySelector([
      "button[aria-label=Close]",
      "[role=button][aria-label=Close]",
      ".comet-modal-close",
      "[class*='modal-close']",
      "[class*='close']",
    ].join(","));
    if (!visible(closeAddressPanel)) {
      const modalRect = addressModal.getBoundingClientRect();
      const closePointElements = document.elementsFromPoint(modalRect.right - 32, modalRect.top + 32)
        .filter((element) => element === addressModal || addressModal.contains(element));
      closeAddressPanel = closePointElements.find((element) => element !== addressModal) || null;
    }
    if (!activateManualTarget(closeAddressPanel) || !await waitFor(() => !visible(addressModal), 5_000)) {
      return { ok: false, error: "The edited address was selected, but the AliExpress address panel did not close." };
    }
  }
  const addressVerified = await waitFor(displayedAddressMatches, 15_000);
  if (!addressVerified) {
    return { ok: false, error: `The edited address was selected, but checkout did not display ${address.fullName}'s address after the panel closed.` };
  }

  const exactActionNodes = (scope, pattern) => [...scope.querySelectorAll(
    "button, a, div, span, p, label, [role=button]",
  )]
    .filter(visible)
    .filter((element) => pattern.test(normalized(element)))
    .sort((left, right) => left.childElementCount - right.childElementCount);
  const promoInputIn = (scope = document) => {
    const preferred = scope.querySelector([
      "input[aria-label='coupon code input']",
      "input.pl-promoCode-input",
      "input[placeholder='Enter']",
      "input[placeholder*='promo' i]",
      "input[placeholder*='code' i]",
      "textarea[placeholder='Enter']",
      "[role=textbox]",
      "[contenteditable=true]",
    ].join(","));
    if (visible(preferred)) return preferred;
    return [...scope.querySelectorAll([
      "input:not([type=hidden]):not([type=button]):not([type=submit])",
      "textarea",
      "[role=textbox]",
      "[contenteditable=true]",
    ].join(","))].find(visible) || null;
  };
  const promoCodeRow = () => {
    const stableRow = [...document.querySelectorAll(".pl-summary__item-pc, .pl-summary__item")]
      .find((element) => /promo codes?|coupon codes?/i.test(normalized(element.querySelector("[data-pl='pl-summary-title']") || element)));
    if (visible(stableRow)) return stableRow;
    const markers = [...document.querySelectorAll("div, span, p, label")]
      .filter(visible)
      .filter((element) => /^promo codes?$/i.test(normalized(element)))
      .sort((left, right) => left.childElementCount - right.childElementCount);
    for (const marker of markers) {
      let row = marker.parentElement;
      for (let depth = 0; row && depth < 6; depth += 1, row = row.parentElement) {
        if (promoInputIn(row) || exactActionNodes(row, /^enter$/i).length) return row;
      }
    }
    return null;
  };
  const promoCodeMarker = () => [...document.querySelectorAll("div, span, p, label")]
    .filter(visible)
    .filter((element) => /^promo codes?$/i.test(normalized(element)))
    .sort((left, right) => left.childElementCount - right.childElementCount)[0] || null;
  const promoApplyControl = () => {
    const currentRow = promoCodeRow();
    const scoped = currentRow ? exactActionNodes(currentRow, /^(apply|use)$/i) : [];
    const marker = promoCodeMarker();
    const markerRect = marker?.getBoundingClientRect();
    const candidates = scoped.length ? scoped : exactActionNodes(document, /^(apply|use)$/i)
      .filter((element) => {
        if (!markerRect) return false;
        const rect = element.getBoundingClientRect();
        return rect.left > markerRect.left && rect.top >= markerRect.top && rect.top < markerRect.bottom + 260;
      });
    const node = candidates[0];
    return node?.closest?.("button, [role=button], a") || node || null;
  };
  const isEditableCouponControl = (element) => Boolean(
    element
      && (element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || element.getAttribute?.("role") === "textbox"
        || element.isContentEditable),
  );
  const promoInputBesideApply = (applyControl) => {
    if (!visible(applyControl)) return null;
    const applyRect = applyControl.getBoundingClientRect();
    const applyCenterY = applyRect.top + (applyRect.height / 2);
    const candidates = [...document.querySelectorAll([
      "input:not([type=hidden]):not([type=button]):not([type=submit])",
      "textarea",
      "[role=textbox]",
      "[contenteditable=true]",
    ].join(","))]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const centerY = rect.top + (rect.height / 2);
        return Math.abs(centerY - applyCenterY) < 45
          && rect.left < applyRect.left
          && rect.right <= applyRect.left + 24;
      })
      .sort((left, right) => (
        Math.abs(left.getBoundingClientRect().right - applyRect.left)
          - Math.abs(right.getBoundingClientRect().right - applyRect.left)
      ));
    if (candidates[0]) return candidates[0];

    const hitX = Math.max(1, applyRect.left - 28);
    const hitStack = document.elementsFromPoint(hitX, applyCenterY);
    for (const element of hitStack) {
      if (isEditableCouponControl(element)) return element;
      const descendant = element.querySelector?.([
        "input:not([type=hidden])",
        "textarea",
        "[role=textbox]",
        "[contenteditable=true]",
      ].join(","));
      if (isEditableCouponControl(descendant) && visible(descendant)) return descendant;
    }
    const surface = hitStack.find((element) => visible(element) && element !== applyControl);
    if (surface) {
      surface.click();
      surface.focus?.();
      if (isEditableCouponControl(document.activeElement)) return document.activeElement;
    }
    return null;
  };
  const expandedPromoControls = () => {
    const row = promoCodeRow();
    const apply = promoApplyControl();
    const input = (row ? promoInputIn(row) : null) || promoInputBesideApply(apply);
    return input && apply ? { row, input, apply } : null;
  };

  let currentPromoRow = await waitFor(promoCodeRow, 8_000);
  if (!currentPromoRow) {
    return { ok: false, error: "The Promo codes row was not found in the AliExpress summary." };
  }
  let expandedPromo = expandedPromoControls();
  let couponInput = expandedPromo?.input || null;
  if (!visible(couponInput)) {
    const enterNodes = exactActionNodes(currentPromoRow, /^enter$/i)
      .filter((element) => !(element instanceof HTMLInputElement));
    const revealCoupon = enterNodes[0]
      || currentPromoRow.querySelector(".pl-summary__item-content-wrapper")
      || null;
    if (!activateManualTarget(revealCoupon)) {
      return { ok: false, error: "The Enter control beside Promo codes was not found." };
    }
    expandedPromo = await waitFor(() => {
      currentPromoRow = promoCodeRow() || currentPromoRow;
      return expandedPromoControls();
    }, 8_000);
    couponInput = expandedPromo?.input || null;
  }
  if (!couponInput) {
    return { ok: false, error: "The AliExpress promotional-code input was not found." };
  }
  const couponControlValue = (control) => (
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? control.value
      : control.textContent
  );
  const setCouponControlValue = async (control, value) => {
    control.scrollIntoView?.({ block: "center", inline: "center" });
    control.click();
    control.focus();
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      const prototype = control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      const commitValue = (nextValue, insertedCharacter = null) => {
        const previousValue = control.value;
        if (setter) setter.call(control, nextValue);
        else control.value = nextValue;
        control._valueTracker?.setValue(previousValue);
        control.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: insertedCharacter === null ? "deleteContentBackward" : "insertText",
          data: insertedCharacter,
        }));
        control.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: insertedCharacter === null ? "deleteContentBackward" : "insertText",
          data: insertedCharacter,
        }));
      };
      control.setSelectionRange?.(0, control.value.length);
      commitValue("");
      for (const character of String(value)) {
        control.dispatchEvent(new KeyboardEvent("keydown", { key: character, bubbles: true }));
        commitValue(`${control.value}${character}`, character);
        control.dispatchEvent(new KeyboardEvent("keyup", { key: character, bubbles: true }));
        await sleepInPage(35);
      }
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(control);
      selection.removeAllRanges();
      selection.addRange(range);
      const inserted = document.execCommand?.("insertText", false, String(value));
      if (!inserted) {
        control.textContent = String(value);
        control.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: String(value),
        }));
      }
    }
    control.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const fillCouponControl = async (control, value) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await setCouponControlValue(control, value);
      await sleepInPage(350);
      if (String(couponControlValue(control) || "").trim() === String(value)) return true;
      const currentExpanded = expandedPromoControls();
      if (currentExpanded?.input) control = currentExpanded.input;
    }
    return false;
  };
  if (!await fillCouponControl(couponInput, job.expectedCoupon.code)) {
    return { ok: false, error: `AliExpress opened the promotional-code input but did not retain ${job.expectedCoupon.code}.` };
  }
  // Reacquire the controlled field after React commits the retained value.
  currentPromoRow = promoCodeRow() || currentPromoRow;
  expandedPromo = expandedPromoControls() || expandedPromo;
  couponInput = expandedPromo?.input || promoInputIn(currentPromoRow) || couponInput;
  const promoArea = couponInput.closest(".pl-promoCode-input-wrap-pc, .pl-promoCode-input-wrap, .pl-promoCode")
    || currentPromoRow;
  const apply = await waitFor(() => {
    const currentApply = promoApplyControl();
    return currentApply && (
      !currentApply.disabled
      && currentApply.getAttribute("aria-disabled") !== "true"
      && !/(^|[-_\s])disabled([-_\s]|$)/i.test(String(currentApply.className || ""))
    ) ? currentApply : null;
  }, 6_000);
  if (!activateManualTarget(apply)) {
    return { ok: false, error: "The AliExpress promotional-code Apply control was not found or enabled." };
  }
  const couponResult = await waitFor(() => {
    const errorElement = [...document.querySelectorAll(".promoErrorTip, [class*='promo'][class*='error'], [role=alert]")]
      .filter(visible)
      .find((element) => /invalid|not applicable|cannot be used|requirement|minimum|expired|failed|error/i.test(normalized(element)));
    if (errorElement) return { ok: false, error: normalized(errorElement) };
    // AliExpress's checkout component clears this controlled input only when
    // promoCodeApplyRetVO.usePromoCodeStatus becomes SUCCESS.
    if (couponControlValue(couponInput) === "") return { ok: true };
    return null;
  }, 15_000);
  if (!couponResult?.ok) {
    return {
      ok: false,
      error: couponResult?.error
        ? `${job.expectedCoupon.code} was rejected by AliExpress: ${couponResult.error}`
        : `AliExpress did not confirm that ${job.expectedCoupon.code} was applied.`,
    };
  }
  const placeOrderVisible = controls().some((element) => /^(place order|pay now)$/i.test(normalized(element)));
  return { ok: true, addressVerified: true, couponApplied: true, placeOrderVisible };
}

async function processJob(job) {
  const primaryTab = await checkoutTab();
  try {
    await updateStatus(job, "running", "Clearing the complete cart in the existing signed-in Chrome profile.", { browserUrl: CART_URL });
    await navigateTab(primaryTab.id, CART_URL);
    await waitForLogin(job, primaryTab.id);
    const cleared = await execute(primaryTab.id, clearCartInPage);
    if (!cleared?.ok) throw new Error(cleared?.error || "The existing cart could not be cleared.");
    if (!cleared.alreadyEmpty) {
      // Reloading creates a hard synchronization boundary between the delete
      // mutation and the following batch add. Do not add until AliExpress's
      // server-backed cart still reads empty after that reload.
      await chrome.tabs.reload(primaryTab.id);
      await waitForTab(primaryTab.id);
      const emptyAfterReload = await execute(primaryTab.id, confirmCartEmptyInPage);
      if (!emptyAfterReload?.ok) {
        throw new Error(emptyAfterReload?.error || `The cart repopulated after removal (${emptyAfterReload?.lineCount ?? "unknown"} lines).`);
      }
    }

    const expectedUnits = job.items.reduce((total, item) => total + item.quantity, 0);
    await updateStatus(job, "running", `Adding ${expectedUnits} exact SKU variants in one signed AliExpress cart request.`);
    const added = await executeInMainWorld(primaryTab.id, addExactItemsViaMtopInPage, [{
      items: job.items,
      countryCode: job.shippingAddress.countryCode,
      province: job.shippingAddress.provinceCode || job.shippingAddress.province,
      city: job.shippingAddress.city,
      currency: job.currency,
    }]);
    if (!added?.ok) throw new Error(`AliExpress's signed cart request failed: ${added?.error || added?.responseCode || "unknown response"}.`);

    await updateStatus(job, "running", `Validating all ${job.items.length} exact SKU variants before checkout.`, { browserUrl: CART_URL });
    await navigateTab(primaryTab.id, CART_URL);
    const cart = await execute(primaryTab.id, inspectAndSelectCartInPage, [job.items]);
    if (!cart?.ok) {
      const detail = cart?.missingSkuIds?.length
        ? ` Missing SKU IDs: ${cart.missingSkuIds.join(", ")}.`
        : "";
      const selectionDetail = cart?.selectionFailed
        ? ` AliExpress selected ${cart.selectedUnitCount ?? 0} of ${cart.expectedUnitCount ?? expectedUnits} units.`
        : "";
      throw Object.assign(new Error(`Expected ${job.items.length} cart lines but found ${cart?.observedItemCount ?? 0}.${detail}${selectionDetail}`), { cart });
    }
    await updateStatus(job, "running", "All exact SKUs are present. Filling the Shopify address and coupon.", {
      expectedItemCount: cart.expectedItemCount,
      observedItemCount: cart.observedItemCount,
    });
    // The cart click begins navigation asynchronously. waitForTab() alone can
    // accidentally observe the old, already-complete cart document and return
    // before confirm.html has even started loading.
    await waitForCheckoutTab(primaryTab.id);
    const prepared = await execute(primaryTab.id, fillCheckoutInPage, [job]);
    if (!prepared?.ok) throw new Error(prepared?.error || "AliExpress checkout could not be prepared.");
    await chrome.tabs.update(primaryTab.id, { active: true });
    await updateStatus(job, "review-ready", `${job.expectedCoupon.code} is prepared with all ${job.items.length} approved SKU variants. Review and place/pay manually.`, {
      browserUrl: (await chrome.tabs.get(primaryTab.id)).url,
      expectedItemCount: job.items.length,
      observedItemCount: cart.observedItemCount,
      missingSkuIds: [],
    });
  } catch (error) {
    await chrome.tabs.update(primaryTab.id, { active: true }).catch(() => {});
    await updateStatus(job, "needs-attention", `${error.message} No final order submission was automated.`, {
      browserUrl: (await chrome.tabs.get(primaryTab.id).catch(() => ({}))).url || null,
      expectedItemCount: job.items.length,
      observedItemCount: error.cart?.observedItemCount,
      missingSkuIds: error.cart?.missingSkuIds || [],
    }).catch(() => {});
    throw error;
  }
}

async function runQueuedCheckout() {
  if (activeRun) return activeRun;
  activeRun = (async () => {
    const { job } = await api("/job");
    if (!job) return { ok: true, message: "No checkout job is queued." };
    await processJob(job);
    return { ok: true, message: `${job.shopifyOrder.name} is ready for final review.` };
  })();
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "zenkai-run-queued-checkout") {
    runQueuedCheckout().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === "zenkai-extension-heartbeat") {
    api("/health")
      .then(() => sendResponse({ ok: true, message: "Connected to the local dashboard and ready." }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  return false;
});

chrome.alarms.create("zenkai-checkout-poll", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "zenkai-checkout-poll") runQueuedCheckout().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => runQueuedCheckout().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => api("/health").catch(() => {}));
