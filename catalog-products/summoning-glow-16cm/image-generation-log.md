# Summoning Glow image-generation log

All accepted files were generated with the native image-generation tool from the product reference images in `reference-images/`. They are merchandising images, not customer photos.

## Gallery

### `gallery-01-hero.png`

Dark premium studio hero of the exact green coiled dragon display with a warm illuminated concentric base, translucent amber effects, and exactly seven large spheres. Full display visible; no text, logos, people, packaging, or invented connector.

### `gallery-02-lights-off.png`

Clean light-studio reference showing the exact display with the LEDs off, realistic PVC/acrylic materials, one dragon, one base, translucent effects, and exactly seven large spheres.

### `gallery-03-three-quarter.png`

Dark three-quarter ecommerce angle preserving the product's construction and showing the complete lit base, transparent supports, amber effects, and exactly seven large spheres.

### `gallery-04-detail.png`

Close product detail preserving the green dragon's face and scale texture, clear supports, amber effects, illuminated rings, and exactly seven large spheres.

### `gallery-05-components.png`

Clean ecommerce restaging of supplier component reference `ref-08.jpg`, preserving the assembled dragon on its internal stand, the seven small decorative stand insets, one separate wired three-ring base, exactly seven separate large spheres, two curved amber effect shells, and the yellow energy-support group. No invented rods, accessories, plugs, packaging, or text.

One earlier components attempt was rejected because it invented support pieces and presented the decorative stand insets ambiguously.

## Editorial story panels

### `story-01-shelf-centerpiece.png`

Wide 3:2 nighttime collector-shelf scene with the exact display as the dominant subject, LEDs on, one dragon, one base, and exactly seven large spheres. Background objects are generic and defocused.

### `story-02-light-detail.png`

Wide 3:2 dramatic product-detail image emphasizing the painted sculpt, translucent effects, clear supports, glowing rings, and exactly seven large spheres against a charcoal studio background.

### `story-03-desk-display.png`

Wide 3:2 modern desk/display-console lifestyle scene with the exact illuminated product fully visible, one dragon, one base, and exactly seven large spheres; no people or implied customer testimonial.

## Customer-photo restoration

The six customer photos under `customer-photos/` were supplied by the user as genuine customer/collector images. Images 1–4 are used without generative editing. Images 5–6 were restored with native image-to-image generation because of their low source resolution.

### `customer-05-rgb-desk-upscaled.png`

Conservative restoration of the supplied 270×600 RGB desk snapshot: crop only the solid black letterbox bands, preserve the exact customer setup and seven-sphere display, reduce compression/chroma noise, recover restrained light detail, and increase resolution while retaining phone-camera softness and mixed RGB lighting. Do not redesign the product, rearrange the scene, or add/remove objects. A first attempt was rejected because it changed the loose foreground cable into a tool-like object; the accepted version explicitly preserves it as a loose cable.

### `customer-06-unboxed-components-upscaled.png`

Conservative restoration of the supplied 432×960 customer unboxing photo: preserve the exact component inventory and positions, reflective package, white ring/cable, seven spheres, dragon, base, supports, bedding, and phone shadow; reduce blockiness/noise, improve restrained clarity, and increase resolution without turning it into catalog photography.

## Legacy Standify review-photo restoration

Sixteen genuine review photos were recovered from the merchant's former Standify product page and saved under `customer-photos/legacy-originals/`. Each photo was edited separately with the built-in image-generation tool, then mechanically resized to exactly 2× its source dimensions and saved under `customer-photos/legacy-upscaled/`. The accepted outputs preserve the original aspect ratios, crops, backgrounds, lighting, visible wires, product variations, and candid imperfections.

Final prompt used for each photo:

```text
Use case: precise-object-edit
Asset type: legacy customer review photo for an ecommerce review gallery
Primary request: Conservatively restore and upscale this exact customer photo by about 2× for web display. Reduce JPEG compression artifacts and mild noise, recover restrained natural clarity, and keep the photo candid.
Input images: Image 1 is the edit target.
Constraints: preserve the exact crop, aspect ratio, camera angle, product geometry, number and placement of every object, star markings, supports, wires, background, lighting direction, colors, reflections, and shadows. Do not add, remove, move, replace, relight, beautify, or redesign anything. Do not invent fine details that are not visible. No text, no watermark. The result must remain recognizably the same genuine customer photograph, only modestly cleaner and larger.
Avoid: generative reinterpretation, studio polish, background replacement, object correction, altered LEDs, extra spheres, changed dragon anatomy, oversharpening, plastic-looking textures, HDR, aggressive denoising.
```

Final size map:

- `standify-review-87093552-upscaled.png` — 750×1000
- `standify-review-87093553-upscaled.png` — 750×1000
- `standify-review-87093554-upscaled.png` — 500×1000
- `standify-review-87093555-upscaled.png` — 450×1000
- `standify-review-87093556-upscaled.png` — 450×1000
- `standify-review-87093557-upscaled.png` — 750×1000
- `standify-review-87093558-upscaled.png` — 562×1000
- `standify-review-87093559-upscaled.png` — 450×1000
- `standify-review-87093560-upscaled.png` — 750×1000
- `standify-review-87093561-upscaled.png` — 462×1000
- `standify-review-87093562-upscaled.png` — 562×1000
- `standify-review-87093563-upscaled.png` — 750×1000
- `standify-review-87093564-upscaled.png` — 750×1000
- `standify-review-87093565-upscaled.png` — 1000×750
- `standify-review-87093566-upscaled.png` — 750×1000
- `standify-review-87093567-upscaled.png` — 750×1000

