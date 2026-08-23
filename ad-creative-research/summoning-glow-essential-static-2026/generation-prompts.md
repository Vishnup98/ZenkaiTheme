# Image generation record

Generator: built-in OpenAI image generation, image-to-image mode.

Shared invariants supplied on the generation passes:

> Preserve the exact clean no-ridge RGB collector display: one coiled green dragon, slim circular illuminated base, three clear supports, exactly seven translucent orange spheres, and a physical remote. Absolutely no tall energy ridges and no outer crystal ring. Keep the product realistic and fully inside the frame. Use condensed bold all-caps advertising typography in warm ivory with an amber accent. Render only the supplied strings, exactly. No logos, watermarks, extra words, or fabricated review text.

## 01 — Transformation

Reference: `catalog-products/summoning-glow-essential/generated-images/story-03-desk-display-v2.jpg`

Prompt direction: Create a dark collector-room shelf transformation image with the product already glowing as the first-frame result. Use deep charcoal, black, dark walnut, and restrained teal. Keep the full product and all seven spheres visible. Render exactly:

- `YOUR SHELF AFTER ONE SWITCH.`
- `RGB COLLECTOR DISPLAY`
- `$99.99`

Generate separate 4:5, 9:16, and 1:1 compositions rather than blind crops.

## 02 — Complete set

Reference: `catalog-products/summoning-glow-essential/generated-images/gallery-05-components-v3.jpg`

Prompt direction: Create a clear premium component-flat-lay proof ad. Show one dragon assembly, the slim circular wired base, the physical remote and cable, three clear supports, and exactly seven separate spheres visibly carrying one through seven stars. Render exactly:

- `ALL SEVEN. ONE REMOTE.`
- `COMPLETE RGB DISPLAY`
- `$99.99`

Generate separate 4:5, 9:16, and 1:1 compositions.

## 03 — Daylight detail

Reference: `catalog-products/summoning-glow-essential/generated-images/gallery-02-lights-off-v2.jpg`

Prompt direction: Place the complete product in a bright, tasteful daylight collector-shelf environment. Emphasize the painted sculpt and translucent spheres before the RGB lighting becomes the story. Keep the remote visible. Render exactly:

- `IT LOOKS THIS GOOD BEFORE YOU TURN IT ON.`
- `COLLECTIBLE BY DAY · RGB AFTER DARK`
- `$99.99`

The final 4:5 pass explicitly outpainted the collector-room environment left and right so the headline, product, all seven spheres, remote, and price remained intact.

## 04 — Shelf centerpiece

Reference: `catalog-products/summoning-glow-essential/generated-images/story-01-shelf-centerpiece-v2.jpg`

Prompt direction: Create a premium dark-walnut collector shelf scene with the illuminated display as the unmistakable focal point. Keep the shelf context useful for scale and maintain an open composition. Render exactly:

- `THE CENTERPIECE YOUR SHELF WAS MISSING.`
- `CLEAN RGB DISPLAY`
- `$99.99`

## 05 — Pablo review

Reference: `catalog-products/summoning-glow-essential/review-upscales/standify-review-87093556-upscaled.png`

Prompt direction: Preserve the authentic customer setup, its practical indoor lighting, and all visible object relationships. Use AI only to restore, recompose, and add restrained review typography. Do not invent hidden product parts. Render exactly:

- `THE LIGHTS REALLY ELEVATE THE PRODUCT.`
- `MY HUSBAND LOVES IT!`
- `— PABLO, VERIFIED CUSTOMER`

Generate separate 4:5, 9:16, and 1:1 compositions.

## 06 — Gift

Reference: `catalog-products/summoning-glow-essential/generated-images/gallery-01-hero-v2.jpg`

Prompt direction: Create a restrained giftable collector scene with the complete illuminated display and one simple black gift box with an amber ribbon. Avoid holiday-specific decoration so the asset can run year-round. Render exactly:

- `FOR THE COLLECTOR WHO HAS EVERYTHING.`
- `A GIFT THEY’LL DISPLAY`
- `$99.99`

## Output handling

- PNG generation masters are retained in `feed-4x5`, `story-9x16`, and `square-1x1`.
- Upload-ready JPGs are in `optimized`, resized to 1080×1350, 1080×1920, or 1080×1080 and compressed at quality 88.
- The three landing-page hero copies are optimized JPGs in `assets/` and are loaded only when their matching `lp` variant is active.
