import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";

const MAIN = {
  id: "gid://shopify/Product/9420750880873",
  handle: "summoning-glow-16cm-led-dragon-display",
  variantId: "gid://shopify/ProductVariant/47937153138793",
  sku: "ZK-FIG-SG16-LED",
  price: "99.99",
};

const UPSELL = {
  id: "gid://shopify/Product/9420423463017",
  handle: "eternal-wish-24cm-dragon-hero-display-figure",
  variantId: "gid://shopify/ProductVariant/47934894473321",
  sku: "ZK-FIG-EW24-PVC",
  price: "49.99",
  compareAtPrice: "99.99",
};

const AUTOMATIC_PUBLICATION = {
  id: "gid://shopify/Publication/153815548009",
  name: "Microsoft Copilot",
};

const READ_QUERY = `
  query ReadUnlistedOffer($mainId: ID!, $upsellId: ID!) {
    main: product(id: $mainId) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      descriptionHtml
      seo { title description }
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
          deliveryProfile {
            id
            name
            default
            activeMethodDefinitionsCount
            originLocationCount
            zoneCountryCount
          }
        }
      }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
    }
    upsell: product(id: $upsellId) {
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
          deliveryProfile {
            id
            name
            default
            activeMethodDefinitionsCount
            originLocationCount
            zoneCountryCount
          }
        }
      }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
    }
    publications(first: 100) {
      nodes { id name }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation SetProductUnlisted($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title handle status descriptionHtml seo { title description } }
      userErrors { field message }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = `
  mutation SetOfferPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku price compareAtPrice inventoryPolicy }
      userErrors { field message }
    }
  }
`;

const PUBLISH_MUTATION = `
  mutation PublishUnlistedOffer($id: ID!, $input: [PublicationInput!]!, $publicationId: ID!) {
    publishablePublish(id: $id, input: $input) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
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

function publishedChannels(product) {
  return product.resourcePublications.nodes
    .filter((node) => node.isPublished)
    .map((node) => ({ id: node.publication.id, name: node.publication.name }));
}

function findVariant(product, expected) {
  const variant = product.variants.nodes.find((node) => node.id === expected.variantId);
  if (!variant) fail(`Expected variant was not found on ${product.title}.`, { expected });
  if (variant.sku !== expected.sku) {
    fail(`SKU guard failed on ${product.title}.`, {
      expectedSku: expected.sku,
      actualSku: variant.sku,
    });
  }
  return variant;
}

function verifyIdentity(product, expected) {
  if (!product) fail(`Product was not found: ${expected.id}`);
  if (product.id !== expected.id || product.handle !== expected.handle) {
    fail("Product identity guard failed; refusing launch mutations.", {
      expected,
      actual: { id: product.id, handle: product.handle, title: product.title },
    });
  }
  findVariant(product, expected);
}

function publicProduct(product, expected) {
  const variant = findVariant(product, expected);
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    templateSuffix: product.templateSuffix,
    onlineStoreUrl: product.onlineStoreUrl,
    variant,
    publishedChannels: publishedChannels(product),
  };
}

async function readState(client) {
  return client.graphql(READ_QUERY, { mainId: MAIN.id, upsellId: UPSELL.id });
}

async function setUnlisted(client, product) {
  if (product.status === "UNLISTED") return;
  const data = await client.graphql(PRODUCT_UPDATE_MUTATION, {
    product: { id: product.id, status: "UNLISTED" },
  });
  assertNoUserErrors(data.productUpdate, "productUpdate");
  if (data.productUpdate.product?.status !== "UNLISTED") {
    fail(`Shopify did not return ${product.title} as UNLISTED.`);
  }
}

async function setMainCatalogCopy(client, manifest) {
  const data = await client.graphql(PRODUCT_UPDATE_MUTATION, {
    product: {
      id: MAIN.id,
      title: manifest.title,
      descriptionHtml: manifest.descriptionHtml,
      seo: manifest.seo,
    },
  });
  assertNoUserErrors(data.productUpdate, "productUpdate");
  const product = data.productUpdate.product;
  if (
    product?.id !== MAIN.id ||
    product?.title !== manifest.title ||
    normalizeHtml(product?.descriptionHtml) !== normalizeHtml(manifest.descriptionHtml) ||
    product?.seo?.title !== manifest.seo.title ||
    product?.seo?.description !== manifest.seo.description
  ) {
    fail("Shopify did not return the exact guarded Summoning Glow catalog copy.", { product });
  }
}

async function setMainSellability(client) {
  const data = await client.graphql(VARIANT_UPDATE_MUTATION, {
    productId: MAIN.id,
    variants: [{ id: MAIN.variantId, inventoryPolicy: "CONTINUE" }],
  });
  assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
  const variant = data.productVariantsBulkUpdate.productVariants?.[0];
  if (
    variant?.id !== MAIN.variantId ||
    variant?.sku !== MAIN.sku ||
    variant?.price !== MAIN.price ||
    variant?.inventoryPolicy !== "CONTINUE"
  ) {
    fail("Shopify did not return Summoning Glow with continue-selling enabled.", { variant });
  }
}