## Upgraded-ridge review-photo merchandising edits

The 12 review photos currently used by the native widget were edited separately with the built-in image-generation tool so the pictured package matches the merchant's upgraded offer. Four merchant-supplied product photos were used as exact references for the added translucent amber/yellow molded parts: two tall side/rear energy-ridge clusters and the jagged crystal-ridge ring around the outer/front edge of the illuminated base.

Accepted full-resolution edits are preserved under `customer-photos/upgraded-ridge-edits/`. The legacy originals and conservative restorations remain unchanged in `customer-photos/legacy-originals/` and `customer-photos/legacy-upscaled/`.

For assembled photos, the edit request preserved the original scene, camera angle, crop, background, furniture, cables, reflections, lighting, noise, and casual customer-photo character while replacing only the product assembly. Each accepted result has one green coiled dragon, exactly seven orange star spheres, clear supports, the LED base, two tall ridge clusters, and the outer/front ridge ring. One first-pass edit for review `87093553` was rejected because it contained eight spheres; the accepted precise-object correction removes the extra rear-center sphere and retains seven.

For unboxing review `87093565`, the display was deliberately left unassembled. The edit adds the two ridge clusters and segmented outer ridge pieces as loose translucent plastic parts inside/on the existing packaging while preserving the packed layout and surrounding scene.

Theme delivery derivatives replace the existing JPEG/WebP pairs for reviews `87093553`–`87093560` and `87093563`–`87093566`. They retain the widget's prior dimensions (450–1000 px wide, 750–1000 px tall) instead of serving the larger PNG masters. WebP is encoded at quality 72 with JPEG quality 82 as fallback.

## Complete-the-set popup artwork

The original popup artwork below was built from supplier product `1005007113011680` and is superseded. The v2 artwork uses the merchant-confirmed product `1005012765836810`, the stated 23 cm height, and the four customer references in `../eternal-dragon-23cm/customer-images/`.

### Desktop popup image

- Final file: `popup-images/complete-set-desktop.png`
- Theme delivery file: `assets/summoning-glow-complete-set-desktop.jpg`
- Built-in image-generation mode: referenced product mockup
- Prompt summary: place the approximately 15–16 cm Summoning Glow dragon display beside the larger 24 cm Eternal Wish dragon-and-hero display on a dark emerald collector shelf; preserve an honest roughly 1.5× height relationship, exactly two display products, seven orange spheres on Summoning Glow, and one young hero on one yellow cloud; no text, logos, packaging, hands, or extra objects.

### Mobile popup image

- Final file: `popup-images/complete-set-mobile.png`
- Theme delivery file: `assets/summoning-glow-complete-set-mobile.jpg`
- Built-in image-generation mode: referenced product mockup
- Prompt summary: place both complete displays on the same shelf plane at the same camera distance, with the 24 cm Eternal Wish display approximately 1.5× the rigid height of the 15–16 cm Summoning Glow dragon display; preserve exactly seven orange spheres and one young hero on one yellow cloud, with no text, logos, packaging, hands, or extra objects. The original foreground-perspective draft was rejected and regenerated because it overstated Summoning Glow's apparent size.

### Corrected desktop popup image (v2)

- Final file: `popup-images/complete-set-desktop-v2.png`
- Theme delivery file: `assets/summoning-glow-complete-set-desktop-v2.jpg`
- Built-in image-generation mode: referenced product mockup
- References: Summoning Glow `generated-images/gallery-01-hero.png` plus all four merchant-supplied Eternal Wish customer photos.
- Final prompt: create a dark emerald-black premium collector-shelf photograph containing exactly two separate complete products on the same shelf plane and at the same camera distance. Place Summoning Glow on the left with one green dragon, its full illuminated amber base, and exactly seven orange star-marked spheres. Place Eternal Wish on the right as the customer-referenced 23 cm painted-PVC display: exactly one continuous green serpentine dragon with one visible head, one body arranged into three broad coils, gold underbelly, dark branching horns, white cloud effects, rock peaks, gold lightning, and one small rider on one golden cloud. Keep both bases fully visible, use an honest approximately 1.5× nominal height relationship without foreground exaggeration, and include no text, logos, watermarks, packaging, hands, people, background figures, or extra objects.
- A first v2 attempt was rejected before use because its prompt misread the three coils as three separate dragons. The accepted version was regenerated after indexed product matches and the customer references confirmed one continuous coiled dragon.

### Corrected mobile popup image (v2)

- Final file: `popup-images/complete-set-mobile-v2.png`
- Theme delivery file: `assets/summoning-glow-complete-set-mobile-v2.jpg`
- Built-in image-generation mode: referenced product mockup plus a targeted precise-object edit.
- References: Summoning Glow `generated-images/gallery-01-hero.png`, the merchant-supplied Eternal Wish customer photos, and the immediately preceding mobile draft as the edit target.
- Final prompt: preserve the two-product portrait composition, same shelf plane, corrected 23 cm Eternal Wish sculpt, one continuous dragon head/body, three broad coils, cloud-and-rock base, one rider, and believable painted-PVC texture. Keep Eternal Wish at approximately 1.45× the visual height of Summoning Glow. Change only Summoning Glow's sphere count by adding one separate matching orange star-marked sphere to the six-sphere draft, for exactly seven visible spheres total; keep every existing sphere and the right display unchanged. No text, logo, watermark, packaging, hands, people, or extra objects.
- Two prior mobile drafts were rejected because they showed only six visible spheres. The accepted precise-object edit shows seven.
