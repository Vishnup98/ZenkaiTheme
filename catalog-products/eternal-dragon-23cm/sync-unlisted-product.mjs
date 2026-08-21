#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest, removeUndefined } from "../../tools/zenkai-catalog-api/manifest.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const PRODUCT_ID = "gid://shopify/Product/9420423463017";
const VARIANT_ID = "gid://shopify/ProductVariant/47934894473321";
const ALLOWED_CURRENT_HANDLES = new Set([
  "eternal-wish-24cm-dragon-hero-display-figure",
  "eternal-wish-23cm-coiled-dragon-rider-display",
]);
const ALLOWED_CURRENT_SKUS = new Set(["ZK-FIG-EW24-PVC", "ZK-FIG-EW23-CD"]);
const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(PRODUCT_DIRECTORY, "product.manifest.json");
const CONFIRMED = process.argv.slice(2).includes("--confirm");

const PREFLIGHT_QUERY = `
  query EternalWishCorrectionPreflight($id: ID!, $handle: String!, $skuQuery: String!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
      variants(first: 10) {
        nodes {
          id
          sku
          price
          compareAtPrice
          availableForSale
          inventoryPolicy
          inventoryItem { id tracked requiresShipping }
        }
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
  mutation CorrectEternalWishProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        status
        templateSuffix
        descriptionHtml
        seo { title description }
      }
      userErrors { field message }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = `
  mutation CorrectEternalWishVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
        price
        compareAtPrice
        inventoryPolicy
        inventoryItem { id tracked requiresShipping }
      }
      userErrors { field message }
    }
  }
