#!/usr/bin/env node

import {
  assertNoUserErrors,
  CatalogApiError,
  ShopifyAdminClient,
  verifyZenkaiAccess,
} from "../../tools/zenkai-catalog-api/client.mjs";
import { loadManifest } from "../../tools/zenkai-catalog-api/manifest.mjs";

const CONFIRMED = process.argv.includes("--confirm");
const POLICY_HTML =
  "<h3>Collector-item return policy</h3><p>These displays are final sale. We do not accept returns for a change of mind or because the piece is not to your taste. If your display arrives damaged or defective, contact us for a replacement or refund.</p>";

const PRODUCTS = [
  {
    id: "gid://shopify/Product/9420750880873",
    manifestPath: "catalog-products/summoning-glow-16cm/product.manifest.json",
  },
  {
    id: "gid://shopify/Product/9420423463017",
    manifestPath: "catalog-products/eternal-dragon-23cm/product.manifest.json",
  },
];

const READ_QUERY = `
  query ReadDefectOnlyProducts($firstId: ID!, $secondId: ID!) {
    first: product(id: $firstId) {
      id
      title
      handle
      status
      templateSuffix
      descriptionHtml
    }
    second: product(id: $secondId) {
      id
      title
      handle
      status
      templateSuffix
      descriptionHtml
    }
  }
`;

const UPDATE_MUTATION = `
  mutation SetDefectOnlyProductCopy($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        status
        templateSuffix
        descriptionHtml
      }
      userErrors { field message }
    }
  }
`;

function normalizeHtml(value) {
  return String(value || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function fail(message, details = {}) {
  throw new CatalogApiError(message, details);
}

async function readProducts(client) {
  const data = await client.graphql(READ_QUERY, {
    firstId: PRODUCTS[0].id,
    secondId: PRODUCTS[1].id,
  });
  return [data.first, data.second];
}

async function desiredProducts() {
  return Promise.all(
    PRODUCTS.map(async (definition) => {
      const { manifest } = await loadManifest(definition.manifestPath);
      if (!manifest.descriptionHtml.endsWith(POLICY_HTML)) {
        fail(`Manifest is missing the exact approved policy copy: ${definition.manifestPath}`);
      }
      return {
        ...definition,
        title: manifest.title,
        handle: manifest.handle,
        templateSuffix: manifest.templateSuffix,
        desiredDescriptionHtml: manifest.descriptionHtml,
        previousDescriptionHtml: manifest.descriptionHtml.slice(0, -POLICY_HTML.length),
      };
    }),
  );
}

function verifyIdentity(product, desired) {
  if (!product) fail(`Product was not found: ${desired.id}`);
  if (
    product.id !== desired.id ||
    product.title !== desired.title ||
    product.handle !== desired.handle ||
    product.status !== "UNLISTED" ||
    product.templateSuffix !== desired.templateSuffix
  ) {
    fail("Defect-only policy product identity guard failed.", { product, desired });
  }
}

function verifyAllowedCurrentCopy(product, desired) {
  const current = normalizeHtml(product.descriptionHtml);
  const allowed = [desired.previousDescriptionHtml, desired.desiredDescriptionHtml].map(normalizeHtml);
  if (!allowed.includes(current)) {
    fail("Refusing to overwrite unexpected live product-description copy.", {
      productId: product.id,
      title: product.title,
      currentDescriptionHtml: product.descriptionHtml,
    });
  }
}

async function updateDescription(client, id, descriptionHtml) {
  const data = await client.graphql(UPDATE_MUTATION, {
    product: { id, descriptionHtml },
  });
  assertNoUserErrors(data.productUpdate, "productUpdate(defect-only policy)");
  const product = data.productUpdate.product;
  if (product?.id !== id || normalizeHtml(product.descriptionHtml) !== normalizeHtml(descriptionHtml)) {
    fail("Shopify did not return the exact requested product-description copy.", { product });
  }
  return product;
}

async function run() {
  const client = ShopifyAdminClient.fromEnvironment();
  const access = await verifyZenkaiAccess(client);
  const desired = await desiredProducts();
  const before = await readProducts(client);

  before.forEach((product, index) => {
    verifyIdentity(product, desired[index]);
    verifyAllowedCurrentCopy(product, desired[index]);
  });

  const preflight = {
    ok: true,
    mode: "guarded-defect-only-collectible-policy",
    access,
    products: before.map((product, index) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      templateSuffix: product.templateSuffix,
      policyAlreadyPresent:
        normalizeHtml(product.descriptionHtml) === normalizeHtml(desired[index].desiredDescriptionHtml),
    })),
    policy: {
      eligibility: "Replacement or refund only when the display arrives damaged or defective.",
      excluded: "Change of mind or deciding the display is not to the customer's taste.",
    },
  };

  if (!CONFIRMED) {
    console.log(
      JSON.stringify(
        {
          ...preflight,
          confirmationRequired: true,
          mutationsExecuted: false,
          nextCommand:
            "node catalog-products/summoning-glow-16cm/sync-defect-only-sale-policy.mjs --confirm",
        },
        null,
        2,
      ),
    );
    return;
  }

  const changed = [];
  let stage = "updateDescriptions";
  try {
    for (let index = 0; index < before.length; index += 1) {
      if (
        normalizeHtml(before[index].descriptionHtml) ===
        normalizeHtml(desired[index].desiredDescriptionHtml)
      ) {
        continue;
      }
      await updateDescription(client, desired[index].id, desired[index].desiredDescriptionHtml);
      changed.push({ index, previousDescriptionHtml: before[index].descriptionHtml });
    }

    stage = "finalVerification";
    const after = await readProducts(client);
    after.forEach((product, index) => {
      verifyIdentity(product, desired[index]);
      if (
        normalizeHtml(product.descriptionHtml) !== normalizeHtml(desired[index].desiredDescriptionHtml)
      ) {
        fail("Final defect-only policy verification failed.", { product });
      }
    });

    console.log(
      JSON.stringify(
        {
          ...preflight,
          confirmationRequired: false,
          mutationsExecuted: changed.length > 0,
          updatedProductIds: changed.map(({ index }) => desired[index].id),
          verified: after.map((product) => ({
            id: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            policyPresent: product.descriptionHtml.includes(POLICY_HTML),
          })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const rollback = [];
    for (const change of changed.reverse()) {
      try {
        await updateDescription(
          client,
          desired[change.index].id,
          change.previousDescriptionHtml,
        );
        rollback.push({ id: desired[change.index].id, restored: true });
      } catch (rollbackError) {
        rollback.push({
          id: desired[change.index].id,
          restored: false,
          error: rollbackError.message,
        });
      }
    }
    fail("Defect-only policy sync failed; attempted rollback for every changed product.", {
      stage,
      cause: error.message,
      rollback,
    });
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        details: error.details || null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
