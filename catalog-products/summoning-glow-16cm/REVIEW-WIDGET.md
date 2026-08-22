# Summoning Glow native review widget

The 18 reviews and 16 matching customer photos are rendered directly by a product-specific Shopify theme section. There is no Judge.me import, review-app dependency, or Shopify Files upload step.

## Theme files

- `sections/summoning-glow-reviews.liquid` contains the review data and section markup.
- `snippets/summoning-glow-review-card.liquid` renders each review card.
- `assets/summoning-glow-reviews.css` provides the responsive card, filters, and lightbox styling.
- `assets/summoning-glow-reviews.js` provides photo filtering, progressive reveal, and the accessible photo lightbox.
- `assets/summoning-glow-review-87093552.jpg` through `assets/summoning-glow-review-87093567.jpg` are compact theme-ready derivatives of the accepted 2× restorations.

The source display names, dates, five-star ratings, experiences, criticism, and exact review-to-photo relationships are retained. The merchant states that the reviewers authorized editorial rewriting. The public widget does not add a migration label or claim that these are verified purchases.

Photo reviews appear first in the widget so the initial six-card view is visually useful. The two text-only reviews remain included in the full 18-review set.

## Template hook

`templates/product.summoning-glow.json` reuses its existing `reviews` section key and order position for the native `summoning-glow-reviews` section. The disabled app block that previously occupied that slot is no longer part of this product template.

## Source and image provenance

- `legacy-reviews.json` preserves the source text and accepted editorial text.
- `customer-photos/legacy-originals/` preserves the downloaded source files.
- `customer-photos/legacy-upscaled/` preserves the accepted, conservatively restored 2× PNG files.
- `customer-photos/legacy-review-before-after.jpg` is the visual QA contact sheet.
