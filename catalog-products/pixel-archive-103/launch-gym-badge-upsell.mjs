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

const STICKER = {
  id: "gid://shopify/Product/9421510049897",
  handle: "pixel-archive-103-piece-retro-card-sticker-pack",
  variantId: "gid://shopify/ProductVariant/47941701304425",
  sku: "ZK-STK-PA103",
  regularPrice: "29.99",
  compareAtPrice: null,
  templateSuffix: "pixel-archive",
};
const BADGE = {
  handle: "8pcs-anime-gym-badge-enamel-pins-set-colorful-hard-enamel-lapel-brooches-trainer-badges-collectible-gift-box-for-backpack",
};
const ONLINE_STORE = {
  id: "gid://shopify/Publication/130122350697",
  name: "Online Store",
};
const FULFILLMENT_LOCATION = {
  id: "gid://shopify/Location/70087704681",
  name: "PO BOX",
};
const DELIVERY_PROFILE = {
  id: "gid://shopify/DeliveryProfile/94163271785",
  name: "Dsers Profile",
  default: false,
};
const DISCOUNT = {
  title: "Gym Badge Sticker Add-On",
  amount: "10.00",
  finalPrice: "19.99",
  usesPerOrderLimit: 1,
};
const PRODUCT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(PRODUCT_DIRECTORY, "product.manifest.json");
const CONFIRMED = process.argv.includes("--confirm");
const INITIAL_SELLABLE_BUFFER = 100;

const READ_QUERY = `
  query ReadGymBadgeStickerOffer($stickerId: ID!, $badgeHandle: String!, $deliveryProfileId: ID!) {
    currentAppInstallation { accessScopes { handle } }
    sticker: product(id: $stickerId) {
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
          deliveryProfile { id name default }
        }
      }
      media(first: 50) {
        nodes { id alt mediaContentType status }
      }
      resourcePublications(first: 100) {
        nodes { isPublished publication { id name } }
      }
    }
    badge: productByHandle(handle: $badgeHandle) {
      id
      title
      handle
      status
      variants(first: 100) {
        nodes { id title sku availableForSale }
      }
    }
    publications(first: 100) { nodes { id name } }
    targetDeliveryProfile: deliveryProfile(id: $deliveryProfileId) {
      id
      name
      default
      profileLocationGroups {
        locationGroup {
          locations(first: 50) { nodes { id name isActive fulfillsOnlineOrders } }
        }
        locationGroupZones(first: 50) {
          nodes {
            zone { countries { code { countryCode restOfWorld } } }
            methodDefinitions(first: 50) { nodes { active } }
          }
        }
      }
    }
    automaticDiscountNodes(first: 100) {
      nodes {
        id
        automaticDiscount {
          __typename
          ... on DiscountAutomaticBxgy {
            title
            status
            summary
            startsAt
            endsAt
            usesPerOrderLimit
            combinesWith { productDiscounts orderDiscounts shippingDiscounts }
            customerBuys {
              isOneTimePurchase
              isSubscription
              value { ... on DiscountQuantity { quantity } }
              items {
                ... on DiscountProducts {
                  productVariants(first: 100) { nodes { id sku } }
                }
              }
            }
            customerGets {
              appliesOnOneTimePurchase
              appliesOnSubscription
              items {
                ... on DiscountProducts {
                  productVariants(first: 100) { nodes { id sku } }
                }
              }
              value {
                ... on DiscountOnQuantity {
                  quantity { quantity }
                  effect {
                    ... on DiscountAmount {
                      amount { amount currencyCode }
                      appliesOnEachItem
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation UpdatePixelArchiveOffer($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title handle status templateSuffix descriptionHtml seo { title description } }
      userErrors { field message }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = `
  mutation UpdatePixelArchiveVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku price compareAtPrice inventoryPolicy }
      userErrors { field message }
    }
  }
`;

const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation TrackPixelArchiveInventory($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation InitializePixelArchiveInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { createdAt reason changes { name delta } }
      userErrors { code field message }
    }
  }
`;

const PUBLISH_MUTATION = `
  mutation PublishPixelArchiveOnlineStore($id: ID!, $input: [PublicationInput!]!, $publicationId: ID!) {
    publishablePublish(id: $id, input: $input) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
    }
  }
`;

