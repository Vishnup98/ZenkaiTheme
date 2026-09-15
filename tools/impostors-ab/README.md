# Impostors design experiment

Experiment: `impostors_design_20260913_v1`.

Status: ended September 15, 2026. New enrollment is disabled and clean campaign URLs render the new/current default page directly, eliminating the experiment routing navigation. The frozen arm templates remain available for historical reconciliation and previews.

Original design: commit25825f50, September13 00:19:51Pacific, before the day's typography/mobile/section polish. Current design: c00c0b20. Both have frozen CSS, sections and CTA snippets. Responsive image delivery and hero preloading are shared technical improvements. Popup behavior is identical to the c00c0b20live layout in both versions. This tests the old vs current design, not old slow asset delivery vs optimized delivery.

## Routes

- Existing default Impostors URL enrolls eligible browsers50/50 when snippet enabled=true.
- `?view=impostors-ab-original&ab_preview=1`: original preview, excluded from enrollment.
- `?view=impostors-ab-current&ab_preview=1`: current preview, excluded from enrollment.
- Other journey/viewtemplates excluded. Shopify theme editor and explicit preview_theme_id excluded.
- localStorage assignment persists30days. Both arms get one identical routing redirect, preserve original ad parameters. If storage unavailable, default page remains and no experiment labels are added.

## Measurement

Enrolled arrivals have `ab_exp=impostors_design_20260913_v1` plus their `view` in final URL. Use GA4 Landing page + query string to compare enrolled sessions, purchases/session and revenue/session; filter out ab_preview. Use users for visitor counts where report supports them; sessions are not independent unique people. Do not use raw Meta ad totals to compare arms, since the same ads feed both.

Native product forms receive hidden line properties `_zk_ab_experiment`, `_zk_ab_variant`, `_zk_ab_assignment` for Shopify order reconciliation. No new purchase events or duplicate pixels are added. Accelerated checkout metadata must be verified on real orders before relying on its attribution coverage; unlabelled orders are not automatically assigned. GA4's ecommerce/session attribution is the parallel reporting path.

Primary outcome: contribution per enrolled visitor/session using Shopify revenue and costs plus GA denominator. Secondary: checkout and purchase rate, then cart events. GA numbers require processing time. Do not declare a winner from a handful of purchases or repeated hourly significance checks. Treat any first-day split as preliminary.

## Stop

Set `impostors_ab_enabled=false` in snippets/impostors-ab-router.liquid and publish via connected main branch. Normal campaign URLs then stay on current default page. Existing explicit arm URLs remain accessible but no new metadata added. Do not delete templates used in visitor URLs while evaluating old orders.

## Validation

`node tools/impostors-ab/check.mjs` checks both random branches, same browser stability, tracking query preservation, no redirect loop, form properties, preview exclusion, unrelated journeys and storage failure. Live render + mobile visual verification are separate required checks. No payment should be submitted for QA.
