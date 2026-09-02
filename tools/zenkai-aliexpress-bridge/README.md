# Zenkai AliExpress buyer OAuth bridge

This local-only utility authorizes Zenkai's own AliExpress Dropshipping buyer account. It uses AliExpress's server-side OAuth 2.0 authorization-code flow, but it does not require a hosted callback handler.

The registered callback remains exactly:

```text
https://zenkaiclothing.com/
```

After authorization, AliExpress redirects the browser to that Shopify storefront URL with a short-lived `code` and matching `state` in the query string. Copy the complete URL from the browser and paste it into the local CLI's hidden prompt. The CLI validates the callback and state, exchanges the code immediately, and saves the tokens in macOS Keychain.

## Security boundaries

- Never paste the App Secret, authorization code, access token, refresh token, passport, SMS code, or order/customer data into chat.
- App credentials, OAuth state, and tokens are stored as macOS Keychain generic-password items.
- Sensitive values are never accepted as shell arguments and never printed by this CLI.
- The repository stores only code and non-secret expiry metadata is printed at runtime.
- The business client supports documented reads and writes. Reads run directly; mutations require a dedicated validated workflow and explicit confirmation.
- The App Key is a public OAuth client identifier, but the CLI still keeps it alongside the other app configuration in Keychain.

## One-time setup

From the ZenkaiTheme repository root:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs setup
```

Enter the App Key shown under **App Overview → Advanced Information**, then click **View** beside App Secret in AliExpress and paste it only into the hidden terminal prompt. Do not put either value into a source file or `.env` file.

Confirm the local state without revealing any values:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs status
```

## Authorize the buyer account

Generate a fresh OAuth state and open the official AliExpress authorization page:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs authorize --open
```

Sign in with the AliExpress buyer account that will place the dropshipping purchases and approve the requested permissions. AliExpress will send the browser back to a URL shaped like:

```text
https://zenkaiclothing.com/?code=...&state=...
```

The storefront itself does not need to understand those parameters. Copy the complete URL from the address bar, then immediately run:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs exchange
```

Paste the URL into the hidden prompt. The authorization code is validated, exchanged, and discarded; the resulting access and refresh tokens are stored in Keychain and are not displayed.

Check the result:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs status
```

## Refresh

The AliExpress console currently shows a 30-day access-token duration and a 60-day refresh-token duration for this app. Refresh shortly before the access token expires:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs refresh
```

AliExpress returns a new refresh token during refresh, so the CLI replaces both stored token values. Once the refresh-token window expires, repeat the browser authorization.

## Read-only product smoke test

Query the documented Dropshipper simple-product endpoint by public AliExpress item ID:

```bash
node tools/zenkai-aliexpress-bridge/cli.mjs product-read \
  --product-id 3256808918476308
```

The command reports only a product-status, inventory, SKU-count, currency, and price-range summary. It does not print the access token or the complete raw SKU response.

AliExpress attaches API access to the app's approved permission groups. The active Dropshipping group contains both read methods and `aliexpress.trade.buy.placeorder`, so the underlying token is treated as write-capable. The business client registers that mutation, but invoking it requires `confirmMutation: true`. The read-only CLI never supplies it; the local dashboard below crosses that guard only after a deliberate per-order click, fresh validation, and an idempotency write.

## Read-only order draft planner

The draft planner reads explicitly named Shopify orders, expands each storefront line into fulfillment components, verifies the approved AliExpress variants against the current product API, requests live tracked-freight quotes, and compares complete fulfillment plans.

```bash
node tools/zenkai-aliexpress-bridge/draft-orders.mjs \
  --shopify-order ZK2805 \
  --shopify-order ZK2806
```

The default selection policy is:

- compare current item cost plus quoted shipping before tax, coupons, or checkout adjustments;
- require a tracked shipping service;
- minimize cost among plans with the same package count;
- add another supplier/package only when it saves at least `$2.00` per extra package;
- keep the threshold configurable with `--min-split-savings <amount>`;
- emit a redacted, fingerprinted payload preview in `pending-user-approval` state.

