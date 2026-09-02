import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export function defaultLedgerPath(env = process.env) {
  return env.ZENKAI_ALIEXPRESS_LEDGER_PATH
    || join(MODULE_DIRECTORY, ".local-state", "placement-ledger.json");
}

export class OrderLedgerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OrderLedgerError";
    this.details = details;
  }
}

function emptyLedger() {
  return { schemaVersion: SCHEMA_VERSION, entries: {} };
}

function placementBlockingStatus(status) {
  return [
    "placement-started",
    "placement-uncertain",
    "placement-rejected",
    "placed-unpaid",
    "paid",
    "handled-manually",
  ].includes(status);
}

function archivedAttempt(entry) {
  const { previousAttempts, ...attempt } = entry;
  return attempt;
}

export class OrderPlacementLedger {
  constructor({ filePath = defaultLedgerPath(), now = () => new Date(), uuid = randomUUID } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.uuid = uuid;
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (parsed.schemaVersion !== SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== "object") {
        throw new OrderLedgerError("The local AliExpress placement ledger has an unsupported format.");
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return emptyLedger();
      if (error instanceof OrderLedgerError) throw error;
      throw new OrderLedgerError("The local AliExpress placement ledger could not be read.");
    }
  }

  async write(value) {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${this.uuid()}.tmp`;
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await unlink(temporaryPath).catch(() => {});
      throw new OrderLedgerError("The local AliExpress placement ledger could not be updated.");
    }
  }

  transact(operation) {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => {});
    return run;
  }

  async get(shopifyOrderName) {
    const ledger = await this.load();
    return ledger.entries[shopifyOrderName] || null;
  }

  markHandled({ shopifyOrderId, shopifyOrderName, reason } = {}) {
    return this.transact(async () => {
      const name = String(shopifyOrderName || "").trim();
      if (!name) throw new OrderLedgerError("A Shopify order name is required to mark an order handled.");
      const ledger = await this.load();
      const existing = ledger.entries[name];
      if (existing?.status === "handled-manually") return existing;
      if (["placement-started", "placement-uncertain", "placed-unpaid", "paid"].includes(existing?.status)) {
        throw new OrderLedgerError("This Shopify order has an unresolved or confirmed AliExpress placement and cannot be manually cleared.", {
          shopifyOrderName: name,
          status: existing.status,
          aliExpressOrderIds: existing.aliExpressOrderIds || [],
        });
      }
      const handledAt = this.now().toISOString();
      const previousAttempts = existing
        ? [...(existing.previousAttempts || []), archivedAttempt(existing)]
        : [];
      ledger.entries[name] = {
        shopifyOrderId: shopifyOrderId || existing?.shopifyOrderId || null,
        shopifyOrderName: name,
        status: "handled-manually",
        manualConfirmation: true,
        reason: String(reason || "Operator marked this Shopify order as handled in the local dashboard.").slice(0, 500),
        handledAt,
        updatedAt: handledAt,
        ...(previousAttempts.length ? { previousAttempts } : {}),
      };
      await this.write(ledger);
      return ledger.entries[name];
    });
  }

  beginPlacement({ shopifyOrderId, shopifyOrderName, draftFingerprint, quotedSubtotalBeforeTax, currency }) {
    return this.transact(async () => {
      const ledger = await this.load();
      const existing = ledger.entries[shopifyOrderName];
      if (existing && placementBlockingStatus(existing.status)) {
        throw new OrderLedgerError("This Shopify order already has a placement record; duplicate placement is blocked.", {
          shopifyOrderName,
          status: existing.status,
          aliExpressOrderIds: existing.aliExpressOrderIds || [],
        });
      }
      const attemptId = this.uuid();
      const now = this.now().toISOString();
      const previousAttempts = ["rejected", "cancelled"].includes(existing?.status)
        ? [...(existing.previousAttempts || []), archivedAttempt(existing)]
        : [];
      ledger.entries[shopifyOrderName] = {
        shopifyOrderId,
        shopifyOrderName,
        attemptId,
        draftFingerprint,
        quotedSubtotalBeforeTax,
        currency,
        status: "placement-started",
        startedAt: now,
        updatedAt: now,
        ...(previousAttempts.length ? { previousAttempts } : {}),
      };
      await this.write(ledger);
      return ledger.entries[shopifyOrderName];
    });
  }

  completePlacement(shopifyOrderName, attemptId, aliExpressOrderIds) {
    return this.transact(async () => {
      const ledger = await this.load();
      const entry = ledger.entries[shopifyOrderName];
      if (!entry || entry.attemptId !== attemptId || entry.status !== "placement-started") {
        throw new OrderLedgerError("Placement completion did not match the active ledger attempt.");
      }
      entry.status = "placed-unpaid";
      entry.aliExpressOrderIds = [...aliExpressOrderIds];
      entry.updatedAt = this.now().toISOString();
      await this.write(ledger);
      return entry;
    });
  }

  markUncertain(shopifyOrderName, attemptId, errorMessage) {
    return this.transact(async () => {
      const ledger = await this.load();
      const entry = ledger.entries[shopifyOrderName];
      if (!entry || entry.attemptId !== attemptId) return null;
      entry.status = "placement-uncertain";
      entry.error = String(errorMessage || "Unknown placement failure").slice(0, 500);
      entry.updatedAt = this.now().toISOString();
      await this.write(ledger);
      return entry;
    });
  }

  markDefinitivelyRejected(shopifyOrderName, attemptId, { code, message } = {}) {
    return this.transact(async () => {
      const ledger = await this.load();
      const entry = ledger.entries[shopifyOrderName];
      if (!entry || entry.attemptId !== attemptId || entry.status !== "placement-started") {
        throw new OrderLedgerError("Definitive placement rejection did not match the active ledger attempt.");
      }
      entry.status = "placement-rejected";
      entry.errorCode = String(code || "ALIEXPRESS_BUSINESS_REJECTION").slice(0, 100);
      entry.error = String(message || "AliExpress definitively rejected the placement.").slice(0, 500);
      entry.rejectedAt = this.now().toISOString();
      entry.updatedAt = entry.rejectedAt;
      await this.write(ledger);
      return entry;
    });
  }

  rejectPlacement(shopifyOrderName, attemptId, reason) {
    return this.transact(async () => {
      const ledger = await this.load();
      const entry = ledger.entries[shopifyOrderName];
      if (!entry || entry.attemptId !== attemptId || ![
        "placement-started",
        "placement-uncertain",
        "placement-rejected",
      ].includes(entry.status)) {
        throw new OrderLedgerError("Placement rejection did not match a started, uncertain, or API-rejected ledger attempt.");
      }
      entry.status = "rejected";
      entry.error = String(reason || "AliExpress definitively rejected the placement.").slice(0, 500);
      entry.resolvedAt = this.now().toISOString();
      entry.updatedAt = entry.resolvedAt;
      await this.write(ledger);
      return entry;
    });
  }

  cancelPlacedOrder(shopifyOrderName, aliExpressOrderId, reason) {
    return this.transact(async () => {
      const ledger = await this.load();
      const entry = ledger.entries[shopifyOrderName];
      const expectedOrderId = String(aliExpressOrderId || "");
      if (!entry || entry.status !== "placed-unpaid" || !entry.aliExpressOrderIds?.includes(expectedOrderId)) {
        throw new OrderLedgerError("Cancellation did not match the placed-unpaid Shopify/AliExpress order record.");
      }
      // `rejected` is the ledger's resolved/non-blocking terminal state. Keep the
      // explicit cancellation metadata below so the audit history remains precise.
      entry.status = "rejected";
      entry.error = String(reason || "The AliExpress order was cancelled by the operator.").slice(0, 500);
      entry.cancelledAt = this.now().toISOString();
      entry.resolvedAt = entry.cancelledAt;
      entry.updatedAt = entry.cancelledAt;
      await this.write(ledger);
      return entry;
    });
  }
}

export const orderLedgerInternals = { archivedAttempt, emptyLedger, placementBlockingStatus };
