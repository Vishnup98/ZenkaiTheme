#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const PRODUCT = {
  id: "gid://shopify/Product/9421510049897",
  handle: "pixel-archive-103-piece-retro-card-sticker-pack",
  variantId: "gid://shopify/ProductVariant/47941701304425",
  sku: "ZK-STK-PA103",
};
const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(PRODUCT_DIRECTORY, "product.manifest.json");
const CONFIRMED = process.argv.includes("--confirm");

const READ_QUERY = `
  query ReadPixelArchiveMedia($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      variants(first: 10) { nodes { id sku price compareAtPrice } }
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

const LINK_HERO_MUTATION = `
  mutation LinkPixelArchiveHero($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

const DETACH_MEDIA_MUTATION = `
  mutation DetachPriorPixelArchiveMedia($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id alt fileStatus }
      userErrors { field message }
    }
  }
`;

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

function verifyIdentity(product) {
  const variant = product?.variants.nodes.find((node) => node.id === PRODUCT.variantId);
  if (
    !product ||
    product.id !== PRODUCT.id ||
    product.handle !== PRODUCT.handle ||
    !["DRAFT", "UNLISTED"].includes(product.status) ||
    product.variants.nodes.length !== 1 ||
    !variant ||
    variant.sku !== PRODUCT.sku ||
    variant.price !== "29.99" ||
    variant.compareAtPrice !== null
  ) {
    fail("Pixel Archive identity or pricing guard failed; refusing gallery mutations.", {
      expected: PRODUCT,
      actual: product,
    });
  }
  return variant;
}

async function readProduct(client) {
  return (await client.graphql(READ_QUERY, { id: PRODUCT.id })).product;
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const { manifest, images } = await loadManifest(MANIFEST_PATH);
  const product = await readProduct(client);
  const variant = verifyIdentity(product);

  if (
    images.length !== 6 ||
    images.some((image) => !image.source.startsWith("source-images/"))
  ) {
    fail("The guarded gallery must contain exactly six exact supplier images.", {
      images: manifest.images,
    });
  }

  const desiredAlts = manifest.images.map((image) => image.alt);
  if (new Set(desiredAlts).size !== desiredAlts.length) {
    fail("Every guarded supplier image must have a unique alt value.", { desiredAlts });
  }

  if (!CONFIRMED) {
    console.log(JSON.stringify({
      ok: true,
      mode: "guarded-pixel-archive-exact-gallery-sync",
      access,
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        variant,
        currentMedia: product.media.nodes,
      },
      desiredMedia: manifest.images,
      safety: "Prior product media will be detached from this product, not deleted from Shopify Files.",
      confirmationRequired: true,
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  let stage = "uploadExactSupplierImages";
  try {
    const uploaded = [];
    for (const image of images) {
      uploaded.push(await uploadCatalogImageFile(client, image, {
        referencesToAdd: [PRODUCT.id],
        duplicateResolutionMode: "REPLACE",
      }));
    }

    stage = "linkVariantHero";
    const hero = await client.graphql(LINK_HERO_MUTATION, {
      productId: PRODUCT.id,
      variants: [{ id: PRODUCT.variantId, mediaId: uploaded[0].id }],
    });
    assertNoUserErrors(hero.productVariantsBulkUpdate, "productVariantsBulkUpdate(hero)");
    const linkedVariant = hero.productVariantsBulkUpdate.productVariants?.[0];
    if (linkedVariant?.id !== PRODUCT.variantId || linkedVariant?.sku !== PRODUCT.sku) {
      fail("Shopify did not confirm the exact Pixel Archive hero association.", { linkedVariant });
    }

    const uploadedIds = new Set(uploaded.map((file) => file.id));
    const priorMedia = product.media.nodes.filter((media) => !uploadedIds.has(media.id));
    if (priorMedia.length) {
      stage = "detachPriorProductMedia";
      const detached = await client.graphql(DETACH_MEDIA_MUTATION, {
        files: priorMedia.map((media) => ({
          id: media.id,
          referencesToRemove: [PRODUCT.id],
        })),
      });
      assertNoUserErrors(detached.fileUpdate, "fileUpdate(detach prior Pixel Archive media)");
    }

    stage = "verifyExactSupplierGallery";
    let finalProduct = await readProduct(client);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const desiredMedia = finalProduct.media.nodes.filter((media) => desiredAlts.includes(media.alt));
      const unexpectedMedia = finalProduct.media.nodes.filter((media) => !desiredAlts.includes(media.alt));
      if (
        desiredMedia.length === images.length &&
        desiredMedia.every((media) => media.status === "READY" && media.mediaContentType === "IMAGE") &&
        unexpectedMedia.length === 0
      ) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      finalProduct = await readProduct(client);
    }

    const finalVariant = verifyIdentity(finalProduct);
    const finalDesiredMedia = finalProduct.media.nodes.filter((media) => desiredAlts.includes(media.alt));
    const finalUnexpectedMedia = finalProduct.media.nodes.filter((media) => !desiredAlts.includes(media.alt));
    if (
      finalDesiredMedia.length !== images.length ||
      finalDesiredMedia.some((media) => media.status !== "READY" || media.mediaContentType !== "IMAGE") ||
      finalUnexpectedMedia.length !== 0
    ) {
      fail("Pixel Archive exact supplier-gallery verification failed.", {
        finalDesiredMedia,
        finalUnexpectedMedia,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      product: {
        id: finalProduct.id,
        title: finalProduct.title,
        handle: finalProduct.handle,
        status: finalProduct.status,
        variant: finalVariant,
        media: finalDesiredMedia,
      },
      detachedPriorProductMedia: priorMedia,
      safety: "The prior generated gallery was detached from the product, not deleted from Shopify Files.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        productId: PRODUCT.id,
        recovery: "Re-run the read-only preflight. The guarded workflow never deletes prior Shopify Files.",
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
