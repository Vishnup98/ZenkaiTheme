import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";

const ESSENTIAL_MODE = process.argv.includes("--essential");
const MAIN = ESSENTIAL_MODE
  ? {
      id: "gid://shopify/Product/9421332807785",
      handle: "summoning-glow-essential-rgb-dragon-display",
      variantId: "gid://shopify/ProductVariant/47940570611817",
      sku: "ZK-FIG-SGE16-RGB",
      price: "99.99",
    }
  : {
      id: "gid://shopify/Product/9420750880873",
      handle: "summoning-glow-16cm-led-dragon-display",
      variantId: "gid://shopify/ProductVariant/47937153138793",
      sku: "ZK-FIG-SG16-LED",
      price: "99.99",
    };
const MAIN_MANIFEST_PATH = ESSENTIAL_MODE
  ? "catalog-products/summoning-glow-essential/product.manifest.json"
  : "catalog-products/summoning-glow-16cm/product.manifest.json";

const UPSELL = {
  id: "gid://shopify/Product/9420423463017",
  handle: "eternal-wish-23cm-coiled-dragon-rider-display",
  variantId: "gid://shopify/ProductVariant/47934894473321",
  sku: "ZK-FIG-EW23-CD",
  price: "99.99",
  compareAtPrice: null,
};

const AUTOMATIC_PUBLICATION = {
  id: "gid://shopify/Publication/153815548009",
  name: "Microsoft Copilot",
};

const ONLINE_FULFILLMENT_LOCATION = {
  id: "gid://shopify/Location/70087704681",
  name: "PO BOX",
};
const TARGET_DELIVERY_PROFILE = {
  id: "gid://shopify/DeliveryProfile/94163271785",
  name: "Dsers Profile",
  default: false,
};
const REQUIRED_SHIPPING_SCOPE = "write_shipping";
const INITIAL_SELLABLE_BUFFER = 100;

const READ_QUERY = `
  query ReadUnlistedOffer($mainId: ID!, $upsellId: ID!, $deliveryProfileId: ID!) {
    currentAppInstallation {
      accessScopes { handle }
    }
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
          requiresComponents
          inventoryPolicy
          inventoryQuantity
          sellableOnlineQuantity
          inventoryItem {
            id
            tracked
            inventoryLevels(first: 20) {
              nodes {
                id
                location { id name isActive fulfillsOnlineOrders }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
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
      marketResourcePublications: resourcePublicationsV2(
        first: 100
        catalogType: MARKET
        onlyPublished: false
      ) {
        nodes {
          isPublished
          publishDate
          publication {
            id
            autoPublish
            catalog { id title status }
          }
        }
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
          requiresComponents
          inventoryPolicy
          inventoryQuantity
          sellableOnlineQuantity
          inventoryItem {
            id
            tracked
            inventoryLevels(first: 20) {
              nodes {
                id
                location { id name isActive fulfillsOnlineOrders }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
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
      marketResourcePublications: resourcePublicationsV2(
        first: 100
        catalogType: MARKET
        onlyPublished: false
      ) {
        nodes {
          isPublished
          publishDate
          publication {
            id
            autoPublish
            catalog { id title status }
          }
        }
      }
    }
    publications(first: 100) {
      nodes { id name }
    }
    marketPublications: publications(first: 100, catalogType: MARKET) {
      nodes {
        id
        autoPublish
        catalog { id title status }
      }
    }
    targetDeliveryProfile: deliveryProfile(id: $deliveryProfileId) {
      id
      name
      default
      activeMethodDefinitionsCount
      locationsWithoutRatesCount
      profileLocationGroups {
        locationGroup {
          id
          locations(first: 50) {
            nodes { id name isActive fulfillsOnlineOrders }
          }
        }
        locationGroupZones(first: 50) {
          nodes {
            zone {
              id
              name
              countries { code { countryCode restOfWorld } }
            }
            methodDefinitions(first: 50) {
              nodes { id active description }
            }
          }
        }
      }
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

const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation SetOfferInventoryTracking($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation InitializeOfferInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        referenceDocumentUri
        changes { name delta }
      }
      userErrors { code field message }
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

const DELIVERY_PROFILE_UPDATE_MUTATION = `
  mutation AssociateOfferShippingProfile($id: ID!, $profile: DeliveryProfileInput!) {
    deliveryProfileUpdate(id: $id, profile: $profile) {
      profile { id name }
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
    marketResourcePublications: product.marketResourcePublications?.nodes || [],
  };
}

async function readState(client) {
  return client.graphql(READ_QUERY, {
    mainId: MAIN.id,
    upsellId: UPSELL.id,
    deliveryProfileId: TARGET_DELIVERY_PROFILE.id,
  });
}

