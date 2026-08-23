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

## 07 — Lights-off test

References:

- `catalog-products/summoning-glow-essential/generated-images/gallery-02-lights-off-v2.jpg`
- `catalog-products/summoning-glow-essential/generated-images/gallery-01-hero-v2.jpg`

Prompt direction: Create a same-camera daylight-versus-dark split that makes the product itself the proof. Keep the exact no-ridge product centered across both halves, with all seven spheres visible and the right half illuminated by the RGB base. Render exactly:

- `PASSES THE LIGHTS-OFF TEST.`
- `COLLECTIBLE BY DAY · RGB AFTER DARK`
- `$99.99`

The final v2 4:5 master preserves the complete one-through-seven sphere progression, uses the split at the center of the product rather than a generic before/after collage, and intensifies the dark-half LED ring, sphere transmission, and colored environmental spill without changing the daylight half. Native 9:16 and 1:1 versions preserve the same centered split and were recomposed separately rather than cropped.

## 08 — Customer camera roll

References:

- `catalog-products/summoning-glow-essential/customer-photos/essential-customer-01-rgb-display.jpg`
- `catalog-products/summoning-glow-essential/customer-photos/essential-customer-03-daylight-remote.jpg`
- `catalog-products/summoning-glow-essential/customer-photos/essential-customer-05-collector-shelf.jpg`
- `catalog-products/summoning-glow-essential/customer-photos/essential-customer-06-blue-red-setup.jpg`

Prompt direction: Preserve all four authentic customer phone photos, including their real rooms, imperfect lighting, original crops, visible accessories, and naturally obscured product parts. Use AI only to create a tactile camera-roll/contact-sheet layout and the typography. Do not invent social handles, engagement counts, dates, comments, or interface chrome. Render exactly:

- `SEEN IN THE WILD`
- `REAL SHELVES. REAL CUSTOMER PHOTOS.`
- `$99.99`

The 9:16 version retains all four photos in a readable two-by-two contact sheet and leaves a clean lower interface-safe zone. The 1:1 version uses a compact two-by-two grid with the same authentic source-photo content.

## 09 — Gallery exhibit

Reference: `catalog-products/summoning-glow-essential/generated-images/gallery-01-hero-v2.jpg`

Prompt direction: Present the exact Essential display at real tabletop scale on a restrained dark gallery plinth. Use a warm architectural spotlight without claiming licensing, rarity, an artist, or “museum quality.” Keep all seven spheres visible. Render exactly:

- `DISPLAY IT LIKE THE CENTERPIECE IT IS.`
- `$99.99`

The initial pass included a factual museum-style placard. The final v2 removes the placard and its stand, reconstructing that corner as a seamless continuation of the matte-black plinth while preserving the product, headline, and price. Native 9:16 and 1:1 versions retain the placard-free gallery treatment; the Story version places the price above a clean lower interface-safe zone.

## Output handling

- PNG generation masters are retained in `feed-4x5`, `story-9x16`, and `square-1x1`.
- Upload-ready JPGs are in `optimized`, resized to 1080×1350, 1080×1920, or 1080×1080 and compressed at quality 88.
- The three landing-page hero copies are optimized JPGs in `assets/` and are loaded only when their matching `lp` variant is active.
- The approved wave-two concepts have native 4:5, 9:16, and 1:1 PNG masters plus upload-ready 1080×1350, 1080×1920, and 1080×1080 JPGs.
