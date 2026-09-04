# Plush landing-page app exclusions

Implemented 2026-09-04. Applies only to the Evolution Companions product and these alternate views:

- `evo-all-eight`
- `evo-good-shelf`
- `evo-little-faces`
- `evo-whole-gift`
- `evo-desk-company`
- `evo-everything-included`

## Behavior and scope

The dedicated layout renders `evolution-campaign-app-exclusions` before Shopify's untouched `content_for_header`. It leaves SmartSize's bootstrap placeholder in place as a non-executable data block and removes UpCart's entry script/stylesheet before initialization. SmartSize's asynchronous callback can still find its placeholder, without loading or executing its main module.

The browser observer matches only the known SmartSize placeholder, Shopify-CDN UpCart bundle/stylesheet paths, and scripts/styles in Candy Rack's Shopify-CDN extension directory. It does not overwrite `fetch`, DOM prototypes, event APIs, Shopify payments, or tracking. No global app toggles, shared theme layout, cart template, product data, campaign assets or prices were changed.

Shopify injects app embeds outside the theme's `content_for_header` markup. Stripping that variable alone would not remove these embeds. See [Shopify app embed configuration](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration). A non-JavaScript script type is a data block; its `src` is ignored by the browser. See [MDN script types](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type).

## Measured result — partial network removal, complete observed execution exclusion

Cold-cache Chromium sessions against the current storefront, with only the proposed snippet inserted into the browser's document response:

| Resource | Baseline transfer | With exclusion |
| --- | ---: | ---: |
| UpCart entry JavaScript | ~150 KB | ~150 KB, does not initialize |
| UpCart header logo | ~211 KB | Not requested |
| SmartSize main JavaScript | ~176 KB | Not requested |
| UpCart stylesheet | ~12 KB | None in staging; occasionally prefetched live |
| UpCart payment icons and cart request | ~10 KB combined | Not requested |
| SmartSize version bootstrap request | ~0.76 KB | ~0.76 KB |

This removes approximately 387 KB from the three large assets originally flagged, or roughly 400 KB including UpCart's secondary resources. It does **not** remove the entire original ~536 KB: the HTML preload scanner can download UpCart's static entry bundle and stylesheet before the observer removes them. The tiny SmartSize version request also remains. These figures are encoded network transfers in captured sessions, not a conversion-lift or production LCP claim.

Eliminating the remaining static UpCart download reliably needs a vendor-supported template exclusion at injection time. Broad CSP allowlists, changes to native networking APIs, or disabling the app store-wide were deliberately not introduced for this page-scoped request.

## Verification before publishing

- 32 Liquid scope combinations passed: the six allowed views on this product match; unrelated views/products and cart page contexts do not.
- Nine storefront browser checks passed: all six views at 390px, All Eight at 1440px, the original product route, and `/cart`.
- On the seven excluded-page sessions, UpCart did not initialize, SmartSize's main module did not load, no downstream UpCart logo/cart/payment-icon requests completed, and no page exceptions were captured.
- Native full-set form remains `POST /cart/add`, variant `47968551764073`, quantity `1`, `return_to=/checkout`. The visible, accessible “Buy with Shop” control rendered on every excluded-page session.
- The new exclusion was absent from the original product and cart routes. UpCart initialized normally there. Their other existing app rules remain unchanged.
- All six local mobile interaction regressions passed: main/final/sticky purchase buttons, attribution fields, photo zoom/pan, gallery navigation, FAQ, support links, and no overflow/broken images.
- Shopify Theme Check reported no errors in the changed layout/snippet; the existing remote-logo warning and unrelated theme diagnostics remain.
- No real cart mutation, checkout submission or payment was performed. Rendering and correct form wiring are not proof of a completed payment.

Browser evidence: `output/evolution-companions-campaign-2026-09-04/app-exclusions-staged.json` and the corresponding `qa/app-exclusion-staged-*.png` screenshots. Run `node tools/evolution-campaign/app-exclusion-qa.mjs` after deployment for the live equivalent; `--staged` is a browser-only predeployment injection. The script blocks cart-write and checkout requests.

## Published verification

Code commit `d88d46a` is served by the live Shopify theme. All six mobile views and All Eight at desktop retained the correct form and accessible Shop Pay button, with no captured page errors. Each excluded session transferred ~150.8KB of the targeted resources, except one at ~162.4KB where the UpCart stylesheet also prefetched. The baseline was ~560.4KB including secondary requests: a measured reduction of approximately 398–410KB. Neither app initialized on the excluded pages. Evidence: `app-exclusions-live.json` and `qa/app-exclusion-live-*.png` in the same output folder.

## Maintenance and rollback

### Direct checkout and Candy Rack follow-up

The main, final and sticky buttons all submit the same native Shopify product form: one full eight-plush set, variant `47968551764073`, with `return_to=/checkout`. No cart drawer or cart-page detour is intended. This preserves existing cart contents, attribution line properties, Shopify's server-side stock/error handling and the no-JavaScript purchase path. Shopify documents the native redirect parameter in its [form reference](https://shopify.dev/docs/api/liquid/tags/form#form-return_to).

The page-scoped snippet now excludes Candy Rack's entry/runtime scripts and styles before initialization, as well as the existing UpCart exclusion. It also sets `CANDYRACK_CAN_ATC` to return false on these six views: Candy Rack's [documented popup veto](https://help.digismoothie.com/en/articles/6460146-candy-rack-public-api-options-for-developers). This is a fallback, not a replacement for the native purchase form, and it is not set on the rest of the store. Native Shop Pay is unchanged. No checkout or post-purchase extensions are disabled store-wide.

The expanded regression checks main, final and sticky button clicks in each of the six mobile views plus All Eight on desktop (21 submissions). Each must generate exactly one native navigation POST with the correct variant, quantity, page attribution and checkout redirect, without Candy Rack starting or displaying a popup. These POSTs receive a test-only HTTP 204 so the test does not mutate a live cart. The original product and cart remain controls; no actual payment is submitted.

Candy Rack's small bootstrap file can still be prefetched (~4KB transferred in staging) but does not initialize; its runtime chunks do not load in these checks. This does not change the previously documented UpCart preload limitation.

This intentionally narrow integration depends on the current vendor entry names and SmartSize's placeholder bootstrap. Re-run the browser checks after app upgrades; it is not a general-purpose script firewall. The observer is identical for customers and testing tools; there is no Lighthouse/user-agent bypass.

To roll back all exclusions, remove the conditional snippet render from `layout/evolution-campaign.liquid`. The store-wide embeds retain their existing configuration throughout.
