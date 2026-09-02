#!/usr/bin/env node
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const STATE_DIRECTORY = process.env.ZENKAI_BROWSER_CHECKOUT_STATE_DIR
  || join(MODULE_DIRECTORY, ".local-state", "browser-checkout");
const JOB_DIRECTORY = join(STATE_DIRECTORY, "jobs");
const STATUS_DIRECTORY = join(STATE_DIRECTORY, "status");
const PROFILE_DIRECTORY = join(STATE_DIRECTORY, "browser-profile");
const LOCK_PATH = join(STATE_DIRECTORY, "worker.lock");
const CART_URL = process.env.ZENKAI_BROWSER_CART_URL
  || "https://www.aliexpress.com/p/shoppingcart/index.html";
const require = createRequire(import.meta.url);
const SYSTEM_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function cachedPuppeteerExecutables(kind) {
  const directory = join(homedir(), ".cache", "puppeteer", kind);
  let versions = [];
  try {
    versions = readdirSync(directory).sort().reverse();
  } catch {
    return [];
  }
  return versions.map((version) => kind === "chrome"
    ? join(directory, version, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")
    : join(directory, version, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"));
}

let lockHandle;
let browserContext;
let page;

async function atomicJsonWrite(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function setStatus(job, status, message, extra = {}) {
  await atomicJsonWrite(join(STATUS_DIRECTORY, `${job.id}.json`), {
    id: job.id,
    shopifyOrderName: job.shopifyOrder.name,
    status,
    message,
    updatedAt: new Date().toISOString(),
    couponCode: job.expectedCoupon.code,
    ...extra,
  });
}

function checkoutErrorMessage(error) {
  const message = String(error?.message || error || "Unknown checkout error");
  if (/bootstrap_check_in|MachPortRendezvousServer|Operation not permitted|Permission denied \(1100\)/i.test(message)) {
    return "macOS blocked the automation browser because the dashboard was started inside a sandbox. Restart the dashboard from a normal Terminal window and retry.";
  }
  const firstLine = message.split("\n").find((line) => line.trim())?.trim() || "Unknown checkout error";
  return firstLine.slice(0, 800);
}

async function acquireWorkerLock() {
  await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      lockHandle = await open(LOCK_PATH, "wx", 0o600);
      await lockHandle.writeFile(`${process.pid}\n`, "utf8");
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existingPid = Number.parseInt(await readFile(LOCK_PATH, "utf8").catch(() => ""), 10);
      let workerIsAlive = Number.isInteger(existingPid) && existingPid > 0;
      if (workerIsAlive) {
        try {
          process.kill(existingPid, 0);
        } catch (probeError) {
          workerIsAlive = probeError?.code !== "ESRCH";
        }
      }
      if (workerIsAlive) return false;
      await unlink(LOCK_PATH).catch(() => {});
    }
  }
  return false;
}

async function releaseWorkerLock() {
  if (lockHandle) await lockHandle.close().catch(() => {});
  lockHandle = null;
  await unlink(LOCK_PATH).catch(() => {});
}

async function ensureBrowser() {
  if (browserContext) return;
  const { chromium } = require("playwright");
  const headless = process.env.ZENKAI_BROWSER_HEADLESS === "true";
  const playwrightExecutable = chromium.executablePath();
  const bundledCandidates = headless
    ? [...cachedPuppeteerExecutables("chrome-headless-shell"), ...cachedPuppeteerExecutables("chrome")]
    : cachedPuppeteerExecutables("chrome");
  const executablePath = process.env.ZENKAI_BROWSER_EXECUTABLE
    || bundledCandidates.find((candidate) => existsSync(candidate))
    || (existsSync(playwrightExecutable) ? playwrightExecutable : null)
    || (existsSync(SYSTEM_CHROME_PATH) ? SYSTEM_CHROME_PATH : null);
  if (!executablePath) {
    throw new Error("No compatible Chromium executable is installed for the coupon checkout worker.");
  }
  await mkdir(PROFILE_DIRECTORY, { recursive: true, mode: 0o700 });
  browserContext = await chromium.launchPersistentContext(PROFILE_DIRECTORY, {
    headless,
    executablePath,
    viewport: null,
    locale: "en-US",
    args: ["--start-maximized"],
  });
  page = browserContext.pages()[0] || await browserContext.newPage();
  browserContext.on("close", () => {
    browserContext = null;
    page = null;
  });
}

async function firstVisible(locators, timeoutMs = 1_200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
    }
    await wait(100);
  }
  return null;
}

