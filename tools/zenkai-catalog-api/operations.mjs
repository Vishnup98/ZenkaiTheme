import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  assertNoUserErrors,
  CatalogApiError,
  verifyZenkaiAccess,
} from "./client.mjs";
import { buildProductInput, buildVariantInputs, THEME_ROOT } from "./manifest.mjs";

const PREFLIGHT_QUERY = `
  query CatalogProductPreflight($handle: String!, $skuQuery: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      status
    }
    productVariants(first: 100, query: $skuQuery) {
      nodes {
        id
        sku
        product {
          id
          title
          handle
        }
      }
    }
    locations(first: 100, includeInactive: false) {
      nodes {
        id
        name
        isActive
      }
    }
    publications(first: 100) {
      nodes {
        id
        name
      }
    }
  }
`;

function escapeSearchValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function makeSkuQuery(skus) {
  return skus.map((sku) => `sku:"${escapeSearchValue(sku)}"`).join(" OR ");
}

function buildLocationResolver(locations) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const byName = new Map();
  for (const location of locations) {
    const key = location.name.toLowerCase();
    const matches = byName.get(key) || [];
    matches.push(location);
    byName.set(key, matches);
  }

  return (inventory) => {
    if (inventory.locationId) {
      if (!byId.has(inventory.locationId)) {
        throw new CatalogApiError(`Inventory location is not active or accessible: ${inventory.locationId}`);
      }
      return inventory.locationId;
    }
    const matches = byName.get(inventory.locationName.trim().toLowerCase()) || [];
    if (matches.length !== 1) {
      throw new CatalogApiError(
        matches.length
          ? `Inventory location name is ambiguous: ${inventory.locationName}`
          : `Inventory location was not found: ${inventory.locationName}`,
      );
    }
    return matches[0].id;
  };
}

export async function preflightCatalogProduct(client, prepared) {
  const access = await verifyZenkaiAccess(client);
  const skus = prepared.manifest.variants.map((variant) => variant.sku.trim());
  const data = await client.graphql(PREFLIGHT_QUERY, {
    handle: prepared.manifest.handle,
    skuQuery: makeSkuQuery(skus),
  });
  const errors = [];
  const warnings = [...prepared.warnings];

  if (data.productByHandle) {
    errors.push(`Product handle already exists: ${prepared.manifest.handle} (${data.productByHandle.id}).`);
  }

  const requestedSkus = new Set(skus.map((sku) => sku.toLowerCase()));
  const skuConflicts = data.productVariants.nodes.filter(
    (variant) => variant.sku && requestedSkus.has(variant.sku.toLowerCase()),
  );
  for (const conflict of skuConflicts) {
    errors.push(
      `SKU already exists: ${conflict.sku} on ${conflict.product.title} (${conflict.product.id}).`,
    );
  }

  const resolveLocation = buildLocationResolver(data.locations.nodes);
  for (const variant of prepared.manifest.variants) {
    for (const inventory of variant.inventory || []) {
      try {
        resolveLocation(inventory);
      } catch (error) {
        errors.push(`${variant.sku}: ${error.message}`);
      }
    }
  }

  const onlineStore = data.publications.nodes.find((publication) => publication.name === "Online Store");
  if (!onlineStore) warnings.push("Online Store publication is not accessible; a later publish command will fail.");

  return {
    ok: errors.length === 0,
    mode: "read-only-preflight",
    access,
    product: {
      title: prepared.manifest.title,
      handle: prepared.manifest.handle,
      statusOnCreate: "DRAFT",
      template: prepared.templateRelativePath,
      variantCount: prepared.manifest.variants.length,
      imageCount: prepared.images.length,
    },
    conflicts: {
      handle: data.productByHandle
        ? {
            id: data.productByHandle.id,
            title: data.productByHandle.title,
            handle: data.productByHandle.handle,
            status: data.productByHandle.status,
          }
        : null,
      skus: skuConflicts,
    },
    locations: data.locations.nodes,
    publications: data.publications.nodes,
    errors,
    warnings,
    _internal: { resolveLocation, onlineStore },
  };
}

