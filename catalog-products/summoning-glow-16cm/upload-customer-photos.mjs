#!/usr/bin/env node
import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CONFIRMED = process.argv.slice(2).includes("--confirm");
const definitions = [
  {
    relativePath: "customer-photos/originals/customer-01-red-pc-closeup.png",
    filename: "customer-01-red-pc-closeup.png",
    alt: "Customer display of Summoning Glow inside a red-lit PC setup",
  },
  {
    relativePath: "customer-photos/originals/customer-02-red-pc-wide.png",
    filename: "customer-02-red-pc-wide.png",
    alt: "Wide customer view of Summoning Glow beside illuminated PC fans",
  },
  {
    relativePath: "customer-photos/originals/customer-03-white-pc-daylight.png",
    filename: "customer-03-white-pc-daylight.png",
    alt: "Customer display of Summoning Glow inside a white PC case with the lights off",
  },
  {
    relativePath: "customer-photos/originals/customer-04-desk-flash.png",
    filename: "customer-04-desk-flash.png",
    alt: "Customer desk photo showing the dragon and seven translucent spheres",
  },
  {
    relativePath: "customer-photos/upscaled/customer-05-rgb-desk-upscaled.png",
    filename: "customer-05-rgb-desk-upscaled.png",
    alt: "Customer RGB desk setup with the illuminated Summoning Glow display",
  },
  {
    relativePath: "customer-photos/upscaled/customer-06-unboxed-components-upscaled.png",
    filename: "customer-06-unboxed-components-upscaled.png",
    alt: "Customer unboxing photo of the Summoning Glow components before assembly",
  },
];

async function prepareFiles() {
  const files = [];
  for (const definition of definitions) {
    const absolutePath = path.join(PRODUCT_DIRECTORY, definition.relativePath);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) throw new CatalogApiError(`Customer photo is missing: ${definition.relativePath}`);
    if (metadata.size > 20 * 1024 * 1024) {
      throw new CatalogApiError(`Customer photo exceeds 20 MB: ${definition.relativePath}`);
    }
    files.push({
      ...definition,
      kind: "local",
      originalSource: definition.relativePath,
      absolutePath,
      mimeType: "image/png",
      fileSize: metadata.size,
    });
  }
  return files;
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const files = await prepareFiles();
  const preflight = {
    ok: true,
    mode: "summoning-glow-customer-photo-upload",
    access,
    fileCount: files.length,
    filenames: files.map((file) => file.filename),
    mutationsExecuted: false,
  };
  if (!CONFIRMED) {
    console.log(JSON.stringify({ ...preflight, confirmationRequired: true }, null, 2));
    return;
  }

  const uploadedFiles = [];
  for (const file of files) {
    uploadedFiles.push(
      await uploadCatalogImageFile(client, file, {
        duplicateResolutionMode: "REPLACE",
      }),
    );
  }
  console.log(
    JSON.stringify(
      {
        ...preflight,
        mutationsExecuted: true,
        uploadedFiles,
        safety: "Customer photos were uploaded to Shopify Files only. No product status or publication changed.",
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        details: error instanceof CatalogApiError ? error.details : {},
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
