# Midnight Grin brand and controls pass

## Implemented locally

- Zenkai logo, forest/mint header/footer, native responsive menu and Shopify menu data.
- Mint purchase CTAs (#63d6bf, the configured theme button color), quantity input/stepper, native form quantity payload.
- Unconditional responsive image source replacement on color selection.
- Removed “One cap in your chosen color.”
- Reduced desktop/mobile section spacing and compacted the purchase area.

## Verification

- LiquidJS preview rendered against live public product data.
- 96 unit assertions pass, including variant source candidates, quantity validation and payload, sold-out states, native submission and preview safety.
- Browser checked at 320px, 390px and 1440px: no horizontal overflow; all four color buttons update displayed image and variant ID.
- Mobile menu opens; actual logo loads. Desktop hero screenshot inspected. Full-page screenshot stitching produced artifacts; DOM confirmed one footer and one of each product section, total desktop height approximately 3007px.
- No cart writes, checkout, price, inventory or shipping-setting changes.

## Outstanding image request

Built-in image-to-image generation was attempted using the existing purple product photo. The service rejected the request at output moderation; no generated file was returned, and no restriction-evading retry was attempted. Existing product photos and the previously installed detail image remain. Full goal is not complete.

Prompt: “Use case: product-mockup. Asset type: Shopify cap product photography. Input image 1 is the exact product reference. Create a photorealistic studio product photograph of this same washed purple baseball cap on a warm off-white seamless surface. Show the full cap, including entire curved brim, in a gentle three-quarter front view. Soft natural side light and realistic contact shadow. The cap occupies about 82% of a square frame. Preserve the precise purple washed fabric, cap silhouette, seams and especially the exact embroidered red eyes, black outlines and white grin design, its proportions and placement. Do not redesign the embroidery, add teeth, logos, lettering, props or people. No text or watermark. This is a new product photo based on the supplied product, not a new product design.”

Input: output/aftersell-products-2026-09-09/images/midnight-grin-cap-purple.png

Request ID: 3f42e175-b523-4dcd-8a9f-1772ec9305dc