const PRODUCT_CREATE_MUTATION = `
  mutation CreateDraftCatalogProduct($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        handle
        status
        templateSuffix
        options {
          id
          name
          values
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANTS_CREATE_MUTATION = `
  mutation CreateCatalogVariants(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      productVariants {
        id
        title
        price
        compareAtPrice
        sku
        selectedOptions {
          name
          value
        }
        inventoryItem {
          id
          sku
          tracked
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const STAGED_UPLOAD_MUTATION = `
  mutation StageCatalogImage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE_MUTATION = `
  mutation CreateCatalogImageFile($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        alt
        fileStatus
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_STATUS_QUERY = `
  query CatalogImageFileStatus($id: ID!) {
    node(id: $id) {
      ... on File {
        id
        fileStatus
      }
      ... on MediaImage {
        image {
          url
        }
      }
    }
  }
`;

const FILE_ATTACH_MUTATION = `
  mutation AttachCatalogImageToProduct($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
        alt
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANT_MEDIA_UPDATE_MUTATION = `
  mutation LinkCatalogImageToVariants(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_RESULT_QUERY = `
  query CatalogProductResult($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      onlineStorePreviewUrl
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          selectedOptions {
            name
            value
          }
          inventoryItem {
            id
            tracked
          }
        }
      }
      media(first: 100) {
        nodes {
          id
          alt
          mediaContentType
          status
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    }
  }
`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createStagedUpload(client, image) {
  const data = await client.graphql(STAGED_UPLOAD_MUTATION, {
    input: [
      {
        resource: "IMAGE",
        filename: image.filename,
        mimeType: image.mimeType,
        httpMethod: "POST",
        fileSize: String(image.fileSize),
      },
    ],
  });
  assertNoUserErrors(data.stagedUploadsCreate, "stagedUploadsCreate");
  const target = data.stagedUploadsCreate.stagedTargets?.[0];
  if (!target) throw new CatalogApiError("Shopify did not return a staged image-upload target.");

  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  const fileBuffer = await readFile(image.absolutePath);
  form.append("file", new Blob([fileBuffer], { type: image.mimeType }), image.filename);
  const uploadResponse = await fetch(target.url, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    throw new CatalogApiError(`Staged image upload failed (${uploadResponse.status}).`, {
      image: image.originalSource,
      response: (await uploadResponse.text()).slice(0, 500),
    });
  }
  return target.resourceUrl;
}

async function waitForFileReady(client, fileId, { attempts = 30, intervalMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const data = await client.graphql(FILE_STATUS_QUERY, { id: fileId });
    const file = data.node;
    if (!file) throw new CatalogApiError(`Shopify image file disappeared: ${fileId}`);
    if (file.fileStatus === "READY") return file;
    if (file.fileStatus === "FAILED") {
      throw new CatalogApiError(`Shopify failed to process image file: ${fileId}`);
    }
    if (attempt < attempts) await delay(intervalMs);
  }
  throw new CatalogApiError(`Timed out waiting for Shopify to process image file: ${fileId}`);
}

export async function uploadCatalogImageFile(
  client,
  image,
  { referencesToAdd = [], duplicateResolutionMode = "APPEND_UUID" } = {},
) {
  const originalSource =
    image.kind === "local" ? await createStagedUpload(client, image) : image.originalSource;
  const created = await client.graphql(FILE_CREATE_MUTATION, {
    files: [
      {
        originalSource,
        contentType: "IMAGE",
        alt: image.alt || "",
        filename: image.filename,
        duplicateResolutionMode,
      },
    ],
  });
  assertNoUserErrors(created.fileCreate, "fileCreate");
  const file = created.fileCreate.files?.[0];
  if (!file?.id) throw new CatalogApiError("Shopify did not return an image file ID.");

  const ready = await waitForFileReady(client, file.id);
  if (referencesToAdd.length) {
    const attached = await client.graphql(FILE_ATTACH_MUTATION, {
      files: [{ id: file.id, referencesToAdd }],
    });
    assertNoUserErrors(attached.fileUpdate, "fileUpdate");
  }
  return {
    id: file.id,
    source: image.originalSource,
    url: ready.image?.url || file.image?.url || null,
    variantSkus: image.variantSkus || [],
  };
}

async function uploadAndAttachImage(client, productId, image) {
  return uploadCatalogImageFile(client, image, { referencesToAdd: [productId] });
}

function publicPreflight(preflight) {
  const { _internal, ...result } = preflight;
  return result;
}

export async function applyCatalogProduct(client, prepared, { confirm = false } = {}) {
  const preflight = await preflightCatalogProduct(client, prepared);
  if (!preflight.ok) {
    throw new CatalogApiError("Catalog preflight failed; no mutations were executed.", {
      preflight: publicPreflight(preflight),
    });
  }
  if (!confirm) {
    return {
      ...publicPreflight(preflight),
      confirmationRequired: true,
      nextCommand: "Repeat apply with --confirm to create this product as a Shopify draft.",
      mutationsExecuted: false,
    };
  }

  let productId = null;
  let stage = "productCreate";
  try {
    const productData = await client.graphql(PRODUCT_CREATE_MUTATION, {
      product: buildProductInput(prepared),
    });
    assertNoUserErrors(productData.productCreate, "productCreate");
    const product = productData.productCreate.product;
    if (!product?.id) throw new CatalogApiError("Shopify did not return the created product ID.");
    if (product.status !== "DRAFT") {
      throw new CatalogApiError("Safety guard: newly created product was not returned as DRAFT.");
    }
    productId = product.id;

    stage = "productVariantsBulkCreate";
    const variantsData = await client.graphql(VARIANTS_CREATE_MUTATION, {
      productId,
      variants: buildVariantInputs(prepared, preflight._internal.resolveLocation),
    });
    assertNoUserErrors(variantsData.productVariantsBulkCreate, "productVariantsBulkCreate");
    const createdVariants = variantsData.productVariantsBulkCreate.productVariants || [];
    const variantsBySku = new Map(createdVariants.map((variant) => [variant.sku, variant]));
    const missingSkus = prepared.manifest.variants
      .map((variant) => variant.sku)
      .filter((sku) => !variantsBySku.has(sku));
    if (missingSkus.length) {
      throw new CatalogApiError("Shopify did not return every requested SKU.", { missingSkus });
    }

    stage = "imageUpload";
    const uploadedImages = [];
    for (const image of prepared.images) {
      uploadedImages.push(await uploadAndAttachImage(client, productId, image));
    }

    const mediaLinks = [];
    for (const image of uploadedImages) {
      for (const sku of image.variantSkus) {
        mediaLinks.push({ id: variantsBySku.get(sku).id, mediaId: image.id });
      }
    }
    if (mediaLinks.length) {
      stage = "productVariantsBulkUpdate";
      const linked = await client.graphql(VARIANT_MEDIA_UPDATE_MUTATION, {
        productId,
        variants: mediaLinks,
      });
      assertNoUserErrors(linked.productVariantsBulkUpdate, "productVariantsBulkUpdate");
    }

    stage = "resultQuery";
    const result = await client.graphql(PRODUCT_RESULT_QUERY, { id: productId });
    if (!result.product) throw new CatalogApiError("Created product could not be read back.");
    return {
      ok: true,
      mutationsExecuted: true,
      product: result.product,
      uploadedImages,
      published: false,
      safety: "Product remains DRAFT and unpublished. Use the separate publish command after review.",
    };
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        stage,
        productId,
        recovery:
          productId &&
          "A partially configured DRAFT product may remain in Shopify. Inspect it before retrying; the CLI never auto-deletes products.",
      };
    }
    throw error;
  }
}

const PUBLISH_READINESS_QUERY = `
  query CatalogPublishReadiness($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      templateSuffix
      onlineStoreUrl
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
        }
      }
      media(first: 100) {
        nodes {
          id
          mediaContentType
          status
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    }
    publications(first: 100) {
      nodes {
        id
        name
      }
    }
  }
`;

const ACTIVATE_PRODUCT_MUTATION = `
  mutation ActivateCatalogProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Keep publicationId as a first-class variable so the return field can verify the exact channel.
const PUBLISH_PRODUCT_MUTATION_WITH_RESULT = `
  mutation PublishCatalogProduct(
    $id: ID!
    $input: [PublicationInput!]!
    $publicationId: ID!
  ) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        publishedOnPublication(publicationId: $publicationId)
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function assertProductId(productId) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId || "")) {
    throw new CatalogApiError("--product-id must be a Shopify Product GID.");
  }
}

