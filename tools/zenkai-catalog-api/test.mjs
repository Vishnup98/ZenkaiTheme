import assert from "node:assert/strict";
import test from "node:test";
import { ShopifyAdminClient } from "./client.mjs";
import { loadManifest, manifestInternals } from "./manifest.mjs";
import { operationInternals } from "./operations.mjs";

test("example manifest validates and resolves the default product template", async () => {
  const prepared = await loadManifest("tools/zenkai-catalog-api/example.manifest.json");
  assert.equal(prepared.manifest.schemaVersion, 1);
  assert.equal(prepared.templateRelativePath, "templates/product.json");
  assert.equal(prepared.manifest.variants.length, 2);
});

test("manifest validation rejects write-control fields", () => {
  const invalid = {
    schemaVersion: 1,
    title: "Test",
    handle: "test",
    status: "ACTIVE",
    publish: true,
    options: [{ name: "Size", values: ["S"] }],
    variants: [{ sku: "TEST-S", price: "10.00", options: { Size: "S" } }],
  };
  const result = manifestInternals.validateShape(invalid);
  assert(result.errors.some((error) => error.includes("manifest.status")));
  assert(result.errors.some((error) => error.includes("manifest.publish")));
});

test("SKU search query escapes quotes and backslashes", () => {
  assert.equal(
    operationInternals.makeSkuQuery(['SKU"1', "SKU\\2"]),
    'sku:"SKU\\"1" OR sku:"SKU\\\\2"',
  );
});

test("location resolver accepts exact IDs and case-insensitive unique names", () => {
  const locations = [
    { id: "gid://shopify/Location/1", name: "Main Warehouse", isActive: true },
  ];
  const resolve = operationInternals.buildLocationResolver(locations);
  assert.equal(
    resolve({ locationId: "gid://shopify/Location/1", quantity: 0 }),
    "gid://shopify/Location/1",
  );
  assert.equal(
    resolve({ locationName: "main warehouse", quantity: 0 }),
    "gid://shopify/Location/1",
  );
});

test("client rejects any non-Zenkai domain before making a request", () => {
  assert.throws(
    () =>
      new ShopifyAdminClient({
        storeDomain: "another-store.myshopify.com",
        clientId: "example",
        clientSecret: "example",
      }),
    /Store-domain guard failed before authentication/,
  );
});