const CREATE_DISCOUNT_MUTATION = `
  mutation CreateGymBadgeStickerDiscount($input: DiscountAutomaticBxgyInput!) {
    discountAutomaticBxgyCreate(automaticBxgyDiscount: $input) {
      automaticDiscountNode {
        id
        automaticDiscount {
          ... on DiscountAutomaticBxgy { title status summary }
        }
      }
      userErrors { code field message }
    }
  }
`;

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

function normalizeHtml(value) {
  return String(value || "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

function stickerVariant(product) {
  const variant = product?.variants.nodes.find((node) => node.id === STICKER.variantId);
  if (
    !product ||
    product.id !== STICKER.id ||
    product.handle !== STICKER.handle ||
    !["DRAFT", "UNLISTED"].includes(product.status) ||
    product.variants.nodes.length !== 1 ||
    !variant ||
    variant.sku !== STICKER.sku
  ) {
    fail("Pixel Archive identity guard failed; refusing launch mutations.", {
      expected: STICKER,
      actual: product,
    });
  }
  return variant;
}

function badgeVariants(product) {
  if (!product || product.handle !== BADGE.handle || product.status !== "ACTIVE") {
    fail("Gym badge identity or status guard failed; refusing discount mutations.", {
      expected: BADGE,
      actual: product,
    });
  }
  const variants = product.variants.nodes.filter((variant) => variant.availableForSale === true);
  if (!variants.length || variants.length !== product.variants.nodes.length) {
    fail("Every gym badge variant must be sellable before configuring the add-on.", {
      variants: product.variants.nodes,
    });
  }
  return variants;
}

function exactDiscounts(state) {
  return state.automaticDiscountNodes.nodes.filter((node) => {
    const discount = node.automaticDiscount;
    return discount.__typename === "DiscountAutomaticBxgy" && discount.title === DISCOUNT.title;
  });
}

function sameIds(actual, expected) {
  return [...actual].sort().join("|") === [...expected].sort().join("|");
}

function verifyDiscount(node, qualifyingVariants) {
  if (!node) fail("The Gym Badge Sticker Add-On discount was not found.");
  const discount = node.automaticDiscount;
  const buyIds = (discount.customerBuys.items?.productVariants?.nodes || []).map(({ id }) => id);
  const getIds = (discount.customerGets.items?.productVariants?.nodes || []).map(({ id }) => id);
  const quantityOffer = discount.customerGets.value;
  const amount = quantityOffer?.effect?.amount;

  if (
    discount.__typename !== "DiscountAutomaticBxgy" ||
    discount.title !== DISCOUNT.title ||
    discount.status !== "ACTIVE" ||
    discount.endsAt !== null ||
    Number(discount.usesPerOrderLimit) !== DISCOUNT.usesPerOrderLimit ||
    String(discount.customerBuys.value?.quantity) !== "1" ||
    discount.customerBuys.isOneTimePurchase !== true ||
    discount.customerBuys.isSubscription !== false ||
    !sameIds(buyIds, qualifyingVariants.map(({ id }) => id)) ||
    String(quantityOffer?.quantity?.quantity) !== "1" ||
    Number(amount?.amount) !== Number(DISCOUNT.amount) ||
    amount?.currencyCode !== "USD" ||
    amount?.appliesOnEachItem !== true ||
    discount.customerGets.appliesOnOneTimePurchase !== true ||
    discount.customerGets.appliesOnSubscription !== false ||
    !sameIds(getIds, [STICKER.variantId]) ||
    discount.combinesWith.productDiscounts !== false ||
    discount.combinesWith.orderDiscounts !== false ||
    discount.combinesWith.shippingDiscounts !== true
  ) {
    fail("Existing Gym Badge Sticker Add-On discount does not match the guarded offer.", { node });
  }
}

function publishedChannels(product) {
  return product.resourcePublications.nodes
    .filter((node) => node.isPublished)
    .map((node) => ({ id: node.publication.id, name: node.publication.name }));
}

function verifyDeliveryProfile(profile) {
  if (
    profile?.id !== DELIVERY_PROFILE.id ||
    profile?.name !== DELIVERY_PROFILE.name ||
    profile?.default !== DELIVERY_PROFILE.default
  ) {
    fail("Target delivery-profile identity guard failed.", {
      expected: DELIVERY_PROFILE,
      actual: profile,
    });
  }

  const hasUsMethod = profile.profileLocationGroups.some((group) => {
    const hasLocation = group.locationGroup.locations.nodes.some((location) =>
      location.id === FULFILLMENT_LOCATION.id &&
      location.name === FULFILLMENT_LOCATION.name &&
      location.isActive === true &&
      location.fulfillsOnlineOrders === true,
    );
    const hasRate = group.locationGroupZones.nodes.some((groupZone) =>
      groupZone.zone.countries.some((country) =>
        country.code.countryCode === "US" && country.code.restOfWorld === false,
      ) && groupZone.methodDefinitions.nodes.some((method) => method.active === true),
    );
    return hasLocation && hasRate;
  });
  if (!hasUsMethod) {
    fail("The Dsers Profile has no active U.S. method from the guarded PO BOX location.", { profile });
  }
}

function verifyExactGallery(product, manifest) {
  const expectedAlts = manifest.images.map((image) => image.alt);
  const actual = product.media.nodes;
  if (
    actual.length !== expectedAlts.length ||
    actual.some((media) =>
      !expectedAlts.includes(media.alt) ||
      media.mediaContentType !== "IMAGE" ||
      media.status !== "READY",
    )
  ) {
    fail("The exact six-image supplier gallery is not ready; refusing launch.", {
      expectedAlts,
      actual,
    });
  }
}

async function readState(client) {
  return client.graphql(READ_QUERY, {
    stickerId: STICKER.id,
    badgeHandle: BADGE.handle,
    deliveryProfileId: DELIVERY_PROFILE.id,
  });
}

async function setCatalogState(client, manifest) {
  const data = await client.graphql(PRODUCT_UPDATE_MUTATION, {
    product: {
      id: STICKER.id,
      title: manifest.title,
      descriptionHtml: manifest.descriptionHtml,
      seo: manifest.seo,
      templateSuffix: STICKER.templateSuffix,
      status: "UNLISTED",
    },
  });
  assertNoUserErrors(data.productUpdate, "productUpdate(Pixel Archive)");
  const product = data.productUpdate.product;
  if (
    product?.id !== STICKER.id ||
    product?.status !== "UNLISTED" ||
    product?.templateSuffix !== STICKER.templateSuffix ||
    product?.title !== manifest.title ||
    normalizeHtml(product?.descriptionHtml) !== normalizeHtml(manifest.descriptionHtml) ||
    product?.seo?.title !== manifest.seo.title ||
    product?.seo?.description !== manifest.seo.description
  ) {
    fail("Shopify did not return the exact guarded Pixel Archive catalog state.", { product });
  }
}

async function setVariantState(client) {
  const data = await client.graphql(VARIANT_UPDATE_MUTATION, {
    productId: STICKER.id,
    variants: [{
      id: STICKER.variantId,
      price: STICKER.regularPrice,
      compareAtPrice: STICKER.compareAtPrice,
      inventoryPolicy: "CONTINUE",
    }],
  });
  assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate(Pixel Archive)");
  const variant = data.productVariantsBulkUpdate.productVariants?.[0];
  if (
    variant?.id !== STICKER.variantId ||
    variant?.sku !== STICKER.sku ||
    variant?.price !== STICKER.regularPrice ||
    variant?.compareAtPrice !== STICKER.compareAtPrice ||
    variant?.inventoryPolicy !== "CONTINUE"
  ) {
    fail("Shopify did not return the exact guarded Pixel Archive variant state.", { variant });
  }
}

async function ensureInventory(client, product) {
  const variant = stickerVariant(product);
  if (!variant.inventoryItem?.id) fail("Pixel Archive inventory item is missing.");
  if (variant.inventoryItem.tracked !== true) {
    const tracked = await client.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
      id: variant.inventoryItem.id,
      input: { tracked: true },
    });
    assertNoUserErrors(tracked.inventoryItemUpdate, "inventoryItemUpdate(Pixel Archive)");
  }

  const level = variant.inventoryItem.inventoryLevels.nodes.find((entry) =>
    entry.location.id === FULFILLMENT_LOCATION.id,
  );
  if (!level) fail("Pixel Archive has no inventory level at the PO BOX location.", { variant });
  const available = level.quantities.find(({ name }) => name === "available")?.quantity;
  if (!Number.isInteger(available)) fail("Pixel Archive available inventory could not be read.");
  if (available > 0) return;
  if (available < 0) fail("Refusing to overwrite negative order-adjusted Pixel Archive inventory.", { available });

  const data = await client.graphql(INVENTORY_SET_MUTATION, {
    input: {
      name: "available",
      reason: "correction",
      referenceDocumentUri: `gid://analyticsmcpapp/OfferLaunch/${STICKER.id.split("/").pop()}`,
      quantities: [{
        inventoryItemId: variant.inventoryItem.id,
        locationId: FULFILLMENT_LOCATION.id,
        quantity: INITIAL_SELLABLE_BUFFER,
        changeFromQuantity: 0,
      }],
    },
  });
  assertNoUserErrors(data.inventorySetQuantities, "inventorySetQuantities(Pixel Archive)");
  if (!data.inventorySetQuantities.inventoryAdjustmentGroup) {
    fail("Shopify did not confirm Pixel Archive inventory initialization.");
  }
}

