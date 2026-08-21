# Summoning Glow cart-offer specification

## Trigger

- Product: `Summoning Glow — LED Dragon Display`
- Shopify product: `gid://shopify/Product/9420750880873`
- Trigger point: successful main product add-to-cart from its dedicated PDP
- Scope: this product only

## Offer

- Product: `Eternal Wish — 23cm Coiled Dragon & Rider Display`
- Shopify product: `gid://shopify/Product/9420423463017`
- Variant: `gid://shopify/ProductVariant/47934894473321`
- SKU: `ZK-FIG-EW23-CD`
- Price: `$49.99`
- Compare-at price: `$99.99`
- Offer narrative: `Complete the collectible set`
- Quantity: one
- Billing: ordinary one-time product line; no subscription

## Behavior

1. Add Summoning Glow through a clean cart request without opening competing drawers.
2. Open the Zenkai-native one-time offer modal.
3. If accepted, add Eternal Wish as its own cart line and then refresh/open the cart.
4. If declined or dismissed, refresh/open the cart without adding Eternal Wish.
5. If the upsell is unavailable, keep the modal open and show an inline error; never remove the main product.

## Launch state

Both products are intended to use Shopify's `UNLISTED` status and be published only to the Online Store channel. They remain available by direct link and cart reference without appearing in Shopify-powered search, collections, recommendations, the sitemap, or Shopify Catalog.

At launch, verify all of the following:

- Eternal Wish is hidden from search, collections, recommendations, and ordinary browsing.
- Its exact variant remains available at `$49.99` with SKU `ZK-FIG-EW23-CD`.
- Its compare-at price remains `$99.99`.
- Direct product discovery is disabled to the extent supported by Shopify's unlisted status.
- Accept, decline, close, and Escape flows work on desktop and mobile.
- The native offer does not double-open Candy Rack or UpCart.
- Cart lines, cart count, subtotal, and checkout all refresh correctly.
- Most orders arrive at the customer's door within one business week.
