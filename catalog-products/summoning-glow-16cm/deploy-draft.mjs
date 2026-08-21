#!/usr/bin/env node
import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest, removeUndefined } from "../../tools/zenkai-catalog-api/manifest.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const PRODUCT_ID = "gid://shopify/Product/9420750880873";
const VARIANT_ID = "gid://shopify/ProductVariant/47937153138793";
const PLACEHOLDER_FILE_ID = "gid://shopify/MediaImage/39950643134569";
const EXPECTED_CURRENT_HANDLES = new Set([
  "unannounced-collectible-3256808918476308",
  "summoning-glow-16cm-led-dragon-display",
]);
const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(PRODUCT_DIRECTORY, "product.manifest.json");
const CONFIRMED = process.argv.slice(2).includes("--confirm");

const PREFLIGHT_QUERY = `
  query SummoningGlowDraftPreflight($id: ID!, $handle: String!, $skuQuery: String!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      resourcePublications(first: 20) {
        nodes { isPublished publication { id name } }
      }
      variants(first: 10) {
        nodes { id title sku price inventoryItem { id tracked } }
      }
      media(first: 50) {
        nodes {
          id
          alt
          mediaContentType
          status
          ... on MediaImage { image { url } }
        }
      }
    }
    productByHandle(handle: $handle) { id title handle status }
    productVariants(first: 100, query: $skuQuery) {
      nodes { id sku product { id title handle } }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation UpdateSummoningGlowDraft($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title handle status templateSuffix }
      userErrors { field message }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = `
  mutation UpdateSummoningGlowVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id title sku price inventoryItem { id tracked } }
      userErrors { field message }
    }
  }
