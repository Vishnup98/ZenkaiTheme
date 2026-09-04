# Evolution Companions — UI/UX and CRO review

Reviewed 2026-09-04. Scope: six `view=evo-*` alternate product pages. This is an implementation and testing record, not a claim of conversion lift.

## Verdict

The approved artwork and full-set offer were a strong base, but the first version was not finished. Three independent reviews covered mobile/desktop visual design, purchase-flow usability, and journey-specific copy. The revised interface is presentable for controlled launch testing. Performance, actual payment completion and purchase economics remain separate gates.

## Changes made

- Reused the badge pages' recognizable logo/cart treatment in a 56px header. No category menu, bundle marquee, or distracting catalog links. No badge-specific free-shipping claim copied.
- Compact support footer with delivery/returns, contact and privacy links. Link targets are at least 44px tall; support information is not hidden for the sake of conversion.
- Increased trust and qualifier legibility, added a policy link near the first offer, and repeated explicitly store-wide proof at the final purchase block. Kept the bold mint CTA, open layout and approved artwork.
- Made the real all-eight lineup enlargeable. Added a 2× zoom toggle with native pan/scroll and fit-photo reset for inspection on narrow screens.
- Added gallery arrows, position indicator, end states, keyboard arrows and Home/End. Native swipe remains available.
- Sticky purchase UI hides only when a usable inline purchase control is fully visible. Tested partial visibility, empty payment wrappers, dynamically inserted controls, modal opening/closing, and simulated mobile visual-viewport zoom/pan bounds.
- Removed repetitive three-point sections from self-collector routes. The literal Everything Included control omits the story section; the gift route retains its recipient-focused points and maintains recipient language through the close.
- Preserved genuine review quotes and put their individual-design/supplier provenance before the quotes. The 4.8/5, 95 Shop ratings and 2,800+ shipped orders remain store-wide, not plush-specific.
- Kept individual-photo captions simply “Customer photo.” The removed color-name lists were not reintroduced.

## Verification

- All six live baseline pages rendered at 390px and 1440px: HTTP 200, correct full-set variant, no broken product images, no horizontal overflow or page exceptions in the captured sessions.
- Revised local Liquid previews: 24 page/viewport checks at 320, 390, 768 and 1440px, no failures. Separate focused regression checks cover the new payment-wrapper and visual-viewport cases.
- At 390×844 the first CTA spans approximately y=747–800 on all six routes. At 320×740 it extends below the fold, and the sticky control is visible instead. The full hero is preserved.
- Native product form and all associated buttons target variant `47968551764073`, quantity one, with return to checkout. Local submissions are intercepted. No live cart or payment was submitted by this review.
- Main CTA text/background contrast is about 8.46:1; base body text about 8.28:1; the store-wide qualifier about 5.74:1. These are selected token checks, not a complete accessibility certification. Guidance: [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The chosen 44px support targets exceed the general 24px WCAG 2.2 minimum.
- Theme Check: no errors in the changed campaign files. One warning on the explicitly Shopify-CDN-hosted brand image; existing unrelated theme errors remain outside scope.
- Firefox automation was attempted, but the installed browser/runtime protocol versions were incompatible before a page could open. The completed automated viewport and interaction tests use Chromium; no Firefox or physical-device pass is claimed.

## Remaining launch checks

1. Verify a real checkout/payment and consent-aware attribution flow before spending. Seeing Shop Pay render is not proof of a completed payment.
2. App overhead follow-up: a page-scoped exclusion now prevents UpCart initialization and SmartSize's main module on the six alternate views, removing the ~211KB logo, ~176KB SmartSize module and secondary UpCart assets. The ~150KB UpCart entry file can still be prefetched without executing; full download removal requires an injection-time vendor exclusion. Store-wide settings and native payment/network APIs are unchanged. See [implementation, measured limitations and checks](APP-EXCLUSIONS.md).
3. Recheck current price, delivery terms, availability and store-wide proof before paid launch. Free shipping and gift wrapping are not asserted.
4. Treat ad-to-page conversion and contribution margin as experiments. Visual approval does not establish that a $160 set will convert economically.

Local evidence: `output/evolution-companions-campaign-2026-09-04/qa/` and `audit-baseline/`. These browser artifacts are not Shopify theme assets.
