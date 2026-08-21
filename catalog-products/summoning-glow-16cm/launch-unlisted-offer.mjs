import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";

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

const READ_QUERY = `
  query ReadUnlistedOffer($mainId: ID!, $upsellId: ID!) {
    main: product(id: $mainId) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      variants(first: 10) {
        nodes { id sku price compareAtPrice }
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
        nodes { id sku price compareAtPrice }
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
      product { id handle status }
      userErrors { field message }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = `
  mutation SetOfferPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku price compareAtPrice }
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

async function setUpsellPrice(client) {
  const data = await client.graphql(VARIANT_UPDATE_MUTATION, {
    productId: UPSELL.id,
    variants: [
      {
        id: UPSELL.variantId,
        price: UPSELL.price,
        compareAtPrice: UPSELL.compareAtPrice,
      },
    ],
  });
  assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
  const variant = data.productVariantsBulkUpdate.productVariants?.[0];
  if (
    variant?.id !== UPSELL.variantId ||
    variant?.sku !== UPSELL.sku ||
    variant?.price !== UPSELL.price ||
    variant?.compareAtPrice !== UPSELL.compareAtPrice
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

function verifyFinal(state, onlineStore) {
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
  if (mainVariant.price !== MAIN.price) fail("Summoning Glow price changed unexpectedly.");
  if (
    upsellVariant.price !== UPSELL.price ||
    upsellVariant.compareAtPrice !== UPSELL.compareAtPrice
  ) {
    fail("Eternal Wish final price verification failed.", { upsellVariant });
  }

  for (const product of [state.main, state.upsell]) {
    const channels = publishedChannels(product);
    if (channels.length !== 1 || channels[0].id !== onlineStore.id) {
      fail(`${product.title} is not published exclusively to Online Store.`, { channels });
    }
  }
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const client = ShopifyAdminClient.fromEnvironment();
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
      nextCommand: "Repeat with --confirm to make both products UNLISTED and publish only to Online Store.",
    }, null, 2));
    return;
  }

  let stage = "setUpsellPrice";
  try {
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
    verifyFinal(finalState, onlineStore);
    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      main: publicProduct(finalState.main, MAIN),
      upsell: publicProduct(finalState.upsell, UPSELL),
      safety: "Both products are UNLISTED and published exclusively to Zenkai's Online Store channel.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        recovery: "Re-run the read-only preflight. Do not use a generic publish command, which would set products ACTIVE.",
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
