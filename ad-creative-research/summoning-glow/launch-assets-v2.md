# Summoning Glow launch assets v2

## Shared campaign settings

- Product: `Summoning Glow — LED Dragon Display`
- Price: `$99.99`
- CTA: `Shop Now`
- Format: `Single image or video`
- Catalog: off
- Dynamic/flexible creative: off
- Destination: the Summoning Glow product page with an ad-matched `lp` parameter
- Automatic image animation, music, generated text, background expansion, and catalog enhancements: off

The artwork intentionally does not contain a price. Price qualification happens in Meta's native headline/description and again in the first landing-page screen.

## Ad 1 — Light Reveal

### Placement files

- Feed 4:5: `ad-creative-research/summoning-glow/light-reveal-masters/light-reveal-feed-4x5-v1.png`
- Stories/Reels 9:16: `ad-creative-research/summoning-glow/light-reveal-masters/light-reveal-story-9x16-v1.png`
- Square 1:1: `ad-creative-research/summoning-glow/light-reveal-masters/light-reveal-square-1x1-v1.png`

### Copy

Primary text:

> Seven lights. One dragon. Watch the shelf wake up. Summoning Glow surrounds a painted coiled dragon with seven translucent spheres and a warm illuminated base. Free U.S. shipping. Most orders arrive at your door within one business week.

Headline:

> Summoning Glow — $99.99

Description:

> LED collector display · Assembly required

### Destination

```text
https://zenkaiclothing.com/products/summoning-glow-16cm-led-dragon-display?lp=reveal&utm_source=meta&utm_medium=paid_social&utm_campaign=summoning_glow_launch_20260822&utm_content=light_reveal_v1
```

### Landing-page message match

- Uses the approved black-and-gold creative above the core product section.
- Prioritizes the warm light transformation, seven translucent spheres, and honest 15–16 cm scale.
- Mobile shows a compact `$99.99` Add to Bag strip immediately beneath the creative.
- Hero Add to Bag delegates to the existing product form and Complete Collection checkout flow.

## Ad 2 — Collector Desk Upgrade

### Placement files

- Feed 4:5: `ad-creative-research/summoning-glow/collector-desk-masters/collector-desk-feed-4x5-v2.png`
- Stories/Reels 9:16: `ad-creative-research/summoning-glow/collector-desk-masters/collector-desk-story-9x16-v2.png`
- Square 1:1: `ad-creative-research/summoning-glow/collector-desk-masters/collector-desk-square-1x1-v2.png`

### Copy

Primary text:

> Your setup does not need more clutter. It needs one centerpiece. Summoning Glow brings a painted coiled dragon, seven translucent spheres, and one focused warm-amber LED base to the shelf beside your setup.

Headline:

> Built for the collector's shelf.

Description:

> Summoning Glow · $99.99 · Free U.S. shipping

### Destination

```text
https://zenkaiclothing.com/products/summoning-glow-16cm-led-dragon-display?lp=desk&utm_source=meta&utm_medium=paid_social&utm_campaign=summoning_glow_launch_20260822&utm_content=collector_desk_v1
```

### Landing-page message match

- Uses the approved desk/PC creative above the core product section.
- Prioritizes realistic tabletop scale, desk fit, and the distinction between the product's warm amber light and the room's surrounding accent lighting.
- Mobile shows a compact `$99.99` Add to Bag strip immediately beneath the creative.
- Hero Add to Bag delegates to the existing product form and Complete Collection checkout flow.

## Policy and claim guardrails

- Do not use franchise names, character names, invented licensing, fake scarcity, or fabricated reviews.
- The dragon figure is approximately `15–16 cm / 6 in`; do not call this product 23 cm.
- `Most orders arrive at your door within one business week` is a qualified statement, not a guaranteed delivery date.
- Free U.S. shipping is accurate for this offer.
- Assembly is required.
- Preference/change-of-mind returns are final sale.
- If the product arrives damaged or defective, the customer may receive a replacement or refund.
- The artwork must retain exactly seven spheres with one unique red-star count from one through seven. The Collector Desk v2 masters were manually audited at full resolution and read `1, 2, 3, 4, 5, 6, 7` from left to right around the display.

## QA completed locally

- `lp=reveal` and `lp=desk` switch only their intended campaign panels.
- The unsupported/no-`lp` route keeps the standard product page unchanged.
- Desktop two-column compositions render at 1440 px.
- Mobile single-column compositions render at 390 px, including the mobile quick-purchase strip.
- Hero Add to Bag buttons invoke the core product form rather than creating a second cart implementation.
- UTM query parameters remain in the URL.
- Browser console: no warnings or errors in the QA harness.