function verifyTargetDeliveryProfile(profile) {
  if (
    profile?.id !== TARGET_DELIVERY_PROFILE.id ||
    profile?.name !== TARGET_DELIVERY_PROFILE.name ||
    profile?.default !== TARGET_DELIVERY_PROFILE.default
  ) {
    fail("Target delivery-profile identity guard failed; refusing shipping mutations.", {
      expected: TARGET_DELIVERY_PROFILE,
      actual: profile,
    });
  }

  const usMethod = profile.profileLocationGroups
    .filter((group) => group.locationGroup.locations.nodes.some(
      (location) =>
        location.id === ONLINE_FULFILLMENT_LOCATION.id &&
        location.name === ONLINE_FULFILLMENT_LOCATION.name &&
        location.isActive === true &&
        location.fulfillsOnlineOrders === true,
    ))
    .flatMap((group) => group.locationGroupZones.nodes)
    .find((groupZone) =>
      groupZone.zone.countries.some(
        (country) => country.code.countryCode === "US" && country.code.restOfWorld === false,
      ) && groupZone.methodDefinitions.nodes.some((method) => method.active === true),
    );

  if (!usMethod) {
    fail("Target delivery profile has no active U.S. method from the guarded PO BOX location.", {
      profile,
    });
  }
}

async function associateOfferDeliveryProfile(client, state) {
  const mainVariant = findVariant(state.main, MAIN);
  const upsellVariant = findVariant(state.upsell, UPSELL);
  const variantsToAssociate = [mainVariant, upsellVariant]
    .filter((variant) => variant.deliveryProfile?.id !== TARGET_DELIVERY_PROFILE.id)
    .map((variant) => variant.id);
  if (!variantsToAssociate.length) return;

  const data = await client.graphql(DELIVERY_PROFILE_UPDATE_MUTATION, {
    id: TARGET_DELIVERY_PROFILE.id,
    profile: { variantsToAssociate },
  });
  assertNoUserErrors(data.deliveryProfileUpdate, "deliveryProfileUpdate");
  const profile = data.deliveryProfileUpdate.profile;
  if (profile?.id !== TARGET_DELIVERY_PROFILE.id || profile?.name !== TARGET_DELIVERY_PROFILE.name) {
    fail("Shopify did not confirm the exact guarded delivery profile association.", { profile });
  }
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

async function setInventoryTracking(client, product, expected) {
  const variant = findVariant(product, expected);
  const inventoryItemId = variant.inventoryItem?.id;
  if (!inventoryItemId) fail(`Inventory item guard failed on ${product.title}.`);
  if (variant.inventoryItem.tracked === true) return;

  const data = await client.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
    id: inventoryItemId,
    input: { tracked: true },
  });
  assertNoUserErrors(data.inventoryItemUpdate, "inventoryItemUpdate");
  if (
    data.inventoryItemUpdate.inventoryItem?.id !== inventoryItemId ||
    data.inventoryItemUpdate.inventoryItem?.tracked !== true
  ) {
    fail(`Shopify did not enable inventory tracking for ${product.title}.`);
  }
}

function availableLevel(variant) {
  return variant.inventoryItem?.inventoryLevels.nodes.find(
    (level) => level.location.id === ONLINE_FULFILLMENT_LOCATION.id,
  );
}