async function setUpsellPrice(client) {
  const data = await client.graphql(VARIANT_UPDATE_MUTATION, {
    productId: UPSELL.id,
    variants: [
      {
        id: UPSELL.variantId,
        price: UPSELL.price,
        compareAtPrice: UPSELL.compareAtPrice,
        inventoryPolicy: "CONTINUE",
      },
    ],
  });
  assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
  const variant = data.productVariantsBulkUpdate.productVariants?.[0];
  if (
    variant?.id !== UPSELL.variantId ||
    variant?.sku !== UPSELL.sku ||
    variant?.price !== UPSELL.price ||
    variant?.compareAtPrice !== UPSELL.compareAtPrice ||
    variant?.inventoryPolicy !== "CONTINUE"
  ) {
    fail("Shopify did not return the exact guarded Eternal Wish offer price.", { variant });
  }
}

async function publishOnlyToOnlineStore(client, product, onlineStore) {
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
    fail(`Shopify did not confirm Online Store publication for ${product.title}.`);
  }
}

function verifyFinal(state, onlineStore, mainManifest) {
  verifyIdentity(state.main, MAIN);
  verifyIdentity(state.upsell, UPSELL);
  const mainVariant = findVariant(state.main, MAIN);
  const upsellVariant = findVariant(state.upsell, UPSELL);

  if (state.main.status !== "UNLISTED" || state.upsell.status !== "UNLISTED") {
    fail("Final verification found a product that is not UNLISTED.", {
      mainStatus: state.main.status,
      upsellStatus: state.upsell.status,
    });
  }
  if (
    mainVariant.price !== MAIN.price ||
    mainVariant.inventoryPolicy !== "CONTINUE" ||
    mainVariant.availableForSale !== true
  ) {
    fail("Summoning Glow final sellability verification failed.", { mainVariant });
  }
  if (
    state.main.title !== mainManifest.title ||
    normalizeHtml(state.main.descriptionHtml) !== normalizeHtml(mainManifest.descriptionHtml) ||
    state.main.seo?.title !== mainManifest.seo.title ||
    state.main.seo?.description !== mainManifest.seo.description
  ) {
    fail("Summoning Glow final catalog-copy verification failed.");
  }
  if (
    upsellVariant.price !== UPSELL.price ||
    upsellVariant.compareAtPrice !== UPSELL.compareAtPrice ||
    upsellVariant.inventoryPolicy !== "CONTINUE" ||
    upsellVariant.availableForSale !== true
  ) {
    fail("Eternal Wish final price verification failed.", { upsellVariant });
  }

  for (const product of [state.main, state.upsell]) {
    const channels = publishedChannels(product);
    if (!channels.some((channel) => channel.id === onlineStore.id)) {
      fail(`${product.title} is not published to Online Store.`, { channels });
    }
    const unexpected = channels.filter(
      (channel) => channel.id !== onlineStore.id && channel.id !== AUTOMATIC_PUBLICATION.id,
    );
    if (unexpected.length) {
      fail(`${product.title} has an unexpected publication association.`, { channels, unexpected });
    }
  }
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const client = ShopifyAdminClient.fromEnvironment();
  const { manifest: mainManifest } = await loadManifest(
    "catalog-products/summoning-glow-16cm/product.manifest.json",
  );
  const access = await verifyZenkaiAccess(client);
  const before = await readState(client);
  verifyIdentity(before.main, MAIN);
  verifyIdentity(before.upsell, UPSELL);

  const onlineStore = before.publications.nodes.find((publication) => publication.name === "Online Store");
  if (!onlineStore) fail("Online Store publication was not found; refusing launch mutations.");

  const preflight = {
    ok: true,
    mode: "guarded-unlisted-offer-launch",
    access,
    targetPublication: onlineStore,
    main: publicProduct(before.main, MAIN),
    upsell: publicProduct(before.upsell, UPSELL),
    desired: {
      statuses: { main: "UNLISTED", upsell: "UNLISTED" },
      publications: [onlineStore],
      toleratedAutomaticPublication: AUTOMATIC_PUBLICATION,
      mainTitle: mainManifest.title,
      mainPrice: MAIN.price,
      upsellPrice: UPSELL.price,
      upsellCompareAtPrice: UPSELL.compareAtPrice,
    },
  };

  if (!confirm) {
    console.log(JSON.stringify({
      ...preflight,
      confirmationRequired: true,
      mutationsExecuted: false,
      nextCommand: "Repeat with --confirm to apply guarded copy and pricing, keep both products UNLISTED, and preserve direct-link Online Store availability.",
    }, null, 2));
    return;
  }

  let stage = "setMainCatalogCopy";
  try {
    await setMainCatalogCopy(client, mainManifest);
    stage = "setMainSellability";
    await setMainSellability(client);
    stage = "setUpsellPrice";
    await setUpsellPrice(client);
    stage = "setMainUnlisted";
    await setUnlisted(client, before.main);
    stage = "setUpsellUnlisted";
    await setUnlisted(client, before.upsell);

    const afterStatus = await readState(client);
    stage = "publishMain";
    await publishOnlyToOnlineStore(client, afterStatus.main, onlineStore);
    stage = "publishUpsell";
    await publishOnlyToOnlineStore(client, afterStatus.upsell, onlineStore);

    stage = "finalVerification";
    const finalState = await readState(client);
    verifyFinal(finalState, onlineStore, mainManifest);
    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      main: publicProduct(finalState.main, MAIN),
      upsell: publicProduct(finalState.upsell, UPSELL),
      safety: "Both products are UNLISTED and available by their direct Zenkai Online Store URLs. Shopify retains its automatic Microsoft Copilot publication association for UNLISTED products.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        recovery: "Re-run the read-only preflight. Do not use a generic publish command, which would set products ACTIVE. Microsoft Copilot is a tolerated automatic publication association only while status remains UNLISTED.",
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
