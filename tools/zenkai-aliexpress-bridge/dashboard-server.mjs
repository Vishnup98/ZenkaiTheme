#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALIEXPRESS_ORDERS_URL,
  DashboardActionError,
  discoverDashboardOrderNames,
  markDashboardOrderHandled,
  placeUnpaidAliExpressOrder,
  prepareBrowserCouponCheckout,
  prepareDashboardOrders,
} from "./dashboard-service.mjs";
import { BrowserCheckoutJobStore } from "./browser-checkout-jobs.mjs";
import {
  ZENKAI_BROWSER_EXTENSION_ORIGIN,
  ZENKAI_BROWSER_EXTENSION_TOKEN,
} from "./browser-extension-config.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const STATIC_DIRECTORY = join(dirname(MODULE_PATH), "dashboard");
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
});
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join("; ");

function jsonResponse(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  response.end(`${JSON.stringify(body)}\n`);
}

const CHROME_EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

function validateExtensionRequest(request, server) {
  const allowedOrigins = expectedOrigins(server);
  const host = String(request.headers.host || "");
  if (![...allowedOrigins].some((origin) => new URL(origin).host === host)) {
    throw new DashboardActionError("Invalid local Host header.", { statusCode: 403 });
  }
  const extensionOrigin = String(request.headers.origin || "");
  if (extensionOrigin && !CHROME_EXTENSION_ORIGIN_PATTERN.test(extensionOrigin)) {
    throw new DashboardActionError("The browser-extension origin is not authorized.", { statusCode: 403 });
  }
  if (request.method === "OPTIONS") {
    const requestedHeaders = String(request.headers["access-control-request-headers"] || "").toLowerCase();
    if (!requestedHeaders.split(",").map((value) => value.trim()).includes("x-zenkai-extension-token")) {
      throw new DashboardActionError("The browser-extension pairing header was not requested.", { statusCode: 403 });
    }
  } else if (String(request.headers["x-zenkai-extension-token"] || "") !== ZENKAI_BROWSER_EXTENSION_TOKEN) {
    throw new DashboardActionError("The browser-extension pairing token is invalid.", { statusCode: 403 });
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && !["cross-site", "none"].includes(fetchSite)) {
    throw new DashboardActionError("The browser-extension request context is invalid.", { statusCode: 403 });
  }
  return extensionOrigin;
}

function extensionCorsHeaders(extensionOrigin = ZENKAI_BROWSER_EXTENSION_ORIGIN) {
  return {
    ...(extensionOrigin ? { "Access-Control-Allow-Origin": extensionOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Zenkai-Extension-Token",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
}

function expectedOrigins(server) {
  const port = server.address()?.port;
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

function validateLocalRequest(request, server, { requireOrigin = false } = {}) {
  const allowedOrigins = expectedOrigins(server);
  const host = String(request.headers.host || "");
  if (![...allowedOrigins].some((origin) => new URL(origin).host === host)) {
    throw new DashboardActionError("Invalid local Host header.", { statusCode: 403 });
  }
  if (requireOrigin && !allowedOrigins.has(String(request.headers.origin || ""))) {
    throw new DashboardActionError("Cross-origin action requests are not allowed.", { statusCode: 403 });
  }
  const fetchSite = request.headers["sec-fetch-site"];
  const allowedFetchSites = requireOrigin ? new Set(["same-origin"]) : new Set(["same-origin", "none"]);
  if (fetchSite && !allowedFetchSites.has(fetchSite)) {
    throw new DashboardActionError("Cross-site requests are not allowed.", { statusCode: 403 });
  }
}

async function readJsonBody(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new DashboardActionError("Action requests must use application/json.", { statusCode: 415 });
  }
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > 10_000) throw new DashboardActionError("Request body is too large.", { statusCode: 413 });
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 10_000) throw new DashboardActionError("Request body is too large.", { statusCode: 413 });
  }
  try {
    return JSON.parse(value || "{}");
  } catch {
    throw new DashboardActionError("Request body must contain valid JSON.", { statusCode: 400 });
  }
}

function requestedOrderNames(url, defaults) {
  const values = url.searchParams.getAll("orders")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : defaults;
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!/^[a-zA-Z0-9._/-]+$/.test(relativePath) || relativePath.includes("..")) return false;
  const filePath = resolve(STATIC_DIRECTORY, relativePath);
  if (!filePath.startsWith(`${resolve(STATIC_DIRECTORY)}/`) && filePath !== resolve(STATIC_DIRECTORY, "index.html")) {
    return false;
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile() || !CONTENT_TYPES[extname(filePath)]) return false;
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath)],
    "Content-Length": info.size,
    "Cache-Control": "no-store",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  createReadStream(filePath).pipe(response);
  return true;
}

