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
};

const UPSELL = {
  id: "gid://shopify/Product/9420423463017",
  handle: "eternal-wish-23cm-coiled-dragon-rider-display",
  variantId: "gid://shopify/ProductVariant/47934894473321",
  sku: "ZK-FIG-EW23-CD",
  regularPrice: "99.99",
  compareAtPrice: null,
};

const DISCOUNT = {
  title: "Complete Collection",
  amount: "50.00",
  requiredScope: "write_discounts",
};

const READ_QUERY = `
  query ReadCompleteCollectionOffer($mainId: ID!, $upsellId: ID!) {
    currentAppInstallation { accessScopes { handle } }
    main: product(id: $mainId) {
      id
      title
      handle
      status
      variants(first: 10) { nodes { id sku price compareAtPrice availableForSale } }
    }
    upsell: product(id: $upsellId) {
      id
      title
      handle
      status
      variants(first: 10) { nodes { id sku price compareAtPrice availableForSale } }
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
                  productVariants(first: 20) { nodes { id sku } }
                }
              }
            }
            customerGets {
              appliesOnOneTimePurchase
              appliesOnSubscription
              items {
                ... on DiscountProducts {
                  productVariants(first: 20) { nodes { id sku } }
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

const SET_PRICE_MUTATION = `
  mutation SetEternalWishRegularPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku price compareAtPrice availableForSale }
      userErrors { field message }
    }
  }
