# Zenkai direct Shopify catalog API

This is a direct Shopify Admin GraphQL API workflow for Zenkai Clothing. It does not use, modify, or route product work through an MCP server.

It can verify the authenticated Zenkai app, preflight a product manifest, create a draft product with variants/SKUs/inventory/images, and separately publish a reviewed product to Online Store.

## Authentication

The CLI uses Shopify's client-credentials exchange. Export these variables in the shell that runs the command:

```bash
export SHOPIFY_STORE_DOMAIN='your-zenkai-store.myshopify.com'
export SHOPIFY_CLIENT_ID='...'
export SHOPIFY_CLIENT_SECRET='...'
export SHOPIFY_API_VERSION='2026-01' # optional; this is the default
```

Credentials stay in environment variables. Do not put them in a manifest, this repository, or command arguments.

Every API command checks all of the following before continuing:

- Shop name is exactly `Zenkai Clothing`.
- Store domain is exactly the verified Zenkai domain `n1t6es-qx.myshopify.com`, checked before token exchange.
- Authenticated app handle is exactly `analyticsmcpapp`.
- The app has `write_products`, `write_files`, `write_inventory`, `write_publications`, and `read_locations`.

## Commands

Run from the ZenkaiTheme repository root.

```bash
# Read-only identity, scope, location, and publication verification
node tools/zenkai-catalog-api/cli.mjs verify

# Read-only manifest/template/handle/SKU/image/inventory preflight
node tools/zenkai-catalog-api/cli.mjs preflight \
  --manifest tools/zenkai-catalog-api/example.manifest.json

# Still read-only: apply without --confirm returns the proposed plan
node tools/zenkai-catalog-api/cli.mjs apply \
  --manifest path/to/product.manifest.json

# Creates the product, variants, SKUs, inventory, and images as a DRAFT
node tools/zenkai-catalog-api/cli.mjs apply \
  --manifest path/to/product.manifest.json \
  --confirm

# Read-only readiness check; does not activate or publish
node tools/zenkai-catalog-api/cli.mjs publish \
  --product-id gid://shopify/Product/123456789

# After review, activates the product and publishes only to Online Store
node tools/zenkai-catalog-api/cli.mjs publish \
  --product-id gid://shopify/Product/123456789 \
  --confirm
```

## Manifest rules

Start by copying `example.manifest.json`. The adjacent JSON Schema provides editor validation, while the CLI performs stricter cross-field and live Shopify checks.

- The manifest and all local image files must stay inside this ZenkaiTheme repository.
- `templateSuffix: "gympin"` requires `templates/product.gympin.json`; omitting the suffix requires `templates/product.json`.
- Handles and SKUs must be unique both within the manifest and in the live store.
- Every variant must supply every declared option exactly once.
- Money values are strings such as `"39.00"`.
- Inventory can target one active location by `locationId` or exact `locationName`. `verify` prints the accessible locations.
- Remote images must use HTTPS. Local GIF, HEIC, JPEG, PNG, and WebP files are allowed up to 20 MB.
- One image can be associated with one or more variants through `variantSkus`.

Example image block:

```json
"images": [
  {
    "source": "../../catalog-images/example-front.png",
    "alt": "Front of the black Zenkai graphic tee",
    "variantSkus": ["ZK-EXAMPLE-BLK-S", "ZK-EXAMPLE-BLK-M"]
  },
  {
    "source": "https://cdn.example.com/example-back.jpg",
    "alt": "Back of the black Zenkai graphic tee"
  }
]
```

Paths are resolved relative to the manifest file, then checked against the repository boundary.

## Safety and recovery

- `verify` and `preflight` are read-only.
- `apply` needs literal `--confirm`; even then it always creates `DRAFT` and never publishes.
- `publish` is a separate command with its own `--confirm` and targets only the publication named `Online Store`.
- Publication readiness requires valid SKUs and prices, at least one READY image, and a matching local theme template.
- The CLI never deletes or rolls back a product. If a later image or variant step fails, the error includes the partial draft product ID so it can be inspected safely before retrying.
- A second apply of the same manifest is blocked by the existing handle/SKU preflight, which helps prevent accidental duplicates.

## Local checks

```bash
node --test tools/zenkai-catalog-api/test.mjs
node --check tools/zenkai-catalog-api/*.mjs
```