async function publishOnlineStore(client, product) {
  const alreadyPublished = product.resourcePublications.nodes.some((node) =>
    node.isPublished && node.publication.id === ONLINE_STORE.id,
  );
  if (alreadyPublished) return;
  const data = await client.graphql(PUBLISH_MUTATION, {
    id: STICKER.id,
    input: [{ publicationId: ONLINE_STORE.id }],
    publicationId: ONLINE_STORE.id,
  });
  assertNoUserErrors(data.publishablePublish, "publishablePublish(Pixel Archive)");
  if (data.publishablePublish.publishable?.publishedOnPublication !== true) {
    fail("Shopify did not confirm Pixel Archive Online Store publication.");
  }
}

async function createDiscount(client, variants) {
  const data = await client.graphql(CREATE_DISCOUNT_MUTATION, {
    input: {
      title: DISCOUNT.title,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      context: { all: "ALL" },
      usesPerOrderLimit: String(DISCOUNT.usesPerOrderLimit),
      combinesWith: {
        productDiscounts: false,
        orderDiscounts: false,
        shippingDiscounts: true,
      },
      customerBuys: {
        value: { quantity: "1" },
        items: { products: { productVariantsToAdd: variants.map(({ id }) => id) } },
        isOneTimePurchase: true,
        isSubscription: false,
      },
      customerGets: {
        value: {
          discountOnQuantity: {
            quantity: "1",
            effect: { amount: DISCOUNT.amount },
          },
        },
        items: { products: { productVariantsToAdd: [STICKER.variantId] } },
      },
    },
  });
  assertNoUserErrors(data.discountAutomaticBxgyCreate, "discountAutomaticBxgyCreate");
  return data.discountAutomaticBxgyCreate.automaticDiscountNode;
}