export function createDashboardServer({
  prepareOrders = prepareDashboardOrders,
  placeOrder = placeUnpaidAliExpressOrder,
  markHandled = markDashboardOrderHandled,
  prepareBrowserCheckout = prepareBrowserCouponCheckout,
  browserCheckoutJobs = new BrowserCheckoutJobStore(),
  discoverOrders = discoverDashboardOrderNames,
  defaultOrders = null,
  actionToken = randomBytes(32).toString("base64url"),
} = {}) {
  let extensionLastSeenAt = null;
  const server = createServer(async (request, response) => {
    try {
      const origin = `http://${request.headers.host}`;
      const url = new URL(request.url || "/", origin);
      if (url.pathname.startsWith("/api/browser-extension/")) {
        const extensionOrigin = validateExtensionRequest(request, server);
        extensionLastSeenAt = new Date().toISOString();
        if (request.method === "OPTIONS") {
          response.writeHead(204, extensionCorsHeaders(extensionOrigin));
          response.end();
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/browser-extension/health") {
          jsonResponse(response, 200, { ok: true, extensionLastSeenAt }, extensionCorsHeaders(extensionOrigin));
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/browser-extension/job") {
          const job = await browserCheckoutJobs.claimNextJob();
          jsonResponse(response, 200, { ok: true, job }, extensionCorsHeaders(extensionOrigin));
          return;
        }
        const extensionStatusMatch = url.pathname.match(/^\/api\/browser-extension\/job\/([a-zA-Z0-9_-]{12,80})\/status$/);
        if (request.method === "POST" && extensionStatusMatch) {
          const update = await readJsonBody(request);
          const status = await browserCheckoutJobs.updateStatus(extensionStatusMatch[1], update);
          jsonResponse(response, 200, { ok: true, status }, extensionCorsHeaders(extensionOrigin));
          return;
        }
        jsonResponse(response, 404, { ok: false, error: "Extension endpoint not found." }, extensionCorsHeaders(extensionOrigin));
        return;
      }

      validateLocalRequest(request, server);
      if (request.method === "GET" && url.pathname === "/api/config") {
        jsonResponse(response, 200, {
          actionToken,
          defaultOrders: defaultOrders || [],
          orderSelectionMode: defaultOrders?.length ? "fixed" : "auto-discovery",
          ordersPageUrl: ALIEXPRESS_ORDERS_URL,
          placementCreatesRealUnpaidOrders: true,
          browserCheckoutClearsCart: true,
          browserCheckoutStopsBeforePlaceOrder: true,
          browserCheckoutMode: "existing-chrome-extension",
          browserExtensionLastSeenAt: extensionLastSeenAt,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/orders") {
        const explicitOrders = requestedOrderNames(url, []);
        const orderNames = explicitOrders.length
          ? explicitOrders
          : defaultOrders?.length
            ? defaultOrders
            : await discoverOrders();
        const result = await prepareOrders(orderNames);
        jsonResponse(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/place") {
        validateLocalRequest(request, server, { requireOrigin: true });
        if (request.headers["x-zenkai-action-token"] !== actionToken) {
          throw new DashboardActionError("Action token is missing or invalid.", { statusCode: 403 });
        }
        const body = await readJsonBody(request);
        const result = await placeOrder(body);
        jsonResponse(response, 201, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mark-handled") {
        validateLocalRequest(request, server, { requireOrigin: true });
        if (request.headers["x-zenkai-action-token"] !== actionToken) {
          throw new DashboardActionError("Action token is missing or invalid.", { statusCode: 403 });
        }
        const body = await readJsonBody(request);
        const result = await markHandled(body);
        jsonResponse(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/browser-checkout") {
        validateLocalRequest(request, server, { requireOrigin: true });
        if (request.headers["x-zenkai-action-token"] !== actionToken) {
          throw new DashboardActionError("Action token is missing or invalid.", { statusCode: 403 });
        }
        const body = await readJsonBody(request);
        const result = await prepareBrowserCheckout(body, { browserCheckoutJobs });
        jsonResponse(response, 202, result);
        return;
      }
      const statusMatch = url.pathname.match(/^\/api\/browser-checkout\/([a-zA-Z0-9_-]{12,80})\/status$/);
      if (request.method === "GET" && statusMatch) {
        const status = await browserCheckoutJobs.readStatus(statusMatch[1]);
        if (!status) throw new DashboardActionError("Browser-checkout job was not found.", { statusCode: 404 });
        jsonResponse(response, 200, { ok: true, status });
        return;
      }
      if (request.method === "GET" && await serveStatic(response, url.pathname)) return;
      jsonResponse(response, 404, { ok: false, error: "Not found." });
    } catch (error) {
      const statusCode = error instanceof DashboardActionError ? error.statusCode : 500;
      if (!(error instanceof DashboardActionError)) {
        process.stderr.write(`[dashboard] ${error?.name || "Error"}: ${error?.message || "Unknown error"}\n`);
      }
      const isExtensionRequest = String(request.url || "").startsWith("/api/browser-extension/")
        && CHROME_EXTENSION_ORIGIN_PATTERN.test(String(request.headers.origin || ""));
      const extensionOrigin = isExtensionRequest ? String(request.headers.origin) : undefined;
      jsonResponse(response, statusCode, {
        ok: false,
        error: error instanceof DashboardActionError ? error.message : "The local fulfillment dashboard encountered an error.",
        details: error instanceof DashboardActionError ? error.details : {},
      }, isExtensionRequest ? extensionCorsHeaders(extensionOrigin) : {});
    }
  });
  return { server, actionToken };
}

export async function startDashboard({ port = Number(process.env.ZENKAI_DASHBOARD_PORT || 4317) } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DashboardActionError("ZENKAI_DASHBOARD_PORT must be a valid TCP port.");
  }
  const configuredOrders = String(process.env.ZENKAI_DASHBOARD_ORDERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const { server } = createDashboardServer({
    defaultOrders: configuredOrders.length ? configuredOrders : null,
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const localUrl = `http://127.0.0.1:${server.address().port}`;
  process.stdout.write(`Zenkai fulfillment dashboard: ${localUrl}\n`);
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  return { server, localUrl };
}

if (process.argv[1] && resolve(process.argv[1]) === MODULE_PATH) {
  startDashboard().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  });
}

export const dashboardServerInternals = {
  CSP,
  readJsonBody,
  requestedOrderNames,
  validateLocalRequest,
};
