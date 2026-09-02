import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { couponForEligibleSubtotal } from "./coupon-policy.mjs";
import { buildSensitivePlaceOrderPayload } from "./draft-planner.mjs";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_DIRECTORY = join(MODULE_DIRECTORY, ".local-state", "browser-checkout");
const DEFAULT_RUNTIME_DIRECTORY = "/Users/vishnup/.cache/codex-runtimes/codex-primary-runtime/dependencies/node";
const WORKER_PATH = join(MODULE_DIRECTORY, "browser-checkout-worker.mjs");

export class BrowserCheckoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BrowserCheckoutError";
    this.details = details;
  }
}

function safeOrderSlug(value) {
  const slug = String(value || "").replace(/^#/, "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!slug) throw new BrowserCheckoutError("A valid Shopify order name is required for browser checkout.");
  return slug;
}

function browserProductUrl(productId, skuId) {
  const url = new URL(`https://www.aliexpress.com/item/${productId}.html`);
  url.searchParams.set("sku_id", String(skuId));
  return url.toString();
}

function browserItems(selectedPlan) {
  return selectedPlan.packages.flatMap((pkg) => pkg.items.map((item) => ({
    component: item.component,
    label: item.label,
    storeName: pkg.storeName,
    productId: String(item.productId ?? pkg.productId),
    skuId: String(item.skuId),
    skuAttr: item.skuAttr,
    skuAttrWithLabel: item.skuAttrWithLabel,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    shippingService: pkg.shipping.serviceName,
    productUrl: browserProductUrl(item.productId ?? pkg.productId, item.skuId),
  })));
}

export function buildBrowserCheckoutJob(order, selectedPlan, {
  now = () => new Date(),
  id = randomBytes(18).toString("base64url"),
} = {}) {
  if (!selectedPlan?.packages?.length) {
    throw new BrowserCheckoutError("A selected fulfillment plan is required for browser checkout.");
  }
  const coupon = couponForEligibleSubtotal(selectedPlan.itemSubtotal, selectedPlan.currency);
  if (!coupon) {
    throw new BrowserCheckoutError("This AliExpress item subtotal does not qualify for a configured coupon.", {
      itemSubtotal: selectedPlan.itemSubtotal,
      currency: selectedPlan.currency,
    });
  }
  const placePayload = buildSensitivePlaceOrderPayload(order, selectedPlan);
  const source = order.shippingAddress || order.address || {};
  const fullName = placePayload.logistics_address.full_name;
  const nameParts = fullName.trim().split(/\s+/);
  return {
    schemaVersion: 1,
    id,
    createdAt: now().toISOString(),
    shopifyOrder: {
      id: order.id || null,
      name: String(order.name || "").startsWith("#") ? String(order.name) : `#${order.name}`,
    },
    destructiveCartResetAuthorized: true,
    stopBeforePlaceOrder: true,
    currency: selectedPlan.currency,
    itemSubtotal: selectedPlan.itemSubtotal,
    shippingTotal: selectedPlan.shippingTotal,
    quotedSubtotalBeforeTax: selectedPlan.quotedSubtotalBeforeTax,
    expectedCoupon: coupon,
    items: browserItems(selectedPlan),
    shippingAddress: {
      fullName,
      firstName: source.firstName || nameParts[0] || "",
      lastName: source.lastName || nameParts.slice(1).join(" ") || "",
      countryCode: placePayload.logistics_address.country,
      country: source.country || placePayload.logistics_address.country,
      province: placePayload.logistics_address.province,
      provinceCode: source.provinceCode || "",
      city: placePayload.logistics_address.city,
      address1: placePayload.logistics_address.address,
      address2: placePayload.logistics_address.address2 || "",
      postalCode: placePayload.logistics_address.zip,
      phoneCountry: placePayload.logistics_address.phone_country || "",
      mobileNumber: placePayload.logistics_address.mobile_no || "",
    },
  };
}

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

export class BrowserCheckoutJobStore {
  constructor({ directory = process.env.ZENKAI_BROWSER_CHECKOUT_STATE_DIR || DEFAULT_STATE_DIRECTORY } = {}) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }

  transact(operation) {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => {});
    return run;
  }

  jobPath(id) {
    return join(this.directory, "jobs", `${id}.json`);
  }

  statusPath(id) {
    return join(this.directory, "status", `${id}.json`);
  }

  async create(job) {
    const existing = await this.findActiveForOrder(job.shopifyOrder.name);
    if (existing) {
      throw new BrowserCheckoutError("This Shopify order already has an active browser-checkout job.", {
        activeJobId: existing.id,
        status: existing.status,
      });
    }
    await atomicJsonWrite(this.jobPath(job.id), job);
    await atomicJsonWrite(this.statusPath(job.id), {
      id: job.id,
      shopifyOrderName: job.shopifyOrder.name,
      status: "queued",
      message: "Waiting for the AliExpress browser worker.",
      updatedAt: new Date().toISOString(),
      couponCode: job.expectedCoupon.code,
    });
    return this.readStatus(job.id);
  }

  async readStatus(id) {
    try {
      return JSON.parse(await readFile(this.statusPath(id), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new BrowserCheckoutError("Browser-checkout status could not be read.");
    }
  }

  claimNextJob() {
    return this.transact(async () => {
      const jobsDirectory = join(this.directory, "jobs");
      await mkdir(jobsDirectory, { recursive: true, mode: 0o700 });
      const names = (await readdir(jobsDirectory)).filter((name) => name.endsWith(".json")).sort();
      for (const name of names) {
        const path = join(jobsDirectory, name);
        const job = JSON.parse(await readFile(path, "utf8"));
        const status = await this.readStatus(job.id);
        if (status?.status !== "queued") {
          await unlink(path).catch(() => {});
          continue;
        }
        await unlink(path);
        await atomicJsonWrite(this.statusPath(job.id), {
          id: job.id,
          shopifyOrderName: job.shopifyOrder.name,
          status: "running",
          message: "The existing-browser extension claimed this checkout job.",
          updatedAt: new Date().toISOString(),
          couponCode: job.expectedCoupon.code,
        });
        return job;
      }
      return null;
    });
  }

  updateStatus(id, update = {}) {
    return this.transact(async () => {
      const existing = await this.readStatus(id);
      if (!existing) throw new BrowserCheckoutError("Browser-checkout status was not found.");
      const allowedStatuses = new Set([
        "running",
        "login-required",
        "review-ready",
        "needs-attention",
        "completed",
        "failed",
        "cancelled",
      ]);
      const status = String(update.status || "");
      if (!allowedStatuses.has(status)) throw new BrowserCheckoutError("Browser-checkout status is invalid.");
      const next = {
        ...existing,
        status,
        message: String(update.message || "").slice(0, 800),
        updatedAt: new Date().toISOString(),
        ...(typeof update.browserUrl === "string" ? { browserUrl: update.browserUrl.slice(0, 500) } : {}),
        ...(Number.isInteger(update.expectedItemCount) ? { expectedItemCount: update.expectedItemCount } : {}),
        ...(Number.isInteger(update.observedItemCount) ? { observedItemCount: update.observedItemCount } : {}),
        ...(Array.isArray(update.missingSkuIds)
          ? { missingSkuIds: update.missingSkuIds.map(String).slice(0, 20) }
          : {}),
        stopBeforePlaceOrder: true,
      };
      await atomicJsonWrite(this.statusPath(id), next);
      return next;
    });
  }

  async findActiveForOrder(orderName) {
    let names;
    try {
      names = await readdir(join(this.directory, "status"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    // A completed browser job still blocks a duplicate until its AliExpress order is reconciled.
    const terminal = new Set(["failed", "cancelled"]);
    for (const name of names.filter((value) => value.endsWith(".json"))) {
      const status = JSON.parse(await readFile(join(this.directory, "status", name), "utf8"));
      if (status.shopifyOrderName === orderName && !terminal.has(status.status)) return status;
    }
    return null;
  }
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function launchBrowserCheckoutWorker({ stateDirectory } = {}) {
  const runtimeDirectory = process.env.ZENKAI_BROWSER_RUNTIME_DIRECTORY || DEFAULT_RUNTIME_DIRECTORY;
  const preferredNode = process.env.ZENKAI_BROWSER_NODE || join(runtimeDirectory, "bin", "node");
  const executable = await pathExists(preferredNode) ? preferredNode : process.execPath;
  const child = spawn(executable, [WORKER_PATH], {
    cwd: MODULE_DIRECTORY,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ZENKAI_BROWSER_CHECKOUT_STATE_DIR: stateDirectory || process.env.ZENKAI_BROWSER_CHECKOUT_STATE_DIR || DEFAULT_STATE_DIRECTORY,
      NODE_PATH: process.env.ZENKAI_BROWSER_NODE_MODULES || join(runtimeDirectory, "node_modules"),
    },
  });
  child.unref();
  return { pid: child.pid, executable };
}

export const browserCheckoutJobInternals = {
  DEFAULT_RUNTIME_DIRECTORY,
  DEFAULT_STATE_DIRECTORY,
  atomicJsonWrite,
  browserItems,
  browserProductUrl,
  safeOrderSlug,
};
