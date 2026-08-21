#!/usr/bin/env node
import { CatalogApiError, ShopifyAdminClient } from "./client.mjs";
import { loadManifest } from "./manifest.mjs";
import {
  applyCatalogProduct,
  getCatalogOverview,
  operationInternals,
  preflightCatalogProduct,
  publishCatalogProduct,
} from "./operations.mjs";

const HELP = `Zenkai direct Shopify catalog API

Usage:
  node tools/zenkai-catalog-api/cli.mjs verify
  node tools/zenkai-catalog-api/cli.mjs preflight --manifest <path>
  node tools/zenkai-catalog-api/cli.mjs apply --manifest <path> [--confirm]
  node tools/zenkai-catalog-api/cli.mjs publish --product-id <gid> [--confirm]

Safety:
  - verify and preflight never mutate Shopify.
  - apply without --confirm runs preflight only.
  - confirmed apply creates a DRAFT and never publishes it.
  - publish without --confirm runs readiness checks only.
  - confirmed publish targets only the Online Store publication.
`;

function parseArguments(argv) {
  const command = argv[0];
  const options = { confirm: false };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (argument === "--manifest" || argument === "--product-id") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new CatalogApiError(`${argument} requires a value.`);
      options[argument === "--manifest" ? "manifest" : "productId"] = value;
      index += 1;
      continue;
    }
    throw new CatalogApiError(`Unknown argument: ${argument}`);
  }
  return { command, options };
}

async function run() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (!new Set(["verify", "preflight", "apply", "publish"]).has(command)) {
    throw new CatalogApiError(`Unknown command: ${command}`, { help: HELP });
  }

  const client = ShopifyAdminClient.fromEnvironment();
  let result;
  if (command === "verify") {
    result = await getCatalogOverview(client);
  } else if (command === "preflight") {
    const prepared = await loadManifest(options.manifest);
    result = operationInternals.publicPreflight(await preflightCatalogProduct(client, prepared));
  } else if (command === "apply") {
    const prepared = await loadManifest(options.manifest);
    result = await applyCatalogProduct(client, prepared, { confirm: options.confirm });
  } else {
    result = await publishCatalogProduct(client, options.productId, { confirm: options.confirm });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

run().catch((error) => {
  const output = {
    ok: false,
    error: error.message,
    details: error instanceof CatalogApiError ? error.details : {},
  };
  if (process.env.DEBUG_ZENKAI_CATALOG === "1") output.stack = error.stack;
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
});

export const cliInternals = { parseArguments };
