process.argv.push(
  "--manifest",
  "catalog-products/manhole-sticker-pack-108/product.manifest.json",
);
await import("../pixel-sticker-pack-103/launch-unlisted-product.mjs");