`;

const LINK_HERO_MUTATION = `
  mutation LinkEternalWishHero($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

const DETACH_OLD_MEDIA_MUTATION = `
  mutation DetachRejectedEternalWishMedia($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id alt fileStatus }
      userErrors { field message }
    }
  }
`;

const RESULT_QUERY = `
  query EternalWishCorrectionResult($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      descriptionHtml
      vendor
      productType
      tags
      seo { title description }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
      variants(first: 10) {
        nodes {
          id
          sku
          price
          compareAtPrice
          availableForSale
          inventoryPolicy
          inventoryItem { id tracked requiresShipping }
        }
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

function normalizeHtml(value) {
  return String(value || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSearchValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function readPreflight(client, manifest) {
  const desiredSku = manifest.variants[0].sku;
  return client.graphql(PREFLIGHT_QUERY, {
    id: PRODUCT_ID,
    handle: manifest.handle,
    skuQuery: `sku:"${escapeSearchValue(desiredSku)}"`,
  });
}

function verifyPreflight(data, manifest) {
  const errors = [];
  const product = data.product;
  const variant = product?.variants.nodes[0] || null;
  if (!product) errors.push(`Product was not found: ${PRODUCT_ID}`);
  if (product?.id !== PRODUCT_ID) errors.push("Product ID guard failed.");
  if (product && !ALLOWED_CURRENT_HANDLES.has(product.handle)) {
    errors.push(`Unexpected current handle: ${product.handle}`);
  }
  if (product?.status !== "UNLISTED") {
    errors.push(`Product must remain UNLISTED; found ${product?.status || "missing"}.`);
  }
  if (product && (product.variants.nodes.length !== 1 || variant?.id !== VARIANT_ID)) {
    errors.push("Expected exactly the guarded Eternal Wish variant.");
  }
  if (variant && !ALLOWED_CURRENT_SKUS.has(variant.sku)) {
    errors.push(`Unexpected current SKU: ${variant.sku}`);
  }
  if (data.productByHandle && data.productByHandle.id !== PRODUCT_ID) {
    errors.push(`Desired handle belongs to another product: ${data.productByHandle.id}`);
  }
  for (const conflict of data.productVariants.nodes) {
    if (conflict.product.id !== PRODUCT_ID) {
      errors.push(`Desired SKU belongs to another product: ${conflict.product.id}`);
    }
  }
  if (manifest.variants.length !== 1) errors.push("Manifest must contain exactly one variant.");
  if (manifest.images.length !== 4) errors.push("Manifest must contain exactly four corrected customer images.");
  return { product, variant, errors };
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const prepared = await loadManifest(MANIFEST_PATH);
  const manifest = prepared.manifest;
  const desiredVariant = manifest.variants[0];
  const data = await readPreflight(client, manifest);
  const { product, variant, errors } = verifyPreflight(data, manifest);

  const preflight = {
    ok: errors.length === 0,
    mode: "guarded-unlisted-source-correction",
    access,
    product: product
      ? {
          id: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          onlineStoreUrl: product.onlineStoreUrl,
          sku: variant?.sku || null,
          price: variant?.price || null,
          compareAtPrice: variant?.compareAtPrice || null,
          media: product.media.nodes,
          publications: product.resourcePublications.nodes,
        }
      : null,
    desired: {
      title: manifest.title,
      handle: manifest.handle,
      status: "UNLISTED",
      sku: desiredVariant.sku,
      price: desiredVariant.price,
      compareAtPrice: desiredVariant.compareAtPrice,
      correctedCustomerImageCount: prepared.images.length,
    },
    errors,
  };
  if (errors.length) fail("Eternal Wish correction preflight failed; no mutations executed.", { preflight });
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
        status: "UNLISTED",
      }),
    });
    assertNoUserErrors(update.productUpdate, "productUpdate");
    const updatedProduct = update.productUpdate.product;
    if (
      updatedProduct?.id !== PRODUCT_ID ||
      updatedProduct?.handle !== manifest.handle ||
      updatedProduct?.status !== "UNLISTED" ||
      normalizeHtml(updatedProduct?.descriptionHtml) !== normalizeHtml(manifest.descriptionHtml)
    ) {
      fail("Shopify did not return the exact corrected product identity and copy.", { updatedProduct });
    }

    stage = "variantUpdate";
    const variantUpdate = await client.graphql(VARIANT_UPDATE_MUTATION, {
      productId: PRODUCT_ID,
      variants: [
        removeUndefined({
          id: VARIANT_ID,
          price: desiredVariant.price,
          compareAtPrice: desiredVariant.compareAtPrice,
          taxable: desiredVariant.taxable ?? true,
          inventoryPolicy: desiredVariant.inventoryPolicy || "CONTINUE",
          inventoryItem: removeUndefined({
            sku: desiredVariant.sku.trim(),
            tracked: desiredVariant.tracked ?? true,
            requiresShipping: desiredVariant.requiresShipping ?? true,
          }),
        }),
      ],
    });
    assertNoUserErrors(variantUpdate.productVariantsBulkUpdate, "productVariantsBulkUpdate");
    const updatedVariant = variantUpdate.productVariantsBulkUpdate.productVariants?.[0];
    if (
      updatedVariant?.id !== VARIANT_ID ||
      updatedVariant?.sku !== desiredVariant.sku ||
      updatedVariant?.price !== desiredVariant.price ||
      updatedVariant?.compareAtPrice !== desiredVariant.compareAtPrice ||
      updatedVariant?.inventoryPolicy !== "CONTINUE" ||
      updatedVariant?.inventoryItem?.tracked !== true ||
      updatedVariant?.inventoryItem?.requiresShipping !== true
    ) {
      fail("Shopify did not return the exact corrected Eternal Wish variant.", { updatedVariant });
    }

    stage = "correctedImageUpload";
    const correctedFiles = [];
    for (const image of prepared.images) {
      correctedFiles.push(
        await uploadCatalogImageFile(client, image, {
          referencesToAdd: [PRODUCT_ID],
          duplicateResolutionMode: "REPLACE",
        }),
      );
    }

    stage = "variantHeroLink";
    const heroLink = await client.graphql(LINK_HERO_MUTATION, {
      productId: PRODUCT_ID,
      variants: [{ id: VARIANT_ID, mediaId: correctedFiles[0].id }],
    });
    assertNoUserErrors(heroLink.productVariantsBulkUpdate, "productVariantsBulkUpdate(hero)");

    const correctedIds = new Set(correctedFiles.map((file) => file.id));
    const rejectedMedia = product.media.nodes.filter((media) => !correctedIds.has(media.id));
    if (rejectedMedia.length) {
      stage = "detachRejectedMedia";
      const detached = await client.graphql(DETACH_OLD_MEDIA_MUTATION, {
        files: rejectedMedia.map((media) => ({ id: media.id, referencesToRemove: [PRODUCT_ID] })),
      });
      assertNoUserErrors(detached.fileUpdate, "fileUpdate(detach rejected media)");
    }

    stage = "resultVerification";
    const result = (await client.graphql(RESULT_QUERY, { id: PRODUCT_ID })).product;
    if (!result) fail("Corrected product could not be read back.");
    const finalVariant = result.variants.nodes[0];
    const expectedAlts = new Set(manifest.images.map((image) => image.alt));
    const correctedMedia = result.media.nodes.filter((media) => expectedAlts.has(media.alt));
    const unexpectedMedia = result.media.nodes.filter((media) => !expectedAlts.has(media.alt));
    if (
      result.title !== manifest.title ||
      result.handle !== manifest.handle ||
      result.status !== "UNLISTED" ||
      result.templateSuffix !== manifest.templateSuffix ||
      normalizeHtml(result.descriptionHtml) !== normalizeHtml(manifest.descriptionHtml) ||
      result.seo?.title !== manifest.seo.title ||
      result.seo?.description !== manifest.seo.description
    ) {
      fail("Final product-copy verification failed.", { result });
    }
    if (
      finalVariant?.id !== VARIANT_ID ||
      finalVariant?.sku !== desiredVariant.sku ||
      finalVariant?.price !== desiredVariant.price ||
      finalVariant?.compareAtPrice !== desiredVariant.compareAtPrice ||
      finalVariant?.inventoryPolicy !== "CONTINUE" ||
      finalVariant?.availableForSale !== true ||
      finalVariant?.inventoryItem?.tracked !== true
    ) {
      fail("Final variant verification failed.", { finalVariant });
    }
    if (
      correctedMedia.length !== 4 ||
      correctedMedia.some((media) => media.status !== "READY" || media.mediaContentType !== "IMAGE") ||
      unexpectedMedia.length
    ) {
      fail("Final corrected-media verification failed.", { correctedMedia, unexpectedMedia });
    }

    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      product: result,
      correctedFiles,
      detachedRejectedMedia: rejectedMedia,
      safety: "The exact Zenkai product remains UNLISTED; rejected-source media was detached, not deleted.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        productId: PRODUCT_ID,
        recovery: "Re-run the read-only preflight. The exact product is guarded to remain UNLISTED, and prior media files are detached rather than deleted.",
      };
    }
    throw error;
  }
}

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    details: error instanceof CatalogApiError ? error.details : {},
  }, null, 2));
  process.exitCode = 1;
});