async function visibleText(pattern) {
  return firstVisible([
    page.getByRole("button", { name: pattern }),
    page.getByRole("link", { name: pattern }),
    page.getByText(pattern, { exact: false }),
  ]);
}

async function pageBodyText() {
  return page.locator("body").innerText().catch(() => "");
}

async function isSignedOut() {
  const url = page.url();
  if (/login\.aliexpress|\/login(?:[/?#]|$)/i.test(url)) return true;
  const password = await firstVisible([page.locator('input[type="password"]')], 250);
  if (password) return true;
  const signIn = await firstVisible([
    page.getByRole("button", { name: /^sign in$/i }),
    page.getByRole("link", { name: /^sign in$/i }),
  ], 250);
  return Boolean(signIn);
}

async function waitForLogin(job) {
  if (!await isSignedOut()) return;
  await setStatus(job, "login-required", "Sign in to AliExpress in the opened automation browser. The job will resume automatically.");
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await wait(1_000);
    if (!await isSignedOut()) return;
  }
  throw new Error("AliExpress sign-in was not completed within ten minutes.");
}

async function goto(url, job, message) {
  await setStatus(job, "running", message, { browserUrl: url });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForLogin(job);
  await page.waitForTimeout(500);
}

async function clickFirst(locators, { timeoutMs = 2_000 } = {}) {
  const target = await firstVisible(locators, timeoutMs);
  if (!target) return false;
  await target.click({ timeout: 5_000 });
  return true;
}

async function selectAllCartItems() {
  const checkbox = await firstVisible([
    page.getByRole("checkbox", { name: /select all/i }),
    page.locator('input[type="checkbox"][name*="all" i]'),
  ], 1_500);
  if (checkbox) {
    if (!await checkbox.isChecked().catch(() => false)) await checkbox.check({ force: true });
    return true;
  }
  return clickFirst([
    page.getByText(/^select all$/i),
    page.locator('[class*="select-all" i]'),
  ], { timeoutMs: 1_500 });
}

async function clearCart(job) {
  await goto(CART_URL, job, "Opening AliExpress cart for the authorized full reset.");
  const body = await pageBodyText();
  if (/your (shopping )?cart is empty|cart is empty|no items in your cart/i.test(body)) return;
  if (!await selectAllCartItems()) {
    throw new Error("AliExpress cart items were visible, but the Select all control could not be identified.");
  }
  const deleted = await clickFirst([
    page.getByRole("button", { name: /delete|remove/i }),
    page.getByText(/^delete$/i),
    page.getByText(/^remove$/i),
    page.locator('[class*="delete" i]'),
  ], { timeoutMs: 2_500 });
  if (!deleted) throw new Error("AliExpress cart was selected, but the Delete control could not be identified.");
  await page.waitForTimeout(350);
  await clickFirst([
    page.getByRole("button", { name: /delete|remove|confirm|yes/i }),
    page.locator('[role="dialog"]').getByText(/delete|remove|confirm|yes/i),
  ], { timeoutMs: 1_500 });
  await page.waitForTimeout(900);
}

async function selectRequestedSku(item) {
  const escaped = item.skuId.replace(/[^a-zA-Z0-9_-]/g, "");
  const skuControl = await firstVisible([
    page.locator(`[data-sku-id="${escaped}"]`),
    page.locator(`[data-sku-item-id="${escaped}"]`),
    page.locator(`[sku-id="${escaped}"]`),
    page.locator(`[data-id="${escaped}"]`),
  ], 700);
  if (skuControl) await skuControl.click({ timeout: 4_000 }).catch(() => {});
}

async function addOneUnit(job, item, unitIndex) {
  const suffix = item.quantity > 1 ? ` (${unitIndex + 1}/${item.quantity})` : "";
  const productUrl = process.env.ZENKAI_BROWSER_ITEM_BASE_URL
    ? (() => {
      const url = new URL(`/item/${item.productId}`, process.env.ZENKAI_BROWSER_ITEM_BASE_URL);
      url.searchParams.set("sku_id", item.skuId);
      return url.toString();
    })()
    : item.productUrl;
  await goto(productUrl, job, `Adding ${item.label}${suffix} to the cleared AliExpress cart.`);
  await selectRequestedSku(item);
  const addButton = await firstVisible([
    page.getByRole("button", { name: /add to cart/i }),
    page.getByText(/^add to cart$/i),
    page.locator('button[class*="add" i]').filter({ hasText: /cart/i }),
  ], 8_000);
  if (!addButton) throw new Error(`The Add to cart button was not found for ${item.label}.`);
  await addButton.click({ timeout: 8_000 });
  await page.waitForTimeout(700);
}

async function addItems(job) {
  for (const item of job.items) {
    for (let unit = 0; unit < item.quantity; unit += 1) await addOneUnit(job, item, unit);
  }
}

async function openCheckout(job) {
  await goto(CART_URL, job, "Validating the rebuilt AliExpress cart.");
  const hrefs = await page.locator('a[href*="/item/"]').evaluateAll((links) => links.map((link) => link.href));
  const missingProducts = job.items
    .filter((item) => !hrefs.some((href) => href.includes(item.productId)))
    .map((item) => item.productId);
  if (missingProducts.length) {
    throw new Error(`The rebuilt cart is missing approved product IDs: ${[...new Set(missingProducts)].join(", ")}.`);
  }
  if (!await selectAllCartItems()) throw new Error("The rebuilt cart could not be selected for checkout.");
  const checkout = await firstVisible([
    page.getByRole("button", { name: /checkout|buy/i }),
    page.getByText(/^checkout$/i),
  ], 4_000);
  if (!checkout) throw new Error("The AliExpress Checkout button could not be identified.");
  await checkout.click({ timeout: 8_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function fillVisible(locatorFactories, value) {
  if (value === undefined || value === null || value === "") return false;
  const locators = locatorFactories.map((factory) => factory());
  const target = await firstVisible(locators, 700);
  if (!target) return false;
  await target.fill(String(value));
  return true;
}

async function fillSelect(namePattern, values) {
  const select = await firstVisible([
    page.locator("select").filter({ has: page.locator(`option`) }).and(page.locator(`[name*="${namePattern}" i]`)),
    page.locator(`select[id*="${namePattern}" i]`),
  ], 500);
  if (!select) return false;
  for (const value of values.filter(Boolean)) {
    if (await select.selectOption({ label: String(value) }).then(() => true).catch(() => false)) return true;
    if (await select.selectOption(String(value)).then(() => true).catch(() => false)) return true;
  }
  return false;
}

async function openAddressForm() {
  const action = await firstVisible([
    page.getByRole("button", { name: /add.*address|change.*address|edit.*address/i }),
    page.getByText(/add.*address|change.*address|edit.*address/i),
  ], 2_000);
  if (action) {
    await action.click({ timeout: 5_000 });
    await page.waitForTimeout(350);
  }
  const addNew = await firstVisible([
    page.getByRole("button", { name: /add.*new.*address/i }),
    page.getByText(/add.*new.*address/i),
  ], 700);
  if (addNew) {
    await addNew.click({ timeout: 5_000 });
    await page.waitForTimeout(350);
  }
}

async function fillAddress(job) {
  const address = job.shippingAddress;
  await setStatus(job, "running", "Filling and validating the Shopify shipping address in AliExpress checkout.", {
    browserUrl: page.url(),
  });
  await openAddressForm();

  const filled = {};
  filled.firstName = await fillVisible([
    () => page.getByLabel(/first name/i),
    () => page.getByPlaceholder(/first name/i),
    () => page.locator('input[name*="first" i]'),
  ], address.firstName);
  filled.lastName = await fillVisible([
    () => page.getByLabel(/last name/i),
    () => page.getByPlaceholder(/last name/i),
    () => page.locator('input[name*="last" i]'),
  ], address.lastName);
  if (!filled.firstName && !filled.lastName) {
    filled.fullName = await fillVisible([
      () => page.getByLabel(/contact name|full name|recipient/i),
      () => page.getByPlaceholder(/contact name|full name|recipient/i),
      () => page.locator('input[name*="contact" i], input[name*="fullName" i], input[name="name"]'),
    ], address.fullName);
  }
  filled.address1 = await fillVisible([
    () => page.getByLabel(/street address|address line 1|address1/i),
    () => page.getByPlaceholder(/street address|address line 1|address1/i),
    () => page.locator('input[name*="address1" i], input[name="address"], textarea[name="address"]'),
  ], address.address1);
  await fillVisible([
    () => page.getByLabel(/apartment|suite|unit|address line 2|address2/i),
    () => page.getByPlaceholder(/apartment|suite|unit|address line 2|address2/i),
    () => page.locator('input[name*="address2" i]'),
  ], address.address2);
  filled.city = await fillVisible([
    () => page.getByLabel(/city/i),
    () => page.getByPlaceholder(/city/i),
    () => page.locator('input[name*="city" i]'),
  ], address.city);
  filled.postalCode = await fillVisible([
    () => page.getByLabel(/zip|postal/i),
    () => page.getByPlaceholder(/zip|postal/i),
    () => page.locator('input[name*="zip" i], input[name*="postal" i]'),
  ], address.postalCode);
  filled.phone = await fillVisible([
    () => page.getByLabel(/mobile|phone/i),
    () => page.getByPlaceholder(/mobile|phone/i),
    () => page.locator('input[type="tel"], input[name*="mobile" i], input[name*="phone" i]'),
  ], `${address.phoneCountry}${address.mobileNumber}`);
  await fillSelect("country", [address.country, address.countryCode]);
  await fillSelect("province", [address.province, address.provinceCode]);
  await fillSelect("state", [address.province, address.provinceCode]);

  const requiredMissing = ["address1", "city", "postalCode", "phone"].filter((field) => !filled[field]);
  if (requiredMissing.length) {
    throw new Error(`AliExpress address fields could not be identified: ${requiredMissing.join(", ")}.`);
  }

  const save = await firstVisible([
    page.getByRole("button", { name: /save|confirm|use this address/i }),
    page.getByText(/^save$/i),
    page.getByText(/^confirm$/i),
  ], 2_000);
  if (save) {
    await save.click({ timeout: 6_000 });
    await page.waitForTimeout(700);
  }
}

async function applyCoupon(job) {
  await setStatus(job, "running", `Applying ${job.expectedCoupon.code} in AliExpress checkout.`, {
    browserUrl: page.url(),
  });
  let input = await firstVisible([
    page.getByPlaceholder(/promo|coupon|promotion.*code|enter.*code/i),
    page.getByLabel(/promo|coupon|promotion.*code/i),
    page.locator('input[name*="promo" i], input[name*="coupon" i], input[name*="code" i]'),
  ], 1_000);
  if (!input) {
    const reveal = await visibleText(/promo code|coupon code|promotion code|enter code/i);
    if (reveal) {
      await reveal.click({ timeout: 5_000 });
      await page.waitForTimeout(300);
      input = await firstVisible([
        page.getByPlaceholder(/promo|coupon|promotion.*code|enter.*code/i),
        page.getByLabel(/promo|coupon|promotion.*code/i),
        page.locator('input[name*="promo" i], input[name*="coupon" i], input[name*="code" i]'),
      ], 1_500);
    }
  }
  if (!input) throw new Error("The AliExpress promotional-code input could not be identified.");
  await input.fill(job.expectedCoupon.code);
  const apply = await firstVisible([
    page.getByRole("button", { name: /apply|use/i }),
    page.getByText(/^apply$/i),
  ], 1_500);
  if (!apply) throw new Error("The AliExpress promotional-code Apply button could not be identified.");
  await apply.click({ timeout: 5_000 });
  await page.waitForTimeout(900);
  const body = await pageBodyText();
  const rejected = /invalid|not applicable|cannot be used|requirements? not met|expired/i.test(body);
  if (rejected) throw new Error(`${job.expectedCoupon.code} was rejected by AliExpress checkout.`);
  return body.includes(job.expectedCoupon.code);
}

async function waitForUserFinish(job, { announceReviewReady = true, markClosedComplete = true } = {}) {
  if (announceReviewReady) {
    await setStatus(job, "review-ready", `${job.expectedCoupon.code} was entered. Review the address, products, discount, and total; then place and pay for the order yourself.`, {
      browserUrl: page.url(),
      expectedDiscountAmount: job.expectedCoupon.discountAmount,
      stopBeforePlaceOrder: true,
    });
  }
  while (page && !page.isClosed()) {
    await wait(1_500);
    const body = await pageBodyText();
    if (/order (has been )?placed|order confirmed|payment successful/i.test(body)) {
      await setStatus(job, "completed", "AliExpress moved beyond final review. Verify the order in AliExpress and reconcile it in the dashboard.", {
        browserUrl: page.url(),
      });
      return;
    }
  }
  if (markClosedComplete) {
    await setStatus(job, "completed", "The AliExpress checkout tab was closed. Verify whether the order was placed before starting another checkout.");
  }
}

async function processJob(jobPath) {
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  await unlink(jobPath).catch(() => {});
  if (!job.destructiveCartResetAuthorized || !job.stopBeforePlaceOrder) {
    throw new Error("Browser-checkout job safety flags are missing.");
  }
  try {
    await ensureBrowser();
    await clearCart(job);
    await addItems(job);
    await openCheckout(job);
    await fillAddress(job);
    const couponVisible = await applyCoupon(job);
    await setStatus(job, "review-ready", `${job.expectedCoupon.code} was applied. Review the final AliExpress page; order submission and payment remain manual.`, {
      browserUrl: page.url(),
      couponVisible,
      expectedDiscountAmount: job.expectedCoupon.discountAmount,
      stopBeforePlaceOrder: true,
    });
    await waitForUserFinish(job, { announceReviewReady: false });
  } catch (error) {
    const failureStatus = page ? "needs-attention" : "failed";
    const safetyNote = page
      ? "The browser remains open at the safest point reached; no final order submission was automated."
      : "No browser checkout or final order submission occurred.";
    await setStatus(job, failureStatus, `${checkoutErrorMessage(error)} ${safetyNote}`, {
      browserUrl: page?.url() || null,
      stopBeforePlaceOrder: true,
    });
    await waitForUserFinish(job, { announceReviewReady: false, markClosedComplete: false });
  }
}

async function nextJobPath() {
  await mkdir(JOB_DIRECTORY, { recursive: true, mode: 0o700 });
  const names = (await readdir(JOB_DIRECTORY)).filter((name) => name.endsWith(".json")).sort();
  return names.length ? join(JOB_DIRECTORY, names[0]) : null;
}

async function main() {
  if (!await acquireWorkerLock()) return;
  const shutdown = async () => {
    await browserContext?.close().catch(() => {});
    await releaseWorkerLock();
    process.exit(0);
  };
  process.once("SIGINT", () => { shutdown(); });
  process.once("SIGTERM", () => { shutdown(); });
  try {
    while (true) {
      const jobPath = await nextJobPath();
      if (!jobPath) {
        await wait(250);
        continue;
      }
      await processJob(jobPath);
    }
  } finally {
    await browserContext?.close().catch(() => {});
    await releaseWorkerLock();
  }
}

main().catch(async (error) => {
  await releaseWorkerLock();
  process.stderr.write(`[browser-checkout-worker] ${error.message}\n`);
  process.exitCode = 1;
});