`;

const CREATE_DISCOUNT_MUTATION = `
  mutation CreateCompleteCollectionDiscount($input: DiscountAutomaticBxgyInput!) {
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

function variant(product, expected) {
  if (!product || product.id !== expected.id || product.handle !== expected.handle) {
    fail("Product identity guard failed; refusing Complete Collection mutations.", {
      expected,
      actual: product && { id: product.id, handle: product.handle, title: product.title },
    });
  }
  const match = product.variants.nodes.find((node) => node.id === expected.variantId);
  if (!match || match.sku !== expected.sku) {
    fail("Variant identity guard failed; refusing Complete Collection mutations.", {
      expected,
      actual: product.variants.nodes,
    });
  }
  return match;
}

function exactDiscountNodes(state) {
  return state.automaticDiscountNodes.nodes.filter((node) => {
    const discount = node.automaticDiscount;
    return discount.__typename === "DiscountAutomaticBxgy" && discount.title === DISCOUNT.title;
  });
}

function verifyDiscount(node) {
  if (!node) fail("Complete Collection automatic discount was not found.");
  const discount = node.automaticDiscount;
  const buyVariants = discount.customerBuys.items?.productVariants?.nodes || [];
  const getVariants = discount.customerGets.items?.productVariants?.nodes || [];
  const quantityOffer = discount.customerGets.value;
  const amount = quantityOffer?.effect?.amount?.amount;

  if (
    discount.__typename !== "DiscountAutomaticBxgy" ||
    discount.title !== DISCOUNT.title ||
    discount.status !== "ACTIVE" ||
    discount.usesPerOrderLimit !== 1 ||
    discount.endsAt !== null ||
    String(discount.customerBuys.value?.quantity) !== "1" ||
    discount.customerBuys.isOneTimePurchase !== true ||
    discount.customerBuys.isSubscription !== false ||
    buyVariants.length !== 1 ||
    buyVariants[0].id !== MAIN.variantId ||
    String(quantityOffer?.quantity?.quantity) !== "1" ||
    Number(amount) !== Number(DISCOUNT.amount) ||
    quantityOffer?.effect?.amount?.currencyCode !== "USD" ||
    quantityOffer?.effect?.appliesOnEachItem !== true ||
    discount.customerGets.appliesOnOneTimePurchase !== true ||
    discount.customerGets.appliesOnSubscription !== false ||
    getVariants.length !== 1 ||
    getVariants[0].id !== UPSELL.variantId ||
    discount.combinesWith.productDiscounts !== false ||
    discount.combinesWith.orderDiscounts !== false ||
    discount.combinesWith.shippingDiscounts !== true
  ) {
    fail("Complete Collection automatic discount does not match the guarded offer.", { node });
  }
}

async function readState(client) {
  return client.graphql(READ_QUERY, {
    mainId: MAIN.id,
    upsellId: UPSELL.id,
  });
}

async function setUpsellPrice(client, price, compareAtPrice) {
  const data = await client.graphql(SET_PRICE_MUTATION, {
    productId: UPSELL.id,
    variants: [{
      id: UPSELL.variantId,
      price,
      compareAtPrice,
      inventoryPolicy: "CONTINUE",
    }],
  });
  assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
  return data.productVariantsBulkUpdate.productVariants?.[0];
}

async function createDiscount(client) {
  const data = await client.graphql(CREATE_DISCOUNT_MUTATION, {
    input: {
      title: DISCOUNT.title,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      context: { all: "ALL" },
      usesPerOrderLimit: "1",
      combinesWith: {
        productDiscounts: false,
        orderDiscounts: false,
        shippingDiscounts: true,
      },
      customerBuys: {
        value: { quantity: "1" },
        items: { products: { productVariantsToAdd: [MAIN.variantId] } },
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
        items: { products: { productVariantsToAdd: [UPSELL.variantId] } },
      },
    },
  });
  assertNoUserErrors(data.discountAutomaticBxgyCreate, "discountAutomaticBxgyCreate");
  return data.discountAutomaticBxgyCreate.automaticDiscountNode;
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const before = await readState(client);
  const mainVariant = variant(before.main, MAIN);
  const upsellVariant = variant(before.upsell, UPSELL);
  const exactDiscounts = exactDiscountNodes(before);
  const installedScopes = before.currentAppInstallation.accessScopes.map(({ handle }) => handle);
  const hasWriteDiscounts = installedScopes.includes(DISCOUNT.requiredScope);

  if (exactDiscounts.length > 1) {
    fail("Multiple Complete Collection discounts exist; refusing ambiguous mutations.", {
      discounts: exactDiscounts,
    });
  }

  if (!confirm) {
    console.log(JSON.stringify({
      ok: true,
      mode: "guarded-complete-collection-discount",
      access,
      main: { product: before.main, variant: mainVariant },
      upsell: { product: before.upsell, variant: upsellVariant },
      existingDiscount: exactDiscounts[0] || null,
      desired: {
        upsellRegularPrice: UPSELL.regularPrice,
        upsellCompareAtPrice: UPSELL.compareAtPrice,
        automaticDiscount: {
          title: DISCOUNT.title,
          qualifyingVariantId: MAIN.variantId,
          discountedVariantId: UPSELL.variantId,
          amountOff: DISCOUNT.amount,
          quantityLimitPerOrder: 1,
        },
      },
      authorizationRequired: !hasWriteDiscounts,
      missingScope: hasWriteDiscounts ? null : DISCOUNT.requiredScope,
      confirmationRequired: true,
      mutationsExecuted: false,
    }, null, 2));
    return;
  }

  if (!hasWriteDiscounts) {
    fail("The Zenkai API app is missing write_discounts; refusing all pricing and discount mutations.", {
      requiredScope: DISCOUNT.requiredScope,
      nextAction: "Add write_discounts to AnalyticsMCPApp, save the app configuration, and reauthorize the installation.",
    });
  }

  if (exactDiscounts.length === 1) {
    verifyDiscount(exactDiscounts[0]);
  }

  const originalPrice = upsellVariant.price;
  const originalCompareAtPrice = upsellVariant.compareAtPrice;
  let priceChanged = false;

  try {
    if (
      originalPrice !== UPSELL.regularPrice ||
      originalCompareAtPrice !== UPSELL.compareAtPrice
    ) {
      const updated = await setUpsellPrice(
        client,
        UPSELL.regularPrice,
        UPSELL.compareAtPrice,
      );
      if (
        updated?.id !== UPSELL.variantId ||
        updated?.sku !== UPSELL.sku ||
        updated?.price !== UPSELL.regularPrice ||
        updated?.compareAtPrice !== UPSELL.compareAtPrice
      ) {
        fail("Shopify did not return the exact guarded Eternal Wish regular price.", { updated });
      }
      priceChanged = true;
    }

    if (!exactDiscounts.length) await createDiscount(client);

    const after = await readState(client);
    const finalMainVariant = variant(after.main, MAIN);
    const finalUpsellVariant = variant(after.upsell, UPSELL);
    const finalDiscounts = exactDiscountNodes(after);
    if (
      finalMainVariant.availableForSale !== true ||
      finalUpsellVariant.availableForSale !== true ||
      finalUpsellVariant.price !== UPSELL.regularPrice ||
      finalUpsellVariant.compareAtPrice !== UPSELL.compareAtPrice ||
      finalDiscounts.length !== 1
    ) {
      fail("Complete Collection final product verification failed.", {
        finalMainVariant,
        finalUpsellVariant,
        finalDiscounts,
      });
    }
    verifyDiscount(finalDiscounts[0]);

    console.log(JSON.stringify({
      ok: true,
      mutationsExecuted: true,
      mainVariant: finalMainVariant,
      upsellVariant: finalUpsellVariant,
      automaticDiscount: finalDiscounts[0],
      qualifiedTotalBeforeTaxAndShipping: "149.98",
    }, null, 2));
  } catch (error) {
    if (priceChanged && !exactDiscounts.length) {
      try {
        await setUpsellPrice(client, originalPrice, originalCompareAtPrice);
      } catch (rollbackError) {
        if (error instanceof CatalogApiError) {
          error.details = {
            ...error.details,
            rollbackError: rollbackError.message,
          };
        }
      }
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
