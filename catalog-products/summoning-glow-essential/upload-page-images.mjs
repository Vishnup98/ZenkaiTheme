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
  ["generated-images/story-01-shelf-centerpiece-v2.jpg", "sg-essential-story-01-shelf-centerpiece.jpg", "Summoning Glow Essential on a dark collector shelf"],
  ["generated-images/story-02-light-detail-v2.jpg", "sg-essential-story-02-light-detail.jpg", "Close detail of the Summoning Glow Essential dragon and RGB base"],
  ["generated-images/story-03-desk-display-v2.jpg", "sg-essential-story-03-desk-display.jpg", "Summoning Glow Essential displayed on a modern wooden desk"],
  ["generated-images/gallery-01-hero-v2.jpg", "sg-essential-gallery-01-hero.jpg", "Summoning Glow Essential with seven star-marked spheres on an RGB base"],
  ["generated-images/gallery-04-detail-v2.jpg", "sg-essential-gallery-04-detail.jpg", "Close view of the no-explosion dragon display and its seven spheres"],
  ["customer-photos/essential-customer-01-rgb-display.jpg", "sg-essential-customer-01-rgb-display.jpg", "Customer RGB display of Summoning Glow Essential"],
  ["customer-photos/essential-customer-02-green-desk.jpg", "sg-essential-customer-02-green-desk.jpg", "Customer desk display of Summoning Glow Essential"],
  ["customer-photos/essential-customer-03-daylight-remote.jpg", "sg-essential-customer-03-daylight-remote.jpg", "Customer daylight view of the display with its remote"],
  ["customer-photos/essential-customer-04-red-rgb.jpg", "sg-essential-customer-04-red-rgb.jpg", "Customer photo of the display in red light mode"],
  ["customer-photos/essential-customer-05-collector-shelf.jpg", "sg-essential-customer-05-collector-shelf.jpg", "Customer collector-shelf setup with the dragon display"],
  ["customer-photos/essential-customer-06-blue-red-setup.jpg", "sg-essential-customer-06-blue-red-setup.jpg", "Customer blue and red collector setup with the dragon display"],
];

async function prepareFiles() {
  const files = [];
  for (const [relativePath, filename, alt] of definitions) {
    const absolutePath = path.join(PRODUCT_DIRECTORY, relativePath);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) throw new CatalogApiError(`Page image is missing: ${relativePath}`);
    if (metadata.size > 20 * 1024 * 1024) throw new CatalogApiError(`Page image exceeds 20 MB: ${relativePath}`);
    files.push({
      relativePath,
      filename,
      alt,
      kind: "local",
      originalSource: relativePath,
      absolutePath,
      mimeType: "image/jpeg",
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
    mode: "summoning-glow-essential-page-image-upload",
    access,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.fileSize, 0),
    filenames: files.map((file) => file.filename),
    mutationsExecuted: false,
  };
  if (!CONFIRMED) {
    console.log(JSON.stringify({ ...preflight, confirmationRequired: true }, null, 2));
    return;
  }

  const uploadedFiles = [];
  for (const file of files) {
    uploadedFiles.push(await uploadCatalogImageFile(client, file, { duplicateResolutionMode: "REPLACE" }));
  }
  console.log(JSON.stringify({
    ...preflight,
    mutationsExecuted: true,
    uploadedFiles,
    safety: "Only product-page images were uploaded to Shopify Files; product status and publication were not changed.",
  }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    details: error instanceof CatalogApiError ? error.details : {},
  }, null, 2));
  process.exitCode = 1;
});
