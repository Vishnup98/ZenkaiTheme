import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { uploadCatalogImageFile } from "../../tools/zenkai-catalog-api/operations.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const themeRoot = path.resolve(directory, "../..");
const statePath = path.join(directory, "shopify-state.json");

const productSpec = {
  title: "Legendary Skies — Complete 3-Plush Collector Set",
  handle: "legendary-skies-complete-3-plush-collector-set",
  templateSuffix: "legendary-skies",
  sku: "ZK-PLUSH-LEGENDARY-SKIES-3",
  price: "0.00",
  vendor: "Zenkai Clothing",
  productType: "Plush Collector Set",
  tags: [
    "3 Piece Set",
    "Complete Collection",
    "Legendary Skies",
    "Plush Collector Set",
    "Unlisted Preview",
  ],
  descriptionHtml: [
    "<p><strong>Three icons. One legendary set.</strong></p>",
    "<p>Storm, frost, and flame come together in one complete three-plush collector set. You receive one yellow plush, one blue plush, and one orange plush—the full trio pictured.</p>",
    "<h3>All three included</h3>",
    "<p>Every pictured design is included. Each plush is approximately 12 inches tall and features its own embroidered expression, color story, wing shape, and soft-touch construction.</p>",
    "<h3>Preview status</h3>",
    "<p>This unlisted product is being prepared for release. Final pricing, inventory, and purchasing availability will be added before launch.</p>",
  ].join(""),
  seo: {
    title: "Legendary Skies Complete 3-Plush Collector Set | Zenkai",
    description:
      "Meet the complete Legendary Skies trio: three approximately 12-inch plushes with distinct storm, frost, and flame designs.",
  },
};

const images = [
  ["legendary-skies-trio-hero.webp", "Legendary Skies complete three-plush collector set"],
  ["legendary-skies-trio-lineup.webp", "Yellow, blue, and orange Legendary Skies plush lineup"],
  ["legendary-skies-yellow-portrait.webp", "Yellow Legendary Skies plush"],
  ["legendary-skies-blue-portrait.webp", "Blue Legendary Skies plush"],
  ["legendary-skies-orange-portrait.webp", "Orange Legendary Skies plush"],
  ["legendary-skies-trio-lifestyle.webp", "Legendary Skies plush trio displayed in a warm living space"],
  ["legendary-skies-trio-story.webp", "Legendary Skies storm, frost, and flame editorial scene"],
  ["legendary-skies-trio-details.webp", "Legendary Skies plush embroidery and material details"],
  ["legendary-skies-trio-scale.webp", "Legendary Skies plush trio beside a book and lamp for scale"],
].map(([filename, alt]) => ({
  filename,
  alt,
  absolutePath: path.join(themeRoot, "assets", filename),
}));

const readQuery = `
  query ReadLegendarySkiesProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      onlineStorePreviewUrl
      variants(first: 10) {
        nodes {
          id
          sku
          price
          availableForSale
          inventoryPolicy
          inventoryQuantity
          sellableOnlineQuantity
          inventoryItem { id tracked requiresShipping }
        }
      }
      media(first: 30) {
        nodes {
          id
          alt
          status
          mediaContentType
          ... on MediaImage { image { url width height } }
        }
      }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
    }
    publications(first: 100) { nodes { id name } }
  }
`;

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { createdAt: new Date().toISOString(), images: [] };
    throw error;
  }
}

async function saveState(state) {
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function publishedChannels(product) {
  return product.resourcePublications.nodes
    .filter((node) => node.isPublished)
    .map((node) => ({ id: node.publication.id, name: node.publication.name }));
}

function assertIdentity(product, state) {
  if (!product) return;
  if (
    product.title !== productSpec.title ||
    product.handle !== productSpec.handle ||
    product.templateSuffix !== productSpec.templateSuffix
  ) {
    throw new CatalogApiError("Existing product identity does not match the guarded specification.", {
      expected: productSpec,
      actual: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        templateSuffix: product.templateSuffix,
      },
    });
  }
  if (state.productId && state.productId !== product.id) {
    throw new CatalogApiError("Local product state points to a different Shopify product.", {
      stateProductId: state.productId,
      actualProductId: product.id,
    });
  }
  if (!state.productId) {
    throw new CatalogApiError(
      "The handle already exists without a matching local creation record; refusing mutations.",
      { productId: product.id },
    );
  }
}

