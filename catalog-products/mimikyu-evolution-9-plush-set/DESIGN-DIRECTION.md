# Little Impostors design direction

The September 8, 2026 redesign replaces the previous plain cream/Arial treatment with the user's requested personality: **clean, cute, slightly mischievous**. This direction applies to the complete Little Impostors product page, including its header, hero, browsing controls, stories, customer content, FAQ, purchase controls, lightbox, and footer. It does not change the separate Evolution collection pages' visual design.

## Visual decisions

- Bricolage Grotesque for expressive display type; DM Sans for clear body copy and controls. Latin variable WOFF2 files are served by the theme, with their SIL OFL licenses in `font-licenses/`.
- Warm ivory, deep plum, lilac, restrained pink accents, and mint purchase buttons. No gradient or animation is needed to establish the personality.
- Hero: “Little faces. Big mischief.” A larger framed collection photo, a small nine-piece sticker, a pink underline, store-wide proof, explicit set price, and a clear purchase action.
- The two hero policy items (“Secure checkout with Shopify” and “Delivery & returns”) are removed. Policy access remains in the footer and FAQ.
- A lilac collection tray carries native horizontal scrolling and a compact row of ten thumbnails. The selected thumbnail follows browsing and stays in view after resizing. No visible image captions or color labels.
- The shelf scene, paired size/detail cards, genuine customer-photo strip, quotation cards, native FAQs, and dark closing invitation give successive scrolls distinct compositions.
- Controls use rounded shapes, clear focus rings, touch targets of at least 44px, restrained hover/pressed feedback, and reduced-motion support. Customer photos retain their original proportions.

## Commerce and content invariants

- Nine separate plushes, one of every design; $135 per set, $15 per plush.
- Native Shopify product form, variant `48008090976361`, quantity one, checkout destination `/checkout`. Main, final, and sticky purchase buttons all belong to the same form.
- Free U.S. shipping; “Arrives in 7-10 business days.” Approximately 8 inches (20 cm) tall.
- The rating and order count are store-wide Zenkai proof, not an invented rating for this product.
- Preserve the five user-provided customer photos and three supplied testimonial excerpts. No fabricated customer identities or verification claims.
- No character names or sourcing language in customer-facing copy. Internal asset identifiers may retain existing names.

## Verification

The design QA script is `tools/evolution-campaign/little-impostors-design-qa.mjs`. It renders 320×740, 375×667, 390×844, 430×932, 768×1024, 1024×768, and 1440×1000; verifies image/font loading, content, page width, purchase availability, all FAQ disclosures, photo zoom, thumbnails, sticky control stability, touch/resize behavior, native form ownership, and no-JavaScript fallback. Set `ZENKAI_LIVE=1` for the published page. Reports and section screenshots are in `output/little-impostors-personality/`.

The existing plush regression and thumbnail navigation scripts remain applicable. The shared sticky-control fix excludes its own button when checking whether an inline purchase action is visible and immediately hides the bar when the lightbox opens.
