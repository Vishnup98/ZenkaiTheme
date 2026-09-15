# Legendary Skies image system

## Product-page preview

The preview is generated from the current Liquid layout, section, and snippets,
using the product's recorded Shopify price. It is not a separately maintained mockup.
Install `liquidjs` in a temporary location, then run:

```sh
npm install --prefix /private/tmp/legendary-skies-render --cache /private/tmp/legendary-skies-npm-cache liquidjs
LIQUIDJS_PATH=/private/tmp/legendary-skies-render/node_modules/liquidjs node product-build/legendary-skies/render-preview.mjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `/product-build/legendary-skies/page-preview.html` on that server. Preview
submissions are suppressed; the live native Shopify form must be verified separately.

The template always renders Add to cart and uses Shopify's product price. Price,
inventory, and availability are managed in Shopify Admin.

This directory contains the source references, Gemini generation manifests, review sheets, and promotion script for the Legendary Skies three-plush product page.

## Production model

The image pipeline runs through `/Users/vishnup/Projects/Zenkai_Content_Engine` with `NANO_BANANA_MODEL=gemini-3-pro-image`. The content engine defaults to the same model in code, so an omitted environment override does not silently fall back to an older preview model.

The four source images in `reference-images/` are the product-identity authority. Generated scenes may change staging, lighting, and camera composition, while the manufactured designs, colors, embroidery, silhouettes, wings, feet, seams, and relative scale must stay faithful to those sources.

## Final storefront assets

| Theme asset | Approved Gemini job | Purpose |
| --- | --- | --- |
| `assets/legendary-skies-trio-hero.webp` | `hero-v2` | Main collection hero |
| `assets/legendary-skies-trio-lineup.webp` | `lineup-v3` | Clean three-product catalog lineup |
| `assets/legendary-skies-trio-lifestyle.webp` | `lifestyle-v2` | Warm home display context |
| `assets/legendary-skies-trio-story.webp` | `story-v2` | Editorial storm, frost, and flame scene |
| `assets/legendary-skies-trio-details.webp` | `details` | Three-panel construction close-up |
| `assets/legendary-skies-trio-scale.webp` | `scale-v3` | Familiar book-and-lamp scale context |
| `assets/legendary-skies-yellow-portrait.webp` | `yellow-portrait` | Yellow product portrait |
| `assets/legendary-skies-blue-portrait.webp` | `blue-portrait-v2` | Blue product portrait |
| `assets/legendary-skies-orange-portrait.webp` | `orange-portrait` | Orange product portrait |

`gemini/promoted-assets.json` records the exact raw source, dimensions, byte size, and SHA-256 digest for every promoted WebP. `gemini/review-final.jpg` is the final nine-image contact sheet.

## Reproduce or iterate

Generate the initial set:

```sh
cd /Users/vishnup/Projects/Zenkai_Content_Engine
npx tsx server/scripts/generate-legendary-skies.ts
```

Run the approved polish jobs or target specific jobs by ID:

```sh
npx tsx server/scripts/polish-legendary-skies.ts lineup-v3 scale-v3 blue-portrait-v2 story-v2
```

Promote the latest approved output from each selected job:

```sh
cd /Users/vishnup/Downloads/ZenkaiTheme
python3 product-build/legendary-skies/promote-gemini-assets.py
```

Every generation writes a timestamped raw image and JSON manifest under `gemini/raw/`. Retain the raw outputs so a later polish pass can use the strongest prior composition as its master instead of regenerating the scene from scratch.

## Final visual audit

The approved set was inspected at original resolution and in the storefront preview. It contains exactly three plushes in group scenes and exactly one plush in each portrait; no visible product tags, hang strings, source measurements, text, watermarks, or invented accessories remain. The scale image uses a closed book and lamp as familiar context. All storefront images decode successfully at their expected intrinsic dimensions.

Buyer photographs and customer quotations remain a separate future input. The product page hides those modules until real material is supplied.
