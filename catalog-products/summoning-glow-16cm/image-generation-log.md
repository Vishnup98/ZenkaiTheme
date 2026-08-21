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