async function initializeSellableBuffer(client, products) {
  const quantities = [];
  for (const [product, expected] of products) {
    const variant = findVariant(product, expected);
    const level = availableLevel(variant);
    if (!level) fail(`Online fulfillment inventory level is missing for ${product.title}.`);
    if (
      level.location.name !== ONLINE_FULFILLMENT_LOCATION.name ||
      level.location.isActive !== true ||
      level.location.fulfillsOnlineOrders !== true
    ) {
      fail(`Inventory-location guard failed for ${product.title}.`, { level });
    }
    const available = level.quantities.find((quantity) => quantity.name === "available")?.quantity;
    if (!Number.isInteger(available)) fail(`Available inventory could not be read for ${product.title}.`);
    if (available > 0) continue;
    if (available < 0) {
      fail(`Refusing to overwrite negative order-adjusted inventory for ${product.title}.`, { available });
    }
    quantities.push({
      inventoryItemId: variant.inventoryItem.id,
      locationId: ONLINE_FULFILLMENT_LOCATION.id,
      quantity: INITIAL_SELLABLE_BUFFER,
      changeFromQuantity: 0,
    });
  }
  if (!quantities.length) return null;

  const data = await client.graphql(INVENTORY_SET_MUTATION, {
    input: {
      name: "available",
      reason: "correction",
      referenceDocumentUri: `gid://analyticsmcpapp/OfferLaunch/${MAIN.id.split("/").pop()}`,
      quantities,
    },
  });
  assertNoUserErrors(data.inventorySetQuantities, "inventorySetQuantities");
  if (!data.inventorySetQuantities.inventoryAdjustmentGroup) {
    fail("Shopify did not confirm the guarded sellable inventory buffer.");
  }
  return data.inventorySetQuantities.inventoryAdjustmentGroup;
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
    mainVariant.availableForSale !== true ||
    mainVariant.inventoryItem?.tracked !== true ||
    mainVariant.inventoryQuantity < 1 ||
    mainVariant.sellableOnlineQuantity < 1
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
    upsellVariant.availableForSale !== true ||
    upsellVariant.inventoryItem?.tracked !== true ||
    upsellVariant.inventoryQuantity < 1 ||
    upsellVariant.sellableOnlineQuantity < 1
  ) {
    fail("Eternal Wish final price verification failed.", { upsellVariant });
  }
  if (
    mainVariant.deliveryProfile?.id !== TARGET_DELIVERY_PROFILE.id ||
    upsellVariant.deliveryProfile?.id !== TARGET_DELIVERY_PROFILE.id
  ) {
    fail("Final U.S. delivery-profile verification failed.", {
      expected: TARGET_DELIVERY_PROFILE,
      main: mainVariant.deliveryProfile,
      upsell: upsellVariant.deliveryProfile,
    });
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
    MAIN_MANIFEST_PATH,
  );
  const access = await verifyZenkaiAccess(client);
  const before = await readState(client);
  verifyIdentity(before.main, MAIN);
  verifyIdentity(before.upsell, UPSELL);
  verifyTargetDeliveryProfile(before.targetDeliveryProfile);
  const installedScopes = before.currentAppInstallation.accessScopes.map(({ handle }) => handle);
  const hasShippingWrite = installedScopes.includes(REQUIRED_SHIPPING_SCOPE);
  const shippingAssociationNeeded = [
    findVariant(before.main, MAIN),
    findVariant(before.upsell, UPSELL),
  ].some((variant) => variant.deliveryProfile?.id !== TARGET_DELIVERY_PROFILE.id);

  const onlineStore = before.publications.nodes.find((publication) => publication.name === "Online Store");
  if (!onlineStore) fail("Online Store publication was not found; refusing launch mutations.");

  const preflight = {
    ok: true,
    mode: "guarded-unlisted-offer-launch",
    access,
    targetPublication: onlineStore,
    main: publicProduct(before.main, MAIN),
    upsell: publicProduct(before.upsell, UPSELL),
    marketPublications: before.marketPublications.nodes,
    desired: {
      statuses: { main: "UNLISTED", upsell: "UNLISTED" },
      publications: [onlineStore],
      toleratedAutomaticPublication: AUTOMATIC_PUBLICATION,
      mainTitle: mainManifest.title,
      mainPrice: MAIN.price,
      upsellPrice: UPSELL.price,
      upsellCompareAtPrice: UPSELL.compareAtPrice,
      initialSellableBuffer: {
        quantity: INITIAL_SELLABLE_BUFFER,
        location: ONLINE_FULFILLMENT_LOCATION,
        behavior: "Initialize only when current available quantity is exactly zero; never reset a positive or negative order-adjusted level.",
      },
      deliveryProfile: TARGET_DELIVERY_PROFILE,
      shippingAssociationNeeded,
      requiredShippingScope: shippingAssociationNeeded ? REQUIRED_SHIPPING_SCOPE : null,
    },
  };

  if (!confirm) {
    console.log(JSON.stringify({
      ...preflight,
      authorizationRequired: shippingAssociationNeeded && !hasShippingWrite,
      missingScope: shippingAssociationNeeded && !hasShippingWrite ? REQUIRED_SHIPPING_SCOPE : null,
      confirmationRequired: true,
      mutationsExecuted: false,
      nextCommand: shippingAssociationNeeded && !hasShippingWrite
        ? "Add write_shipping to the installed Zenkai API app, reauthorize it, then rerun this read-only preflight."
        : "Repeat with --confirm to verify the guarded unlisted offer and preserve the current U.S. shipping-profile association.",
    }, null, 2));
    return;
  }

  if (shippingAssociationNeeded && !hasShippingWrite) {
    fail("The installed Zenkai API app is missing write_shipping; refusing all launch mutations.", {
      requiredScope: REQUIRED_SHIPPING_SCOPE,
      currentReadScope: installedScopes.includes("read_shipping") ? "read_shipping" : null,
      nextAction: "Add write_shipping to AnalyticsMCPApp, save the app configuration, and reauthorize the installation.",
    });
  }

  let stage = "setMainCatalogCopy";
  try {
    await setMainCatalogCopy(client, mainManifest);
    stage = "setMainInventoryTracking";
    await setInventoryTracking(client, before.main, MAIN);
    stage = "setUpsellInventoryTracking";
    await setInventoryTracking(client, before.upsell, UPSELL);
    stage = "initializeSellableBuffer";
    await initializeSellableBuffer(client, [
      [before.main, MAIN],
      [before.upsell, UPSELL],
    ]);
    stage = "setMainSellability";
    await setMainSellability(client);
    stage = "setUpsellPrice";
    await setUpsellPrice(client);
    stage = "associateOfferDeliveryProfile";
    await associateOfferDeliveryProfile(client, before);
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
