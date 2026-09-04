# Evolution Companions: customer-facing copy direction

Updated 2026-09-04 following merchant review. This is an internal working guide, not landing-page copy.

## The benchmark from the badge pages

“Does this make the customer picture owning the collection more vividly, or is it merely talking about the product?”

The best badge-page example was “The details are what turn a room into your room.” Apply the ownership principle, not the same room-decor rationale to every product or buyer. The complete eight-plush collection is primary. Shelves, beds, desks and gifting are ways to enjoy it.

## Rules for every journey

1. Continue the thought that earned the ad click. Keep six distinct openings: wanting all eight, the good shelf, little faces, giving every favorite, gaming company, and the clear full-set offer.
2. Use physical actions the buyer can picture: pick one up, put a favorite beside the monitor, rearrange two colors, unwrap all eight. Avoid generic transformation promises.
3. Sound like a collector, not a campaign brief. No “away from the ad,” “the figure explains the set price,” “supplied customer evidence,” or explanations of the page-building process in sales paragraphs.
4. Keep useful facts. Eight separate plushes, the $160 total, approximate 8 × 7 × 6-inch size and typical U.S. delivery of 5–7 business days remain easy to find. Factual answers need not be turned into emotional prose.
5. Let photographs show texture and scale. Customer-photo captions are short and specific. Preserve the actual photographs. Do not label generated campaign artwork as a customer photograph.
6. Preserve review attribution without making it a sales paragraph. The quoted reviews refer to individual designs and were shared by the product supplier. Keep the source note immediately above the quotes so their scope is clear before reading. Store-wide ratings remain labeled as store-wide.
7. Full-set certainty should feel good, not like a warning. Use the eight-color bar and “Every color shown is included.” Swatches are informational, not selection controls. No single-design buying path.
8. Keep playful details functional: a count stamp, the actual eight colors, readable captions, warm conversational headings. Do not add decoration that conceals the products or large panels that delay checkout.
9. No false urgency, guilt, invented objections, invented testimonials, gender assumptions, official-license claims or unconfirmed packaging promises.
10. Keep the mobile CTA within the tested first viewport where possible, with the existing sticky fallback. Preserve the approved art and strong mint purchase buttons.
11. Sell the experience, not the construction. No supplier-spec lists such as “soft textile exterior,” “PP cotton filling,” or “embroidered facial details” in the buying journey. Softness can be expressed as picking one up and keeping it close; the photos can show the workmanship. Keep practical dimensions in a compact note and care/safety answers in the FAQ.
12. Practical reassurance must not replace an emotional story beat. Shelf measurement and delivery planning belong beside the relevant facts, not in the main three ownership points. The gift journey should picture the recipient enjoying the set, not switch to the buyer's own pillow or desk.
13. Write toward felt ownership: the buyer is arranging their eight, reaching for their favorite, and making the collection part of an ordinary day. Concrete actions should make them want the set; repeating “yours” without a scene does not do the work. Replace tentative closing language such as “can be yours” with a clear next step. Self-collector buttons say “Make All 8 Mine”; the gifting route says “Give Them All 8.” The visible total price, eight-plush quantity, review scope and delivery terms remain unchanged. No claim that an order has already been placed or reserved, and no invented deadline or scarcity.

## Examples applied

- Before: “Here’s the full lineup, away from the ad.”
- After: “Which one are you picking up first?”
- Supporting copy: “Take a closer look at the little brown paws, stitched smiles and colorful hoods. Every one is part of your set.”

- Before: “Browse the supplied customer photos below for the real pile, seams and costume details.”
- After: “Pick one up by its plush body and settle it beside you. The colorful hood is soft, too.”

- Before: “The $20-per-plush figure explains the set price. There is no individual-plush option on this page.”
- After: “That works out to $20 per plush, with the whole collection in one order.”

## Original-page details reused

- The eight-color included bar, adapted to the narrower paid-traffic layout.
- A compact “8 / all yours” stamp beside the full-lineup section, not over the toys.
- The descriptive eight-design list has been removed at the merchant's request; the compact color bar near the offer remains.
- “Picking one was never really the plan.” for the complete-set journey.
- “The kind of cute that turns into ‘one more.’” for the existing customer quotes.

## Source of truth and release scope

Journey copy lives in `campaign-2026-09-04.json`; shared customer copy lives in `sections/evolution-campaign.liquid`. The build generates six alternate templates and local review pages. This pass does not alter the original product template, existing ads, live theme, budgets or ad status.

The in-hand photo section now has its own `sizeTitle` and `sizeBody` for each journey. It leads with the next ownership moment, followed by one concise size note. The large measurement/materials block is removed. The six approved ad headlines, artwork, page hero offers, true reviews, delivery estimates and total price are preserved.

## UI/UX and CRO review — 2026-09-04

- Borrow the badge pages' recognizable logo/cart and compact support footer, not their product-specific shipping claims or testimonial labels.
- Self-collector journeys use one strong story paragraph instead of repeating it in three more points. The offer-led Everything Included control skips that story section. Whole Gift keeps its recipient-focused points and recipient language through the shared sections.
- Keep all seven individual-photo captions simply “Customer photo.” Accessible image descriptions can remain specific.
- The real all-eight lineup can be enlarged and zoomed to 2× with native scrolling. The five-photo gallery has arrows, a position counter, and keyboard navigation.
- Ratings and order counts are readable, labeled as store-wide, and repeated at the final offer. No new reviews, verification badges, or shipping promises are introduced.
- Sticky purchase UI disappears only when an actionable inline control is fully visible. Empty payment containers and tiny intersections do not count. Mobile visual-viewport zoom/pan is included in the bounds calculation.
- Independent visual, purchase-flow and copy reviews approve this pass for testing. Conversion lift is not established by a design review or local browser tests. Live Shopify payments and app behavior require separate checks.