async function checkTemplateForProduct(product) {
  const relativePath = product.templateSuffix
    ? `templates/product.${product.templateSuffix}.json`
    : "templates/product.json";
  try {
    const metadata = await stat(path.join(THEME_ROOT, relativePath));
    if (!metadata.isFile()) throw new Error("not a file");
  } catch {
    return { relativePath, exists: false };
  }
  return { relativePath, exists: true };
}

export async function publishCatalogProduct(client, productId, { confirm = false } = {}) {
  assertProductId(productId);
  const access = await verifyZenkaiAccess(client);
  const data = await client.graphql(PUBLISH_READINESS_QUERY, { id: productId });
  const product = data.product;
  if (!product) throw new CatalogApiError(`Product was not found: ${productId}`);
  const onlineStore = data.publications.nodes.find((publication) => publication.name === "Online Store");
  const template = await checkTemplateForProduct(product);
  const errors = [];
  if (!product.title?.trim()) errors.push("Product title is empty.");
  if (!product.handle?.trim()) errors.push("Product handle is empty.");
  if (!product.variants.nodes.length) errors.push("Product has no variants.");
  for (const variant of product.variants.nodes) {
    if (!variant.sku?.trim()) errors.push(`Variant ${variant.id} has no SKU.`);
    if (!(Number(variant.price) > 0)) errors.push(`Variant ${variant.sku || variant.id} has no positive price.`);
  }
  const readyImages = product.media.nodes.filter(
    (media) => media.mediaContentType === "IMAGE" && media.status === "READY",
  );
  if (!readyImages.length) errors.push("Product has no READY image.");
  if (!template.exists) errors.push(`Theme template is missing locally: ${template.relativePath}.`);
  if (!onlineStore) errors.push("Online Store publication is not accessible.");

  const readiness = {
    ok: errors.length === 0,
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      currentStatus: product.status,
      template: template.relativePath,
      variantCount: product.variants.nodes.length,
      readyImageCount: readyImages.length,
    },
    targetPublication: onlineStore || null,
    errors,
  };
  if (errors.length) {
    throw new CatalogApiError("Product failed publish readiness checks; no mutations were executed.", {
      readiness,
    });
  }
  if (!confirm) {
    return {
      ok: true,
      mode: "read-only-publish-preflight",
      access,
      readiness,
      confirmationRequired: true,
      mutationsExecuted: false,
      nextCommand: "Repeat publish with --confirm to activate and publish only to Online Store.",
    };
  }

  let activated = product.status === "ACTIVE";
  if (!activated) {
    const update = await client.graphql(ACTIVATE_PRODUCT_MUTATION, {
      product: { id: productId, status: "ACTIVE" },
    });
    assertNoUserErrors(update.productUpdate, "productUpdate");
    activated = update.productUpdate.product?.status === "ACTIVE";
    if (!activated) throw new CatalogApiError("Shopify did not return the product as ACTIVE.");
  }

  try {
    const published = await client.graphql(PUBLISH_PRODUCT_MUTATION_WITH_RESULT, {
      id: productId,
      input: [{ publicationId: onlineStore.id }],
      publicationId: onlineStore.id,
    });
    assertNoUserErrors(published.publishablePublish, "publishablePublish");
    const publishedOnOnlineStore =
      published.publishablePublish.publishable?.publishedOnPublication === true;
    if (!publishedOnOnlineStore) {
      throw new CatalogApiError("Shopify did not confirm Online Store publication.");
    }
    return {
      ok: true,
      mutationsExecuted: true,
      productId,
      status: "ACTIVE",
      publication: onlineStore,
      publishedOnOnlineStore,
    };
  } catch (error) {
    if (error instanceof CatalogApiError) {
      error.details = {
        ...error.details,
        productId,
        activated,
        recovery:
          "The product may be ACTIVE but unpublished if publication failed. Review it in Shopify before retrying.",
      };
    }
    throw error;
  }
}

export async function getCatalogOverview(client) {
  const access = await verifyZenkaiAccess(client);
  const data = await client.graphql(`
    query CatalogOverview {
      locations(first: 100, includeInactive: false) {
        nodes { id name isActive }
      }
      publications(first: 100) {
        nodes { id name }
      }
    }
  `);
  return {
    ...access,
    locations: data.locations.nodes,
    publications: data.publications.nodes,
    mutationsExecuted: false,
  };
}

export const operationInternals = {
  makeSkuQuery,
  buildLocationResolver,
  publicPreflight,
};
