import {
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const PRODUCT = {
  id: "gid://shopify/Product/9428268515433",
  handle: "evolution-companions-complete-8-plush-collector-set",
  sku: "ZK-PLUSH-EVO-8",
  status: "UNLISTED",
};
const MANIFEST_PATH =
  "catalog-products/evolution-companions-8-plush-set/product.manifest.json";
const SOURCE_IMAGE_PREFIX = "source-images/";

const READ_QUERY = `
  query ReadEvolutionCompanionsGallery($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      variants(first: 10) { nodes { id sku } }
      media(first: 100) {
        nodes {
          id
          alt
          status
          mediaContentType
          ... on MediaImage { image { url } }
        }
      }
    }
  }
`;

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

function verifyIdentity(product) {
  if (!product) fail(`Guarded product was not found: ${PRODUCT.id}`);
  if (
    product.id !== PRODUCT.id ||
    product.handle !== PRODUCT.handle ||
    product.status !== PRODUCT.status
  ) {
    fail("Product identity guard failed; refusing gallery mutations.", {
      expected: PRODUCT,
      actual: {
        id: product.id,
        handle: product.handle,
        status: product.status,
        title: product.title,
      },
    });
  }
  if (
    product.variants.nodes.length !== 1 ||
    product.variants.nodes[0].sku !== PRODUCT.sku
  ) {
    fail("Variant identity guard failed; refusing gallery mutations.", {
      expectedSku: PRODUCT.sku,
      variants: product.variants.nodes,
    });
  }
}

function readyImageAlts(product) {
  return new Set(
    product.media.nodes
      .filter(
        (media) =>
          media.mediaContentType === "IMAGE" &&
          media.status === "READY" &&
          media.alt,
      )
      .map((media) => media.alt),
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readProduct(client) {
  return (await client.graphql(READ_QUERY, { id: PRODUCT.id })).product;
}

async function waitForAttachedImages(client, desiredImages) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const product = await readProduct(client);
    verifyIdentity(product);
    const alts = readyImageAlts(product);
    if (desiredImages.every((image) => alts.has(image.alt))) return product;
    if (attempt < 20) await delay(2000);
  }
  fail("Timed out waiting for the eight product portraits to become ready.");
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const prepared = await loadManifest(MANIFEST_PATH);
  const desiredImages = prepared.images.filter((image) =>
    image.originalSource.startsWith(SOURCE_IMAGE_PREFIX),
  );
  if (desiredImages.length !== 8) {
    fail("Gallery manifest guard requires exactly eight individual product portraits.", {
      desiredImages: desiredImages.map((image) => image.originalSource),
    });
  }

  const before = await readProduct(client);
  verifyIdentity(before);
  const beforeAlts = readyImageAlts(before);
  const imagesToUpload = desiredImages.filter((image) => !beforeAlts.has(image.alt));

  if (!confirm) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "guarded-product-gallery-sync",
          access,
          product: {
            id: before.id,
            title: before.title,
            handle: before.handle,
            status: before.status,
            currentReadyImages: before.media.nodes.filter(
              (media) => media.mediaContentType === "IMAGE" && media.status === "READY",
            ).length,
          },
          desired: {
            productPortraits: desiredImages.map((image) => ({
              source: image.originalSource,
              alt: image.alt,
            })),
            uploadsNeeded: imagesToUpload.length,
            behavior:
              "Append only missing product portraits. Preserve the generated hero and all customer photos for downstream social-proof sections.",
          },
          confirmationRequired: imagesToUpload.length > 0,
          mutationsExecuted: false,
          nextCommand: imagesToUpload.length
            ? `node ${process.argv[1]} --confirm`
            : null,
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const image of imagesToUpload) {
    await uploadCatalogImageFile(client, image, {
      referencesToAdd: [PRODUCT.id],
      duplicateResolutionMode: "APPEND_UUID",
    });
  }

  const after = await waitForAttachedImages(client, desiredImages);
  const finalAlts = readyImageAlts(after);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mutationsExecuted: imagesToUpload.length > 0,
        product: {
          id: after.id,
          title: after.title,
          handle: after.handle,
          status: after.status,
          readyImageCount: after.media.nodes.filter(
            (media) => media.mediaContentType === "IMAGE" && media.status === "READY",
          ).length,
        },
        productPortraitsReady: desiredImages.map((image) => ({
          alt: image.alt,
          ready: finalAlts.has(image.alt),
        })),
        preservedCustomerPhotos: after.media.nodes.filter((media) =>
          media.alt?.startsWith("Customer"),
        ).length,
        safety:
          "No existing media was deleted. The theme filters customer photos out of the hero carousel and uses them only downstream.",
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