The approved catalog currently contains:

- Cute Brooch Badge Store as the core source for Kanto, Johto, Hoenn, and Sinnoh;
- Fly Meng Choice Store as the price-checked Kanto alternative;
- Mocake Store for Evolution Pin Set SKU `12000057340465797`, validated specifically as `Metal color: 9`.

The planner groups items by store to model package count. A collector pack is therefore evaluated as one four-variant Cute Brooch shipment versus any plan that moves Kanto to another store. A single Kanto can use Fly Meng without adding a package; a mixed cart will split only when the whole-order saving clears the configured threshold.

Shipping addresses are used only in memory. The printed output exposes country/province and field-presence checks, but redacts names, street addresses, cities, postal codes, and phone values. AliExpress currently rejects a dropshipping delivery address without a mobile number even though the published schema describes `mobile_no` as optional. When Shopify has no customer phone, both checkout paths use the configured Zenkai fallback `+1 602-751-5492`.

This command cannot place an order: it never calls `aliexpress.trade.buy.placeorder`, prints `orderPlacementEnabled: false`, and leaves every successful draft awaiting user approval. The local dashboard is the separate, guarded execution workflow; it adds the idempotency ledger, fresh re-quote, fingerprint review, and a deliberate per-order action before crossing the mutation guard.

## Local fulfillment dashboard

Start the loopback-only review desk:

```bash
node tools/zenkai-aliexpress-bridge/dashboard-server.mjs
```

Then open:

```text
http://127.0.0.1:4317
```

Every dashboard load and **Refresh prices & plans** click automatically searches Shopify for paid, open orders at or after `#ZK2795`. It keeps orders with currently fulfillable approved AliExpress components, excludes anything already recorded as `placed-unpaid`, `paid`, or `handled-manually`, and preserves rejected or uncertain attempts for review instead of silently allowing duplicates. Mixed Printify/Gelato orders remain visible, but only their approved badge/pin components are drafted through AliExpress.

To review an explicit fixed batch instead:

```bash
ZENKAI_DASHBOARD_ORDERS=ZK2808,ZK2809 \
  node tools/zenkai-aliexpress-bridge/dashboard-server.mjs
```

The dashboard shows each Shopify basket, full shipping address, approved supplier/SKU plan, live item and tracked-shipping quote, consolidation decision, coupon eligibility, and current placement status. Customer details are served only over `127.0.0.1`; App Secret and OAuth tokens remain server-side in macOS Keychain and are never sent to browser JavaScript.

Use **Clear as handled** when an order has already been fulfilled outside this workflow. It writes an auditable `handled-manually` ledger record and removes the order from future automatic review. The control refuses to overwrite an unresolved or confirmed AliExpress placement record.

The AliExpress payload normally preserves Shopify's city exactly. A narrowly scoped exception sends `St Johns` for `Saint Johns, FL 32259`, because AliExpress's Dropshipping address validator rejects the USPS spelling as a missing city; the dashboard and Shopify record continue to display the original address.

### Coupon-assisted checkout

For an eligible cart, **Clear cart & prepare LDUS02/LDUS04** dispatches the checkout to the Zenkai Chrome extension running in the already-open, already-signed-in Chrome profile. It does not launch a second browser profile. Clicking the button is the authorization to clear the *entire* current AliExpress cart; there is no second typed confirmation. Before anything is changed, the server performs the same fresh Shopify read, exact-SKU validation, tracked-freight quote, and fingerprint comparison used by API placement.

The extension then:

