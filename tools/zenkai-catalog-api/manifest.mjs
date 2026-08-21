import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogApiError } from "./client.mjs";

export const THEME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMAGE_LIMIT_BYTES = 20 * 1024 * 1024;
const MIME_TYPES = new Map([
  [".gif", "image/gif"],
  [".heic", "image/heic"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const WEIGHT_UNITS = new Set(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"]);
const INVENTORY_POLICIES = new Set(["DENY", "CONTINUE"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function decimalString(value) {
  return typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function reportUnknownFields(value, allowed, label, errors) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label}.${key} is not a supported field.`);
  }
}

function validateShape(manifest) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(manifest)) {
    return { errors: ["Manifest root must be a JSON object."], warnings };
  }
  reportUnknownFields(
    manifest,
    new Set([
      "$schema",
      "schemaVersion",
      "title",
      "handle",
      "descriptionHtml",
      "vendor",
      "productType",
      "tags",
      "templateSuffix",
      "seo",
      "category",
      "collectionsToJoin",
      "options",
      "variants",
      "images",
    ]),
    "manifest",
    errors,
  );

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  if (manifest.$schema !== undefined && typeof manifest.$schema !== "string") {
    errors.push("$schema must be a string.");
  }
  if (typeof manifest.title !== "string" || !manifest.title.trim()) errors.push("title is required.");
  if (manifest.title?.length > 255) errors.push("title cannot exceed 255 characters.");
  if (typeof manifest.handle !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.handle)) {
    errors.push("handle must be a lowercase URL slug containing only letters, numbers, and hyphens.");
  }
  if (manifest.descriptionHtml !== undefined && typeof manifest.descriptionHtml !== "string") {
    errors.push("descriptionHtml must be a string.");
  }
  for (const field of ["vendor", "productType", "category"]) {
    if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  }
  if (
    manifest.templateSuffix !== undefined &&
    manifest.templateSuffix !== null &&
    (typeof manifest.templateSuffix !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(manifest.templateSuffix))
  ) {
    errors.push("templateSuffix must be null or a lowercase Shopify template suffix.");
  }
  if (manifest.tags !== undefined && (!Array.isArray(manifest.tags) || !manifest.tags.every((tag) => typeof tag === "string"))) {
    errors.push("tags must be an array of strings.");
  }
  if (manifest.tags?.length > 250) errors.push("tags cannot contain more than 250 values.");
  if (manifest.seo !== undefined) {
    reportUnknownFields(manifest.seo, new Set(["title", "description"]), "seo", errors);
    if (!isPlainObject(manifest.seo)) errors.push("seo must be an object.");
    for (const field of ["title", "description"]) {
      if (manifest.seo?.[field] !== undefined && typeof manifest.seo[field] !== "string") {
        errors.push(`seo.${field} must be a string.`);
      }
    }
  }
  if (
    manifest.collectionsToJoin !== undefined &&
    (!Array.isArray(manifest.collectionsToJoin) ||
      !manifest.collectionsToJoin.every((id) => /^gid:\/\/shopify\/Collection\/\d+$/.test(id)))
  ) {
    errors.push("collectionsToJoin must be an array of Shopify Collection GIDs.");
  }

  if (!Array.isArray(manifest.options) || manifest.options.length < 1 || manifest.options.length > 3) {
    errors.push("options must contain between 1 and 3 product options.");
  }
  const optionNames = [];
  const optionValuesByName = new Map();
  for (const [index, option] of (manifest.options || []).entries()) {
    const label = `options[${index}]`;
    reportUnknownFields(option, new Set(["name", "values"]), label, errors);
    if (!isPlainObject(option)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof option.name !== "string" || !option.name.trim()) errors.push(`${label}.name is required.`);
    if (!Array.isArray(option.values) || !option.values.length || !option.values.every((value) => typeof value === "string" && value.trim())) {
      errors.push(`${label}.values must be a non-empty array of strings.`);
    } else if (!unique(option.values)) {
      errors.push(`${label}.values must not contain duplicates.`);
    }
    if (typeof option.name === "string") {
      optionNames.push(option.name);
      optionValuesByName.set(option.name, new Set(option.values || []));
    }
  }
  if (!unique(optionNames.map((name) => name.toLowerCase()))) {
    errors.push("Product option names must be unique (case-insensitive).");
  }

  if (!Array.isArray(manifest.variants) || !manifest.variants.length) {
    errors.push("variants must be a non-empty array.");
  }
  if (manifest.variants?.length > 100) {
    errors.push("This guarded CLI supports at most 100 variants per manifest.");
  }
  const skus = [];
  const optionCombinations = [];
  for (const [index, variant] of (manifest.variants || []).entries()) {
    const label = `variants[${index}]`;
    reportUnknownFields(
      variant,
      new Set([
        "sku",
        "price",
        "compareAtPrice",
        "barcode",
        "options",
        "tracked",
        "requiresShipping",
        "taxable",
        "inventoryPolicy",
        "cost",
        "weight",
        "inventory",
      ]),
      label,
      errors,
    );
    if (!isPlainObject(variant)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof variant.sku !== "string" || !variant.sku.trim()) errors.push(`${label}.sku is required.`);
    else skus.push(variant.sku.trim());
    if (!decimalString(variant.price) || Number(variant.price) <= 0) {
      errors.push(`${label}.price must be a positive decimal string, such as "39.00".`);
    }
    if (variant.compareAtPrice !== undefined && variant.compareAtPrice !== null && !decimalString(variant.compareAtPrice)) {
      errors.push(`${label}.compareAtPrice must be null or a decimal string.`);
    }
    if (variant.cost !== undefined && variant.cost !== null && !decimalString(variant.cost)) {
      errors.push(`${label}.cost must be null or a decimal string.`);
    }
    if (variant.barcode !== undefined && variant.barcode !== null && typeof variant.barcode !== "string") {
      errors.push(`${label}.barcode must be null or a string.`);
    }
    for (const booleanField of ["tracked", "requiresShipping", "taxable"]) {
      if (variant[booleanField] !== undefined && typeof variant[booleanField] !== "boolean") {
        errors.push(`${label}.${booleanField} must be true or false.`);
      }
    }
    if (variant.inventoryPolicy !== undefined && !INVENTORY_POLICIES.has(variant.inventoryPolicy)) {
      errors.push(`${label}.inventoryPolicy must be DENY or CONTINUE.`);
    }
    if (!isPlainObject(variant.options)) {
      errors.push(`${label}.options must map every product option name to one value.`);
    } else {
      const keys = Object.keys(variant.options);
      if (keys.length !== optionNames.length || optionNames.some((name) => !keys.includes(name))) {
        errors.push(`${label}.options must contain exactly: ${optionNames.join(", ")}.`);
      }
      for (const [name, value] of Object.entries(variant.options)) {
        if (!optionValuesByName.get(name)?.has(value)) {
          errors.push(`${label}.options.${name} is not declared in the product option values.`);
        }
      }
      optionCombinations.push(optionNames.map((name) => variant.options[name]).join("\u0000"));
    }
    if (variant.weight !== undefined) {
      reportUnknownFields(variant.weight, new Set(["value", "unit"]), `${label}.weight`, errors);
      if (!isPlainObject(variant.weight) || typeof variant.weight.value !== "number" || variant.weight.value < 0) {
        errors.push(`${label}.weight.value must be a non-negative number.`);
      }
      if (!WEIGHT_UNITS.has(variant.weight?.unit)) {
        errors.push(`${label}.weight.unit must be GRAMS, KILOGRAMS, OUNCES, or POUNDS.`);
      }
    }
    if (variant.inventory !== undefined && !Array.isArray(variant.inventory)) {
      errors.push(`${label}.inventory must be an array.`);
    }
    for (const [inventoryIndex, inventory] of (variant.inventory || []).entries()) {
      const inventoryLabel = `${label}.inventory[${inventoryIndex}]`;
      reportUnknownFields(inventory, new Set(["locationId", "locationName", "quantity"]), inventoryLabel, errors);
      const hasId = typeof inventory?.locationId === "string";
      const hasName = typeof inventory?.locationName === "string" && inventory.locationName.trim();
      if (Number(hasId) + Number(Boolean(hasName)) !== 1) {
        errors.push(`${inventoryLabel} must contain exactly one of locationId or locationName.`);
      }
      if (hasId && !/^gid:\/\/shopify\/Location\/\d+$/.test(inventory.locationId)) {
        errors.push(`${inventoryLabel}.locationId must be a Shopify Location GID.`);
      }
      if (!Number.isInteger(inventory?.quantity) || inventory.quantity < 0) {
        errors.push(`${inventoryLabel}.quantity must be a non-negative integer.`);
      }
    }
  }
  if (!unique(skus.map((sku) => sku.toLowerCase()))) errors.push("Variant SKUs must be unique (case-insensitive).");
  if (!unique(optionCombinations)) errors.push("Variant option combinations must be unique.");

  if (manifest.images !== undefined && !Array.isArray(manifest.images)) errors.push("images must be an array.");
  const imageSkus = [];
  for (const [index, image] of (manifest.images || []).entries()) {
    const label = `images[${index}]`;
    reportUnknownFields(image, new Set(["source", "alt", "variantSkus"]), label, errors);
    if (!isPlainObject(image)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (typeof image.source !== "string" || !image.source.trim()) errors.push(`${label}.source is required.`);
    if (image.alt !== undefined && typeof image.alt !== "string") errors.push(`${label}.alt must be a string.`);
    if (image.variantSkus !== undefined && (!Array.isArray(image.variantSkus) || !image.variantSkus.every((sku) => typeof sku === "string"))) {
      errors.push(`${label}.variantSkus must be an array of SKU strings.`);
    }
    for (const sku of image.variantSkus || []) {
      if (!skus.includes(sku)) errors.push(`${label}.variantSkus references unknown SKU ${sku}.`);
      imageSkus.push(sku);
    }
  }
  if (!unique(imageSkus)) errors.push("A variant SKU can be linked to only one image.");
  if (!(manifest.images || []).length) warnings.push("The manifest has no product images; publishing readiness will fail until an image is added.");

  return { errors, warnings };
}

async function resolveLocalImage(source, manifestDirectory) {
  const candidate = path.resolve(manifestDirectory, source);
  let resolved;
  try {
    resolved = await realpath(candidate);
  } catch {
    throw new CatalogApiError(`Local image does not exist: ${source}`);
  }
  const root = await realpath(THEME_ROOT);
  if (!isInside(root, resolved)) {
    throw new CatalogApiError(`Local image must be inside the ZenkaiTheme repository: ${source}`);
  }
  const extension = path.extname(resolved).toLowerCase();
  const mimeType = MIME_TYPES.get(extension);
  if (!mimeType) throw new CatalogApiError(`Unsupported image extension for ${source}.`);
  const metadata = await stat(resolved);
  if (!metadata.isFile()) throw new CatalogApiError(`Image source is not a file: ${source}`);
  if (metadata.size > IMAGE_LIMIT_BYTES) {
    throw new CatalogApiError(`Image exceeds the 20 MB guardrail: ${source}`);
  }
  return {
    kind: "local",
    originalSource: source,
    absolutePath: resolved,
    filename: path.basename(resolved),
    mimeType,
    fileSize: metadata.size,
  };
}

async function prepareImage(image, manifestDirectory) {
  if (/^https:\/\//i.test(image.source)) {
    const url = new URL(image.source);
    if (url.hostname.toLowerCase().includes("proarmory")) {
      throw new CatalogApiError("Refusing a non-Zenkai image source.");
    }
    const extension = path.extname(url.pathname).toLowerCase();
    if (extension && !MIME_TYPES.has(extension)) {
      throw new CatalogApiError(`Unsupported remote image extension: ${image.source}`);
    }
    return { ...image, kind: "remote", originalSource: url.toString() };
  }
  if (/^[a-z]+:\/\//i.test(image.source)) {
    throw new CatalogApiError(`Only HTTPS remote image URLs are allowed: ${image.source}`);
  }
  return { ...image, ...(await resolveLocalImage(image.source, manifestDirectory)) };
}

export async function loadManifest(manifestPath) {
  if (!manifestPath) throw new CatalogApiError("--manifest is required.");
  const absolutePath = path.resolve(process.cwd(), manifestPath);
  let resolvedPath;
  try {
    resolvedPath = await realpath(absolutePath);
  } catch {
    throw new CatalogApiError(`Manifest does not exist: ${manifestPath}`);
  }
  const root = await realpath(THEME_ROOT);
  if (!isInside(root, resolvedPath)) {
    throw new CatalogApiError("Manifest must be inside the ZenkaiTheme repository.");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch (error) {
    throw new CatalogApiError(`Could not parse manifest JSON: ${error.message}`);
  }
  const validation = validateShape(manifest);
  if (validation.errors.length) {
    throw new CatalogApiError("Manifest validation failed.", validation);
  }

  const templateSuffix = manifest.templateSuffix || null;
  const templateRelativePath = templateSuffix
    ? `templates/product.${templateSuffix}.json`
    : "templates/product.json";
  const templatePath = path.join(root, templateRelativePath);
  try {
    const templateMetadata = await stat(templatePath);
    if (!templateMetadata.isFile()) throw new Error("not a file");
  } catch {
    throw new CatalogApiError(`Theme product template is missing: ${templateRelativePath}`);
  }

  const manifestDirectory = path.dirname(resolvedPath);
  const images = [];
  for (const image of manifest.images || []) images.push(await prepareImage(image, manifestDirectory));

  return {
    manifest,
    manifestPath: resolvedPath,
    templateRelativePath,
    images,
    warnings: validation.warnings,
  };
}

export function buildProductInput(prepared) {
  const manifest = prepared.manifest;
  return removeUndefined({
    title: manifest.title.trim(),
    handle: manifest.handle,
    descriptionHtml: manifest.descriptionHtml,
    vendor: manifest.vendor || "Zenkai Clothing",
    productType: manifest.productType,
    tags: manifest.tags,
    templateSuffix: manifest.templateSuffix || null,
    seo: manifest.seo,
    category: manifest.category,
    collectionsToJoin: manifest.collectionsToJoin,
    status: "DRAFT",
    productOptions: manifest.options.map((option) => ({
      name: option.name,
      values: option.values.map((name) => ({ name })),
    })),
  });
}

export function buildVariantInputs(prepared, locationResolver) {
  return prepared.manifest.variants.map((variant) =>
    removeUndefined({
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      barcode: variant.barcode,
      taxable: variant.taxable ?? true,
      inventoryPolicy: variant.inventoryPolicy || "DENY",
      optionValues: prepared.manifest.options.map((option) => ({
        optionName: option.name,
        name: variant.options[option.name],
      })),
      inventoryItem: removeUndefined({
        sku: variant.sku.trim(),
        tracked: variant.tracked ?? true,
        requiresShipping: variant.requiresShipping ?? true,
        cost: variant.cost,
        measurement: variant.weight ? { weight: variant.weight } : undefined,
      }),
      inventoryQuantities: variant.inventory?.map((inventory) => ({
        locationId: locationResolver(inventory),
        availableQuantity: inventory.quantity,
      })),
    }),
  );
}

export function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, removeUndefined(child)]),
  );
}

export const manifestInternals = { validateShape, isInside, decimalString };