function verifyFinal(state, manifest, qualifyingVariants) {
  const variant = stickerVariant(state.sticker);
  verifyExactGallery(state.sticker, manifest);
  if (
    state.sticker.status !== "UNLISTED" ||
    state.sticker.templateSuffix !== STICKER.templateSuffix ||
    state.sticker.title !== manifest.title ||
    normalizeHtml(state.sticker.descriptionHtml) !== normalizeHtml(manifest.descriptionHtml) ||
    state.sticker.seo?.title !== manifest.seo.title ||
    state.sticker.seo?.description !== manifest.seo.description ||
    variant.price !== STICKER.regularPrice ||
    variant.compareAtPrice !== STICKER.compareAtPrice ||
    variant.inventoryPolicy !== "CONTINUE" ||
    variant.availableForSale !== true ||
    variant.inventoryItem?.tracked !== true ||
    variant.inventoryQuantity < 1 ||
    variant.sellableOnlineQuantity < 1 ||
    variant.deliveryProfile?.id !== DELIVERY_PROFILE.id
  ) {
    fail("Pixel Archive final sellability verification failed.", {
      product: state.sticker,
      variant,
    });
  }

  const channels = publishedChannels(state.sticker);
  if (!channels.some(({ id }) => id === ONLINE_STORE.id)) {
    fail("Pixel Archive is not published to the Online Store.", { channels });
  }
  const unexpectedChannels = channels.filter(({ id }) => id !== ONLINE_STORE.id);
  if (unexpectedChannels.length) {
    fail("Pixel Archive has an unexpected sales-channel publication.", { channels, unexpectedChannels });
  }

  const discounts = exactDiscounts(state);
  if (discounts.length !== 1) {
    fail("Expected exactly one Gym Badge Sticker Add-On discount.", { discounts });
  }
  verifyDiscount(discounts[0], qualifyingVariants);
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const { manifest } = await loadManifest(MANIFEST_PATH);
  const access = await verifyZenkaiAccess(client);
  const before = await readState(client);
  const variant = stickerVariant(before.sticker);
  const qualifyingVariants = badgeVariants(before.badge);
  verifyDeliveryProfile(before.targetDeliveryProfile);
  verifyExactGallery(before.sticker, manifest);

  const onlineStore = before.publications.nodes.find(({ id, name }) =>
    id === ONLINE_STORE.id && name === ONLINE_STORE.name,
  );
  if (!onlineStore) fail("The guarded Online Store publication was not found.");

  const discounts = exactDiscounts(before);
  if (discounts.length > 1) fail("Multiple Gym Badge Sticker Add-On discounts exist.", { discounts });
  if (discounts.length === 1) verifyDiscount(discounts[0], qualifyingVariants);

  const scopes = before.currentAppInstallation.accessScopes.map(({ handle }) => handle);
  if (variant.deliveryProfile?.id !== DELIVERY_PROFILE.id) {
    fail("Pixel Archive must be assigned to the guarded Dsers Profile in Shopify admin before launch.", {
      expected: DELIVERY_PROFILE,
      actual: variant.deliveryProfile,
      nextAction: "Open Shopify Settings > Shipping and delivery > Dsers Profile and add Pixel Archive — 103-Piece Retro Card Sticker Pack.",
    });
  }
  const missingScopes = scopes.includes("write_discounts") ? [] : ["write_discounts"];

  if (!CONFIRMED) {
    console.log(JSON.stringify({
      ok: true,
      mode: "guarded-gym-badge-sticker-upsell-launch",
      access,
      sticker: before.sticker,
      badge: before.badge,
      desired: {
        stickerStatus: "UNLISTED",
        stickerPublication: ONLINE_STORE,
        stickerRegularPrice: STICKER.regularPrice,
        contextualPrice: DISCOUNT.finalPrice,
        discount: {
          title: DISCOUNT.title,
          amountOff: DISCOUNT.amount,
          qualifyingVariantIds: qualifyingVariants.map(({ id }) => id),
          discountedVariantId: STICKER.variantId,
          usesPerOrderLimit: DISCOUNT.usesPerOrderLimit,
        },
        deliveryProfile: DELIVERY_PROFILE,
      },
      existingDiscount: discounts[0] || null,
      authorizationRequired: missingScopes.length > 0,
      missingScopes,
      confirmationRequired: true,
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  if (missingScopes.length) {
    fail("Required Shopify scopes are missing; refusing all launch mutations.", {
      missingScopes,
      nextAction: "Add the missing scopes to AnalyticsMCPApp, save, and reauthorize the installation.",
    });
  }

  let stage = "setCatalogState";
  try {
    await setCatalogState(client, manifest);
    stage = "ensureInventory";
    await ensureInventory(client, before.sticker);
    stage = "setVariantState";
    await setVariantState(client);
    const afterStatus = await readState(client);
    stage = "publishOnlineStore";
    await publishOnlineStore(client, afterStatus.sticker);
    stage = "createAutomaticDiscount";
    if (!discounts.length) await createDiscount(client, qualifyingVariants);

    stage = "finalVerification";
    const finalState = await readState(client);
    verifyFinal(finalState, manifest, qualifyingVariants);

    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      sticker: {
        id: finalState.sticker.id,
        title: finalState.sticker.title,
        handle: finalState.sticker.handle,
        status: finalState.sticker.status,
        onlineStoreUrl: finalState.sticker.onlineStoreUrl,
        variant: stickerVariant(finalState.sticker),
        publishedChannels: publishedChannels(finalState.sticker),
      },
      badge: {
        id: finalState.badge.id,
        title: finalState.badge.title,
        qualifyingVariants,
      },
      automaticDiscount: exactDiscounts(finalState)[0],
      safety: "The sticker product is UNLISTED, published only to Online Store, and discounted only when a gym badge variant is present in the same order.",
    }, null, 2));
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        recovery: "Re-run the read-only preflight. Do not use the generic catalog publish command, which would make this offer ACTIVE.",
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
