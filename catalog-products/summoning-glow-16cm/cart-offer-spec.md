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
- Regular price: `$99.99`
- Complete Collection automatic discount: `$50.00` off when Summoning Glow and Eternal Wish are in the same cart
- Qualified price: `$49.99`
- Compare-at price: none; `$99.99` is the product's actual regular price
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
- Its exact variant remains available at its regular `$99.99` price with SKU `ZK-FIG-EW23-CD`.
- Shopify applies the `$50.00` Complete Collection discount only when the qualifying Summoning Glow variant is in the cart.
- It has no compare-at price; the `$50.00` reduction is entirely controlled by the guarded automatic discount.
- Direct product discovery is disabled to the extent supported by Shopify's unlisted status.
- Accept, decline, close, and Escape flows work on desktop and mobile.
- The native offer does not double-open Candy Rack or UpCart.
- Accepting the offer adds Eternal Wish and routes directly to checkout.
- Declining the offer refreshes the cart lines, cart count, and subtotal normally.
- Most orders arrive at the customer's door within one business week.