async function run() {
  const apply = process.argv.includes("--apply");
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const state = await loadState();
  let snapshot = await client.graphql(readQuery, { handle: productSpec.handle });
  let product = snapshot.productByHandle;
  assertIdentity(product, state);

  const onlineStore = snapshot.publications.nodes.find(({ name }) => name === "Online Store");
  if (!onlineStore) throw new CatalogApiError("Online Store publication is unavailable.");

  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      mode: "read-only-unlisted-product-plan",
      access,
      existing: product,
      proposed: {
        ...productSpec,
        status: "UNLISTED",
        publication: onlineStore,
        imageCount: images.length,
        inventoryTracked: true,
        inventoryQuantity: 0,
        availableForSale: false,
      },
      safety: {
        purchaseReadyInTemplate: false,
        placeholderPrice: productSpec.price,
        zeroInventory: true,
        discoverability: "UNLISTED; direct URL only after publication",
      },
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  if (!product) {
    const created = await client.graphql(`
      mutation CreateLegendarySkiesProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id title handle status templateSuffix variants(first: 1) { nodes { id } } }
          userErrors { field message }
        }
      }
    `, {
      product: {
        title: productSpec.title,
        handle: productSpec.handle,
        status: "DRAFT",
        vendor: productSpec.vendor,
        productType: productSpec.productType,
        templateSuffix: productSpec.templateSuffix,
        tags: productSpec.tags,
        descriptionHtml: productSpec.descriptionHtml,
        seo: productSpec.seo,
      },
    });
    assertNoUserErrors(created.productCreate, "productCreate");
    product = created.productCreate.product;
    if (!product?.id || product.status !== "DRAFT") {
      throw new CatalogApiError("Shopify did not return a guarded DRAFT product.");
    }
    state.productId = product.id;
    state.handle = productSpec.handle;
    state.variantId = product.variants.nodes[0]?.id;
    await saveState(state);
  }

  snapshot = await client.graphql(readQuery, { handle: productSpec.handle });
  product = snapshot.productByHandle;
  assertIdentity(product, state);
  if (!["DRAFT", "UNLISTED"].includes(product.status)) {
    throw new CatalogApiError("The guarded product must remain DRAFT or UNLISTED during setup.", {
      currentStatus: product.status,
    });
  }
  if (product.variants.nodes.length !== 1) {
    throw new CatalogApiError("The guarded product must have exactly one variant.");
  }

  const variant = product.variants.nodes[0];
  if (
    variant.sku !== productSpec.sku ||
    variant.price !== productSpec.price ||
    variant.inventoryItem?.tracked !== true ||
    variant.inventoryItem?.requiresShipping !== true ||
    variant.inventoryPolicy !== "DENY"
  ) {
    const updated = await client.graphql(`
      mutation ConfigureLegendarySkiesVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id sku price inventoryPolicy
            inventoryItem { id tracked requiresShipping }
          }
          userErrors { field message }
        }
      }
    `, {
      productId: product.id,
      variants: [{
        id: variant.id,
        price: productSpec.price,
        inventoryPolicy: "DENY",
        inventoryItem: {
          sku: productSpec.sku,
          tracked: true,
          requiresShipping: true,
        },
        taxable: true,
      }],
    });
    assertNoUserErrors(updated.productVariantsBulkUpdate, "productVariantsBulkUpdate");
    state.variantId = updated.productVariantsBulkUpdate.productVariants[0]?.id;
    await saveState(state);
  }

  for (const image of images) {
    if (state.images.some((entry) => entry.filename === image.filename)) continue;
    const fileStats = await fs.stat(image.absolutePath);
    const uploaded = await uploadCatalogImageFile(client, {
      kind: "local",
      absolutePath: image.absolutePath,
      filename: image.filename,
      fileSize: fileStats.size,
      mimeType: "image/webp",
      originalSource: image.absolutePath,
      alt: image.alt,
    }, { referencesToAdd: [product.id] });
    state.images.push({ filename: image.filename, alt: image.alt, ...uploaded });
    await saveState(state);
    console.log(`Uploaded ${image.filename}`);
  }

  snapshot = await client.graphql(readQuery, { handle: productSpec.handle });
  product = snapshot.productByHandle;
  if (product.media.nodes.filter((media) => media.status === "READY").length !== images.length) {
    throw new CatalogApiError("The complete nine-image set is not READY in Shopify.", {
      media: product.media.nodes,
    });
  }

  if (product.status !== "UNLISTED") {
    const statusUpdate = await client.graphql(`
      mutation SetLegendarySkiesUnlisted($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id status }
          userErrors { field message }
        }
      }
    `, { product: { id: product.id, status: "UNLISTED" } });
    assertNoUserErrors(statusUpdate.productUpdate, "productUpdate");
    if (statusUpdate.productUpdate.product?.status !== "UNLISTED") {
      throw new CatalogApiError("Shopify did not return the product as UNLISTED.");
    }
  }

  snapshot = await client.graphql(readQuery, { handle: productSpec.handle });
  product = snapshot.productByHandle;
  const alreadyPublished = product.resourcePublications.nodes.some(
    (node) => node.isPublished && node.publication.id === onlineStore.id,
  );
  if (!alreadyPublished) {
    const published = await client.graphql(`
      mutation PublishLegendarySkies($id: ID!, $input: [PublicationInput!]!, $publicationId: ID!) {
        publishablePublish(id: $id, input: $input) {
          publishable { publishedOnPublication(publicationId: $publicationId) }
          userErrors { field message }
        }
      }
    `, {
      id: product.id,
      input: [{ publicationId: onlineStore.id }],
      publicationId: onlineStore.id,
    });
    assertNoUserErrors(published.publishablePublish, "publishablePublish");
    if (published.publishablePublish.publishable?.publishedOnPublication !== true) {
      throw new CatalogApiError("Shopify did not confirm Online Store publication.");
    }
  }

  const finalSnapshot = await client.graphql(readQuery, { handle: productSpec.handle });
  const finalProduct = finalSnapshot.productByHandle;
  assertIdentity(finalProduct, state);
  const finalVariant = finalProduct.variants.nodes[0];
  const finalReadyImages = finalProduct.media.nodes.filter((media) => media.status === "READY");
  const finalChannels = publishedChannels(finalProduct);
  const onlineStorePublished = finalChannels.some((channel) => channel.id === onlineStore.id);
  if (
    finalProduct.status !== "UNLISTED" ||
    finalProduct.templateSuffix !== productSpec.templateSuffix ||
    finalVariant.sku !== productSpec.sku ||
    finalVariant.price !== productSpec.price ||
    finalVariant.inventoryQuantity !== 0 ||
    finalVariant.sellableOnlineQuantity !== 0 ||
    finalVariant.availableForSale !== false ||
    finalVariant.inventoryItem?.tracked !== true ||
    finalReadyImages.length !== images.length ||
    !onlineStorePublished
  ) {
    throw new CatalogApiError("Final unlisted product verification failed.", {
      product: finalProduct,
      readyImages: finalReadyImages.length,
      channels: finalChannels,
    });
  }

  state.lastVerifiedAt = new Date().toISOString();
  state.product = finalProduct;
  await saveState(state);
  console.log(JSON.stringify({
    ok: true,
    product: {
      id: finalProduct.id,
      title: finalProduct.title,
      handle: finalProduct.handle,
      status: finalProduct.status,
      templateSuffix: finalProduct.templateSuffix,
      onlineStoreUrl: finalProduct.onlineStoreUrl,
      onlineStorePreviewUrl: finalProduct.onlineStorePreviewUrl,
      variant: finalVariant,
      readyImageCount: finalReadyImages.length,
      publishedChannels: finalChannels,
    },
    safety: "UNLISTED, direct-link only, zero inventory, unavailable for sale, and template purchase controls remain disabled.",
    adminUrl: `https://admin.shopify.com/store/n1t6es-qx/products/${finalProduct.id.split("/").at(-1)}`,
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