`;

const LINK_HERO_MUTATION = `
  mutation LinkSummoningGlowHero($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

const FILE_DELETE_MUTATION = `
  mutation DeleteSummoningGlowPlaceholder($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors { field message }
    }
  }
`;

const RESULT_QUERY = `
  query SummoningGlowDraftResult($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      descriptionHtml
      vendor
      productType
      tags
      seo { title description }
      resourcePublications(first: 20) {
        nodes { isPublished publication { id name } }
      }
      variants(first: 10) {
        nodes { id title sku price compareAtPrice inventoryItem { id tracked } }
      }
      media(first: 50) {
        nodes {
          id
          alt
          mediaContentType
          status
          ... on MediaImage { image { url } }
        }
      }
    }
  }
`;

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

function makeLocalImage(filename, alt, metadata) {
  return {
    kind: "local",
    originalSource: `generated-images/${filename}`,
    absolutePath: path.join(PRODUCT_DIRECTORY, "generated-images", filename),
    filename,
    mimeType: "image/png",
    fileSize: metadata.size,
    alt,
  };
}

async function prepareStoryImages() {
  const definitions = [
    [
      "story-01-shelf-centerpiece.png",
      "Illuminated green dragon display as the centerpiece of a dark collector shelf",
    ],
    [
      "story-02-light-detail.png",
      "Close detail of the painted dragon, glowing rings, amber effects, and seven spheres",
    ],
    [
      "story-03-desk-display.png",
      "Illuminated dragon collectible staged on a modern desk display",
    ],
  ];
  const images = [];
  for (const [filename, alt] of definitions) {
    const absolutePath = path.join(PRODUCT_DIRECTORY, "generated-images", filename);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) fail(`Story image is missing: ${filename}`);
    if (metadata.size > 20 * 1024 * 1024) fail(`Story image exceeds 20 MB: ${filename}`);
    images.push(makeLocalImage(filename, alt, metadata));
  }
  return images;
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const prepared = await loadManifest(MANIFEST_PATH);
  const manifest = prepared.manifest;
  if (manifest.variants.length !== 1) fail("This guarded deployment expects exactly one variant.");
  const desiredVariant = manifest.variants[0];
  const preflightData = await client.graphql(PREFLIGHT_QUERY, {
    id: PRODUCT_ID,
    handle: manifest.handle,
    skuQuery: `sku:\"${desiredVariant.sku.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"")}\"`,
  });
  const product = preflightData.product;
  const errors = [];
  if (!product) errors.push(`Product not found: ${PRODUCT_ID}`);
  if (product && product.status !== "DRAFT") errors.push(`Product must remain DRAFT, found ${product.status}.`);
  if (product && !EXPECTED_CURRENT_HANDLES.has(product.handle)) {
    errors.push(`Unexpected current handle for guarded product: ${product.handle}`);
  }
  if (product && (product.variants.nodes.length !== 1 || product.variants.nodes[0]?.id !== VARIANT_ID)) {
    errors.push("The guarded draft no longer has the expected single variant.");
  }
  if (product?.resourcePublications.nodes.some((node) => node.isPublished)) {
    errors.push("The draft is unexpectedly published on at least one sales channel.");
  }
  if (preflightData.productByHandle && preflightData.productByHandle.id !== PRODUCT_ID) {
    errors.push(`Desired handle is owned by another product: ${preflightData.productByHandle.id}`);
  }
  for (const conflict of preflightData.productVariants.nodes) {
    if (conflict.product.id !== PRODUCT_ID) {
      errors.push(`Desired SKU is owned by another product: ${conflict.product.id}`);
    }
  }
  const placeholder = product?.media.nodes.find((media) => media.id === PLACEHOLDER_FILE_ID) || null;
  if (placeholder && !placeholder.image?.url?.includes("temporary-placeholder.png")) {
    errors.push("The guarded placeholder file ID no longer points to temporary-placeholder.png.");
  }

  const preflight = {
    ok: errors.length === 0,
    mode: "guarded-draft-update",
    access,
    product: product
      ? {
          id: product.id,
          currentTitle: product.title,
          currentHandle: product.handle,
          currentStatus: product.status,
          currentSku: product.variants.nodes[0]?.sku || null,
          currentMediaCount: product.media.nodes.length,
          publishedChannelCount: product.resourcePublications.nodes.filter((node) => node.isPublished).length,
        }
      : null,
    desired: {
      title: manifest.title,
      handle: manifest.handle,
      status: "DRAFT",
      templateSuffix: manifest.templateSuffix,
      sku: desiredVariant.sku,
      price: desiredVariant.price,
      galleryImageCount: prepared.images.length,
      storyFileCount: 3,
    },
    placeholderWillBeRemoved: Boolean(placeholder),
    errors,
  };
  if (errors.length) fail("Summoning Glow draft update preflight failed; no mutations executed.", { preflight });
  if (!CONFIRMED) {
    console.log(JSON.stringify({ ...preflight, confirmationRequired: true, mutationsExecuted: false }, null, 2));
    return;
  }

  let stage = "productUpdate";
  try {
    const update = await client.graphql(PRODUCT_UPDATE_MUTATION, {
      product: removeUndefined({
        id: PRODUCT_ID,
        title: manifest.title.trim(),
        handle: manifest.handle,
        redirectNewHandle: true,
        descriptionHtml: manifest.descriptionHtml,
        vendor: manifest.vendor,
        productType: manifest.productType,
        tags: manifest.tags,
        templateSuffix: manifest.templateSuffix,
        seo: manifest.seo,
        status: "DRAFT",
      }),
    });
    assertNoUserErrors(update.productUpdate, "productUpdate");
    if (update.productUpdate.product?.status !== "DRAFT") fail("Product update did not preserve DRAFT status.");

    stage = "productVariantsBulkUpdate";
    const variantUpdate = await client.graphql(VARIANT_UPDATE_MUTATION, {
      productId: PRODUCT_ID,
      variants: [
        removeUndefined({
          id: VARIANT_ID,
          price: desiredVariant.price,
          compareAtPrice: desiredVariant.compareAtPrice ?? null,
          taxable: desiredVariant.taxable ?? true,
          inventoryPolicy: desiredVariant.inventoryPolicy || "DENY",
          inventoryItem: removeUndefined({
            sku: desiredVariant.sku.trim(),
            tracked: desiredVariant.tracked ?? true,
            requiresShipping: desiredVariant.requiresShipping ?? true,
            cost: desiredVariant.cost,
            measurement: desiredVariant.weight ? { weight: desiredVariant.weight } : undefined,
          }),
        }),
      ],
    });
    assertNoUserErrors(variantUpdate.productVariantsBulkUpdate, "productVariantsBulkUpdate");

    stage = "galleryUpload";
    const galleryFiles = [];
    for (const image of prepared.images) {
      galleryFiles.push(
        await uploadCatalogImageFile(client, image, {
          referencesToAdd: [PRODUCT_ID],
          duplicateResolutionMode: "REPLACE",
        }),
      );
    }

    stage = "variantHeroLink";
    const heroLink = await client.graphql(LINK_HERO_MUTATION, {
      productId: PRODUCT_ID,
      variants: [{ id: VARIANT_ID, mediaId: galleryFiles[0].id }],
    });
    assertNoUserErrors(heroLink.productVariantsBulkUpdate, "productVariantsBulkUpdate(hero)");

    stage = "storyFileUpload";
    const storyFiles = [];
    for (const image of await prepareStoryImages()) {
      storyFiles.push(
        await uploadCatalogImageFile(client, image, {
          duplicateResolutionMode: "REPLACE",
        }),
      );
    }

    let deletedPlaceholder = false;
    if (placeholder) {
      stage = "placeholderDelete";
      const deletion = await client.graphql(FILE_DELETE_MUTATION, {
        fileIds: [PLACEHOLDER_FILE_ID],
      });
      assertNoUserErrors(deletion.fileDelete, "fileDelete");
      deletedPlaceholder = deletion.fileDelete.deletedFileIds?.includes(PLACEHOLDER_FILE_ID) === true;
      if (!deletedPlaceholder) fail("Shopify did not confirm deletion of the temporary placeholder file.");
    }

    stage = "resultVerification";
    const result = (await client.graphql(RESULT_QUERY, { id: PRODUCT_ID })).product;
    if (!result) fail("Updated product could not be read back.");
    if (result.status !== "DRAFT") fail("Final verification found a non-DRAFT status.");
    if (result.resourcePublications.nodes.some((node) => node.isPublished)) {
      fail("Final verification found an unexpected publication.");
    }
    const readyImages = result.media.nodes.filter(
      (media) => media.mediaContentType === "IMAGE" && media.status === "READY",
    );
    if (readyImages.length < 5) fail("Final verification found fewer than five READY gallery images.");
    if (result.variants.nodes[0]?.sku !== desiredVariant.sku) fail("Final SKU verification failed.");
    if (result.variants.nodes[0]?.price !== desiredVariant.price) fail("Final price verification failed.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          mutationsExecuted: true,
          product: result,
          galleryFiles,
          storyFiles,
          deletedPlaceholder,
          safety: "Product remains DRAFT and unpublished on every sales channel.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        productId: PRODUCT_ID,
        recovery: "The product is guarded to remain DRAFT. Re-run preflight and inspect any completed media before retrying.",
      };
    }
    throw error;
  }
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
