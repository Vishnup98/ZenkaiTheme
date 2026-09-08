# Plush product-page design review — September 8, 2026

The design pass is published and verified across all 17 related plush routes: the original Evolution Companions page, six campaign views, nine creative views, and Little Impostors.

## Result

- Product galleries use compact native horizontal scrolling, neighboring-photo previews and fixed photo heights. The thumbnail strips and separate navigation rows are removed. Desktop navigation and keyboard access remain available; the creative views retain compact overlay tap controls.
- Mobile product cards are roughly 215–280px tall, depending on viewport and family. Images preserve their complete frames. Customer photos can be enlarged, and the original page has a native photo dialog with focus restoration.
- The offer appears earlier, with clear total/set pricing, mint purchase buttons and readable delivery information. All 17 first purchase buttons fit within the tested 390 × 844 opening viewport: the standalone pages end at approximately 598–671px, and the original page at 756px.
- Headings, body sizes, weights, section spacing and color roles were reviewed throughout. The creative families retain their deliberate serif/sans-serif choices and distinct story hooks.
- Repeated offer explanations, decorative count stamps, construction-spec paragraphs and excess photo captions were removed. The six campaign pages show three review highlights, with the remaining three behind a native disclosure. Full text remains available for shortened review excerpts.
- Customer-facing sourcing language and character names are absent from rendered product copy. Evolution's catalog description and search description were updated too. Reviews retain their accurate individual-design scope.
- Little Impostors keeps the supplied customer photos, three genuine testimonials and the uncropped 8-inch size guide. It remains the $135 nine-plush set with the merchant's “Arrives in 7-10 business days” wording. Evolution remains the $160 eight-plush set with its confirmed free U.S. shipping and 5–7-business-day estimate.

## Route coverage

| Family | Routes |
| --- | --- |
| Original | `evolution-companions-complete-8-plush-collector-set` |
| Campaign views | `evo-all-eight`, `evo-good-shelf`, `evo-little-faces`, `evo-whole-gift`, `evo-desk-company`, `evo-everything-included` |
| Creative views | `evo-all-mine`, `evo-bouquet`, `evo-distracted`, `evo-escalated`, `evo-everyone`, `evo-not-on-my-list`, `evo-outvoted`, `evo-to-me`, `evo-whole-team` |
| Little Impostors | `little-impostors-complete-9-plush-collector-set` |

The Evolution view parameters apply to the original Evolution product URL. The original and Little Impostors routes use their assigned product templates.

## Verification

- 68 current local page/viewport combinations passed: all 17 routes at 320, 390, 768 and 1440px.
- 34 live checks passed: all 17 routes at 390 × 844 and 1440 × 844, including HTTP status, document width, image loading, native product-form identity/quantity, delivery wording and stable gallery height.
- Every route was visually reviewed at mobile and desktop sizes. The nine creative routes also received independent review of all 36 live full-page/top captures. The campaign review-spacing defect found during review was fixed and its disclosures tested separately.
- Keyboard rail navigation, native horizontal scrolling, lightbox opening/zoom/closing, focus restoration, FAQs and review disclosures were checked. Original product image dimensions were corrected after Theme Check identified the missing attributes.
- All 24 relevant deployed files match local checksums on Shopify's MAIN theme.
- Theme Check reports zero errors in the changed theme files. The existing logo URLs produce three RemoteAsset warnings across the standalone layouts; they already point to Shopify-hosted storefront CDN paths.
- Native set variants, quantities, checkout destinations and commercial state were preserved. This design pass did not place an order or run a paid conversion experiment.

Evidence is retained under `output/plush-design-review/`: `completion-audit.json`, `qa/report.json`, `live/all-routes-report.json`, `all-deployment-readback.json`, `theme-check-final.json`, the focused interaction reports and the page screenshots. The current-template renderer and audit runners are in `tools/evolution-campaign/design-review-build.mjs`, `design-review-qa.mjs` and `design-live-audit.mjs`.

The browser verification uses Chromium and the in-app browser. This is not a physical-device or cross-browser certification, and it does not establish conversion lift.

Published implementation commits: `8f62dc1`, `3f5200c`, `37ffdaa`, `0077f6a`, and `ac0e709`.

## Ongoing copy and build rules

Use the current templates as the source of truth. Keep the two edited six-view size fields synchronized with `campaign-2026-09-04.json`. The older September 4 audit is historical: its thumbnail, variable-ratio gallery and three-story-point assertions do not describe the current design.

Speak directly from Zenkai in customer copy. Keep useful set, size, care and delivery facts; retain truthful individual-design review scope without upstream sourcing commentary or character names. Internal ordering records remain operational records.
