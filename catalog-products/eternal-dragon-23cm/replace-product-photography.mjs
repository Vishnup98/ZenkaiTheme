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
  id: "gid://shopify/Product/9420423463017",
  handle: "eternal-wish-23cm-coiled-dragon-rider-display",
  variantId: "gid://shopify/ProductVariant/47934894473321",
  sku: "ZK-FIG-EW23-CD",
};
const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(PRODUCT_DIRECTORY, "product.manifest.json");
const CONFIRMED = process.argv.includes("--confirm");

const READ_QUERY = `
  query ReadEternalWishMedia($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      onlineStoreUrl
      variants(first: 10) {
        nodes { id sku price compareAtPrice availableForSale }
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

const LINK_HERO_MUTATION = `
  mutation LinkEternalWishHero($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku }
      userErrors { field message }
    }
  }
`;

const DETACH_MEDIA_MUTATION = `
  mutation DetachPriorEternalWishMedia($files: [FileUpdateInput!]!) {
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
    product.status !== "UNLISTED" ||
    product.variants.nodes.length !== 1 ||
    !variant ||
    variant.sku !== PRODUCT.sku ||
    variant.availableForSale !== true
  ) {
    fail("Eternal Wish identity or sellability guard failed; refusing media mutations.", {
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
    images.length !== 4 ||
    images.some((image) => !image.source.startsWith("product-photography/"))
  ) {
    fail("The guarded media manifest must contain exactly four product-photography images.", {
      images: manifest.images,
    });
  }

  const desiredAlts = manifest.images.map((image) => image.alt);
  const preflight = {
    ok: true,
    mode: "guarded-eternal-wish-product-photography-replacement",
    access,
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      onlineStoreUrl: product.onlineStoreUrl,
      variant,
      currentMedia: product.media.nodes,
    },
    desiredMedia: manifest.images,
    customerFilesPreservedForThemeGallery: [
      "customer-01.png",
      "customer-02.png",
      "customer-03.png",
      "customer-04.png",
    ],
  };

  if (!CONFIRMED) {
    console.log(JSON.stringify({
      ...preflight,
      confirmationRequired: true,
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  let stage = "uploadProductPhotography";
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
      fail("Shopify did not confirm the exact Eternal Wish hero link.", { linkedVariant });
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
      assertNoUserErrors(detached.fileUpdate, "fileUpdate(detach prior product media)");
    }

    stage = "verifyProductMedia";
    let finalProduct = await readProduct(client);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const desiredMedia = finalProduct.media.nodes.filter((media) => desiredAlts.includes(media.alt));
      const unexpectedMedia = finalProduct.media.nodes.filter((media) => !desiredAlts.includes(media.alt));
      if (
        desiredMedia.length === 4 &&
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
      finalDesiredMedia.length !== 4 ||
      finalDesiredMedia.some((media) => media.status !== "READY" || media.mediaContentType !== "IMAGE") ||
      finalUnexpectedMedia.length !== 0
    ) {
      fail("Eternal Wish product-media verification failed.", {
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
        onlineStoreUrl: finalProduct.onlineStoreUrl,
        variant: finalVariant,
        media: finalDesiredMedia,
      },
      detachedPriorProductMedia: priorMedia,
      safety: "Prior customer files were detached from product media, not deleted; the theme keeps them in the Seen in the Wild gallery.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        productId: PRODUCT.id,
        recovery: "Re-run the read-only preflight. Customer source files are never deleted by this workflow.",
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
