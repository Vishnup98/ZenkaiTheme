import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";

let PRODUCT;

function manifestPathFromArguments() {
  const index = process.argv.indexOf("--manifest");
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return "catalog-products/pixel-sticker-pack-103/product.manifest.json";
}

const READ_QUERY = `
  query ReadPixelDexLaunch($handle: String!) {
    currentAppInstallation { accessScopes { handle } }
    productByHandle(handle: $handle) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      variants(first: 10) {
        nodes {
          id
          sku
          price
          compareAtPrice
          availableForSale
          inventoryPolicy
          inventoryQuantity
          sellableOnlineQuantity
          inventoryItem { id tracked }
        }
      }
      media(first: 20) {
        nodes {
          id
          status
          mediaContentType
          ... on MediaImage { image { url altText } }
        }
      }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
    }
    publications(first: 100) { nodes { id name } }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation SetPixelDexUnlisted($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title handle status templateSuffix }
      userErrors { field message }
    }
  }
`;

const PUBLISH_MUTATION = `
  mutation PublishPixelDex($id: ID!, $input: [PublicationInput!]!, $publicationId: ID!) {
    publishablePublish(id: $id, input: $input) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
    }
  }
`;

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

function publishedChannels(product) {
  return product.resourcePublications.nodes
    .filter((node) => node.isPublished)
    .map((node) => ({ id: node.publication.id, name: node.publication.name }));
}

function verifyProduct(product, { final = false } = {}) {
  if (!product) fail(`Product was not found by guarded handle: ${PRODUCT.handle}`);
  if (
    product.title !== PRODUCT.title ||
    product.handle !== PRODUCT.handle ||
    product.templateSuffix !== PRODUCT.templateSuffix
  ) {
    fail("Product identity guard failed; refusing launch mutations.", {
      expected: PRODUCT,
      actual: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        templateSuffix: product.templateSuffix,
      },
    });
  }
  if (product.variants.nodes.length !== 1) {
    fail("The guarded product must have exactly one variant.", { variants: product.variants.nodes });
  }
  const variant = product.variants.nodes[0];
  if (
    variant.sku !== PRODUCT.sku ||
    variant.price !== PRODUCT.price ||
    variant.compareAtPrice !== PRODUCT.compareAtPrice ||
    variant.inventoryPolicy !== "CONTINUE" ||
    variant.inventoryItem?.tracked !== true
  ) {
    fail("Product variant guard failed; refusing launch mutations.", {
      expected: PRODUCT,
      actual: variant,
    });
  }
  const readyImages = product.media.nodes.filter(
    (media) => media.mediaContentType === "IMAGE" && media.status === "READY",
  );
  if (readyImages.length !== PRODUCT.expectedImageCount) {
    fail("The product does not have the exact reviewed image set ready yet.", {
      expectedReadyImages: PRODUCT.expectedImageCount,
      actualReadyImages: readyImages.length,
      media: product.media.nodes,
    });
  }
  if (final && (
    product.status !== "UNLISTED" ||
    variant.availableForSale !== true ||
    variant.inventoryQuantity < 1 ||
    variant.sellableOnlineQuantity < 1
  )) {
    fail("Final unlisted sellability verification failed.", { product, variant });
  }
  return { variant, readyImages };
}

async function readState(client) {
  return client.graphql(READ_QUERY, { handle: PRODUCT.handle });
}

async function setUnlisted(client, product) {
  if (product.status === "UNLISTED") return;
  if (product.status !== "DRAFT") {
    fail("The product must be DRAFT or already UNLISTED before launch.", {
      productId: product.id,
      currentStatus: product.status,
    });
  }
  const data = await client.graphql(PRODUCT_UPDATE_MUTATION, {
    product: { id: product.id, status: "UNLISTED" },
  });
  assertNoUserErrors(data.productUpdate, "productUpdate");
  if (data.productUpdate.product?.status !== "UNLISTED") {
    fail("Shopify did not return the product as UNLISTED.");
  }
}

async function publishToOnlineStore(client, product, onlineStore) {
  const alreadyPublished = product.resourcePublications.nodes.some(
    (node) => node.isPublished && node.publication.id === onlineStore.id,
  );
  if (alreadyPublished) return;
  const data = await client.graphql(PUBLISH_MUTATION, {
    id: product.id,
    input: [{ publicationId: onlineStore.id }],
    publicationId: onlineStore.id,
  });
  assertNoUserErrors(data.publishablePublish, "publishablePublish");
  if (data.publishablePublish.publishable?.publishedOnPublication !== true) {
    fail("Shopify did not confirm the product on the Online Store publication.");
  }
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const { manifest } = await loadManifest(manifestPathFromArguments());
  if (manifest.variants.length !== 1) {
    fail("The generic unlisted launcher requires exactly one manifest variant.");
  }
  PRODUCT = {
    title: manifest.title,
    handle: manifest.handle,
    templateSuffix: manifest.templateSuffix,
    sku: manifest.variants[0].sku,
    price: manifest.variants[0].price,
    compareAtPrice: manifest.variants[0].compareAtPrice ?? null,
    expectedImageCount: manifest.images.length,
  };
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const before = await readState(client);
  const productState = verifyProduct(before.productByHandle);
  const onlineStore = before.publications.nodes.find(({ name }) => name === "Online Store");
  if (!onlineStore) fail("Online Store publication was not found; refusing launch mutations.");

  if (!confirm) {
    console.log(JSON.stringify({
      ok: true,
      mode: "guarded-single-product-unlisted-launch",
      access,
      product: {
        id: before.productByHandle.id,
        title: before.productByHandle.title,
        status: before.productByHandle.status,
        onlineStoreUrl: before.productByHandle.onlineStoreUrl,
        variant: productState.variant,
        readyImageCount: productState.readyImages.length,
        publishedChannels: publishedChannels(before.productByHandle),
      },
      desired: {
        status: "UNLISTED",
        publication: onlineStore,
        price: PRODUCT.price,
        compareAtPrice: PRODUCT.compareAtPrice,
      },
      confirmationRequired: true,
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  let stage = "setUnlisted";
  try {
    await setUnlisted(client, before.productByHandle);
    stage = "publishOnlineStore";
    const afterStatus = await readState(client);
    await publishToOnlineStore(client, afterStatus.productByHandle, onlineStore);
    stage = "finalVerification";
    const after = await readState(client);
    const finalState = verifyProduct(after.productByHandle, { final: true });
    const channels = publishedChannels(after.productByHandle);
    if (!channels.some((channel) => channel.id === onlineStore.id)) {
      fail("The product is not published to Online Store.", { channels });
    }
    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      product: {
        id: after.productByHandle.id,
        title: after.productByHandle.title,
        handle: after.productByHandle.handle,
        status: after.productByHandle.status,
        onlineStoreUrl: after.productByHandle.onlineStoreUrl,
        variant: finalState.variant,
        readyImageCount: finalState.readyImages.length,
        publishedChannels: channels,
      },
      safety: "The product is UNLISTED and reachable by direct URL or cart offer, but is not a normal browse/search product.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        recovery: "Re-run this command without --confirm. It is safe to retry and never deletes the product.",
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