1. clears the complete AliExpress cart;
2. uses AliExpress's own signed-in-page `mtop.aliexpress.trade.cart.add` client to add the complete approved `addItems` array in one cart mutation—without reading or exporting browser cookies;
3. verifies every distinct SKU ID plus the expected cart-line count—not merely the shared product ID;
4. opens AliExpress's address-book panel, adds the Shopify shipping address, uses the configured fallback phone when required, and verifies the recipient, street/unit, and postal code now displayed by checkout;
5. opens AliExpress's promo-code control and applies `LDUS04` when the live AliExpress item subtotal is at least `$30`, otherwise `LDUS02` when it is at least `$15`; success is accepted only when AliExpress's own controlled promo input reports the successful state;
6. stops on the final review page before **Place order**/**Pay now**.

Order submission and payment always remain manual. The dashboard also keeps **Create without coupon via API** as an explicit fallback.

Install the extension once in the Chrome profile used for AliExpress:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory:

   ```text
   /Users/vishnup/Downloads/ZenkaiTheme/tools/zenkai-aliexpress-bridge/browser-extension
   ```

5. Open `http://127.0.0.1:4317/` in that same Chrome profile and make sure AliExpress is signed in there.

The extension has a fixed local ID, and the dashboard accepts job claims and status updates only from that exact extension origin. It can reach only the loopback dashboard and AliExpress hosts. The private job file is mode `0600`, contains the address only until the extension claims it, and is deleted immediately after pickup. Dashboard status files are redacted and contain no address.

Start the dashboard normally and keep the Terminal window open:

```bash
cd /Users/vishnup/Downloads/ZenkaiTheme
node tools/zenkai-aliexpress-bridge/dashboard-server.mjs
```

AliExpress does not expose a harmless draft-order object. The **Create unpaid AliExpress order** action invokes the real place-order API and is intentionally described that way. Clicking that button is confirmation; no typed phrase is required. The server then:

1. re-reads the Shopify order;
2. revalidates the exact product variants, including E8 `Metal color: 9`;
3. re-quotes inventory, item prices, and tracked shipping;
4. compares the complete fingerprint with the reviewed draft;
5. writes an atomic `placement-started` idempotency record;
6. creates the unpaid AliExpress order;
7. records the returned AliExpress order IDs and disables further placement.

The ledger defaults to:

```text
tools/zenkai-aliexpress-bridge/.local-state/placement-ledger.json
```

The ignored local-state directory is writable by the loopback dashboard process. The ledger contains Shopify/AliExpress order identifiers, fingerprints, totals, and statuses, but no customer address. The directory/file are created with user-only permissions. Set `ZENKAI_ALIEXPRESS_LEDGER_PATH` to override the location. If AliExpress returns an ambiguous result, the ledger changes to `placement-uncertain` and blocks retries until the AliExpress orders page is checked; this avoids duplicate customer orders.

The local action endpoint also requires an exact same-origin request and a per-server random action token. The dashboard binds only to `127.0.0.1`, validates the Host and Origin headers, refuses cross-site requests, and applies a restrictive Content Security Policy.

After an unpaid order is created, **Review & pay on AliExpress** opens:

```text
https://www.aliexpress.com/p/order/index.html
```

Payment is never automated.

## Keychain item names

The utility owns only these exact services under the current macOS account:

- `zenkai-aliexpress-app-key`
- `zenkai-aliexpress-app-secret`
- `zenkai-aliexpress-access-token`
- `zenkai-aliexpress-refresh-token`
- `zenkai-aliexpress-oauth-state`
- `zenkai-aliexpress-token-metadata`

## Local verification

```bash
node --test tools/zenkai-aliexpress-bridge/test.mjs
node --check tools/zenkai-aliexpress-bridge/*.mjs
```

## Official AliExpress references

- [Server-side authorization-code flow](https://open.alitrip.com/docs/doc.htm?articleId=120687&docType=1&treeId=727)
- [Request signing algorithm](https://open.alitrip.com/docs/doc.htm?articleId=120692&docType=1&treeId=727)
- [Overseas REST endpoint](https://open.alitrip.com/docs/doc.htm?articleId=120689&docType=1&treeId=727)
- [Detailed dropshipping product query](https://open.alitrip.com/docs/api.htm?apiId=60452)
- [Buyer freight calculation](https://open.alitrip.com/docs/api.htm?apiId=39371)
- [Dropshipping place-order schema](https://open.alitrip.com/docs/api.htm?apiId=35446)
