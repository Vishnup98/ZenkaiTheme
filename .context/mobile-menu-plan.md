# Mobile menu redesign — plan

## Context

Zenkai is a Shopify streetwear theme. Desktop is fine; mobile menu (the full-screen
`zenkai-*` overlay) now feels off-brand and the recently added "Collections" nested
submenu renders as a tiny clipped box at the bottom instead of a full push-panel.

### Source files

- `snippets/zenkai-mobile-menu.liquid` — overlay markup + inline JS
- `assets/theme.scss.liquid` — styles live from line 10995 (`ZENKAI MENU OVERLAY`) down to ~line 11377 (close / submenu / back button)
- `snippets/header-icons.liquid` / `sections/header.liquid` — invoke the overlay via the `.js-zenkai-toggle` menu button
- `config/settings_data.json` — brand tokens

### Brand tokens (ground truth)

- Body bg `#FFFFFF`, body text `#1a1b2e` (midnight indigo)
- Buttons: solid midnight `#1a1b2e` on white text, radius `3px` (setting `button_style: round-slight`)
- Accent `#5966cf` indigo — sale tags, testimonial border, section accent lines
- Announcement bar: `#1a1b2e` bg / `#FFFFFF` text / weight 600
- Type: `Inter` 400/600; nav-style uses uppercase + ~0.15em tracking at small sizes
- Recurring motif: 2px `linear-gradient(90deg, transparent 0%, $colorAccent 20%, $colorAccent 80%, transparent 100%)` as a section divider

### Symptoms to fix

1. Menu background is a near-black gradient (`#0a0a0a → #141414`), not the midnight indigo used by the rest of the dark UI.
2. "Shop best sellers" CTA is an off-white `#f5f5f7` pill with `border-radius: 12px` and a heavy drop shadow — inconsistent with the theme's 3px-radius solid midnight/white buttons.
3. Close chip is a small glassy translucent square (`backdrop-filter: blur(10px)`, `rgba(255,255,255,0.06)` bg, rgba borders) — reads generic/iOS, ignores the indigo palette.
4. Nav links are center-aligned caps at 18px / 0.15em / `rgba(255,255,255,0.85)`. The hover underline is invisible on touch. No indigo accent anywhere. Feels disconnected from the rest of the site's typographic voice.
5. Dividers are `rgba(255,255,255,0.06)` hairlines — should reflect the accent-gradient motif in some form.
6. No brand anchor at the top (no logo/wordmark), no utility footer (account, social, region). Feels like a stock drawer.
7. **Nested submenu is broken** — tapping COLLECTIONS opens a small clipped box anchored to the parent `<li>` with BACK and the title overlapping, instead of a full push-panel.

### Root cause of the submenu bug

`.zenkai-submenu` uses `position: fixed` to overlay the full screen, but it's a child of `<li class="zenkai-menu__item">`. The stagger-in animation applied to that `<li>` finishes with `transform: translateY(0)` and `animation-fill-mode: forwards`, leaving a non-`none` transform on the item permanently. A non-`none` transform on an ancestor creates a containing block for fixed descendants (CSS spec: "Fixed positioning containing block"). So the submenu becomes fixed *relative to the narrow, centered `<li>`*, not the viewport — giving a skinny box where BACK and the title collide.

Secondary: with only one child item ("Collections" is a single-link submenu in the current menu), the submenu has almost no content, making the containing-block artifact extra obvious.

## Plan (revised after Codex review)

Codex pushed back on three things: scope creep (history stack, inline search, etc.), re-inventing focus/scroll patterns the theme already ships, and under-specified details. Revised accordingly — pared to the smallest change that fixes the bug + restores brand fidelity, riding theme primitives wherever they exist.

### 1. Architecture — push-panel, not nested overlay

Restructure the submenu so it is **not** a descendant of any animated ancestor.

- Move every `<ul class="zenkai-submenu">` out of its `<li>` and render them as siblings of the main `<ul>` at the overlay root, keyed by `data-submenu-id`. This alone eliminates the containing-block bug independent of the animation decision.
- Submenu IDs must be `link.title | handleize | append: forloop.index` — the same collision-safe pattern `snippets/slide-nav.liquid` already uses. Plain `handleize` collides on duplicate titles.
- Push-panel motion: main list translates left (`translateX(-30%)`, 0.5 opacity) when a submenu is open; submenu slides in from right at full width. Symmetric reverse on Back.
- **Single level of nesting by explicit design.** Declared limitation: if the merchant adds a third level (grandchildren) to the menu tree in the Shopify admin, the mobile overlay will silently flatten them. This is a regression versus the legacy `slide-nav.liquid` (3 levels supported at `slide-nav.liquid:56–104`), but it matches what `zenkai-mobile-menu.liquid` currently renders, so no active user-visible regression. Revisit if the menu structure grows — see "Known limitations" below.
- **Drop the stagger intro animation entirely.** It's the root of the bug, adds no value, and Codex agrees. Use a single opacity fade on the overlay itself — no per-item transforms, ever.

### 1b. Ride existing theme primitives

- Replace the custom open/close logic with `theme.a11y.trapFocus` / `theme.a11y.removeTrapFocus` (defined at `assets/theme.js.liquid:65` + `138`, already used by cart and search drawers at 925/1103/1305). Do not roll a separate focus trap.
- Use the `js-drawer-open` class on `<html>` + `<body>` for scroll lock — this is the real drawer convention (`assets/theme.scss.liquid:2881` applies `overflow: hidden`, and cart drawer uses it at `theme.js.liquid:1302` via `this.$nodes.parent.addClass(this.config.openClass)`). **Do NOT use `screen-layer-open`** — that's the ProductScreen/quick-shop state and it applies `.root { display: none }` (line 5373), which is wrong for a drawer. Also **do not** use raw `document.body.style.overflow = 'hidden'` — replacing that is the whole point of ditching the current implementation.
- Remove the `max-width: 400px; margin: 0 auto` from `.zenkai-menu` — the overlay needs to be true full-width for the push-panel motion to read correctly.
- **Split open vs close class hooks** on the `.js-zenkai-toggle` API. Currently one class is on both the header trigger and the in-overlay close button, which means the JS applies `aria-expanded` and `is-active` to both — semantically wrong for the close button. Use `.js-zenkai-open` on the header trigger (update `snippets/header-icons.liquid:53`) and `.js-zenkai-close` on the overlay's close control. Keep `.js-zenkai-toggle` as a legacy alias on the opener only if we want zero external template churn — pick one; don't overload both.
- **Guard against double-binding in the theme editor.** The current inline-JS attaches listeners on `DOMContentLoaded`. When a section re-renders in the theme editor, Shopify emits a `shopify:section:load` event but does *not* re-fire `DOMContentLoaded`, so on a re-render the event bindings can end up duplicated. Key the init on a `data-menu-initialized` attribute or bind via `shopify:section:load` / `shopify:section:unload` handlers on the section root. Cart drawer + search modal show the pattern.

### 2. Visual system — align to Night Signal palette

- Overlay background: solid `#1a1b2e` (no near-black gradient). Add an optional 1px top accent-gradient line (`linear-gradient(90deg, transparent, $colorAccent, transparent)`) as a callback to the site's divider motif.
- Typography: keep Inter; use `font-size: 20px`, `letter-spacing: 0.1em`, `font-weight: 500`, uppercase for primary items. Left-align the list — streetwear brands typically left-align, and left alignment gives the indigo accent a natural home on the leading edge.
- Active / pressed state: a 2px indigo bar on the leading edge (replacing the current center underline which is invisible on touch). On the current-route item, render that bar in `$colorAccent`.
- Dividers: `1px solid rgba(255,255,255,0.08)` between items is fine, but reserve the gradient accent line for the top of the overlay and between item groups (nav vs utility footer).
- Remove `backdrop-filter` from the close chip — it's off-brand and costs a repaint. Replace with a flat text button "CLOSE ×" at 11px / 0.2em / weight 600 sitting inline with a small logomark at top-left (see header spec below).

### 3. Header bar inside the overlay

Give the overlay its own 56px header, matching the site header's proportions on mobile:

- Left: inline-render the logo with the same pattern as `header-logo-block.liquid` — `{% if section.settings.logo %}` render `{{ section.settings.logo | img_url: '...' | img_tag }}` at a fixed 28px height, otherwise fall back to `{{ shop.name | upcase }}` in the nav-item type style. **Do NOT include the `header-logo-block` snippet directly** — it's tightly coupled to `.header-item--logo` / `.header-layout--left-center` scoping and will inject unrelated CSS if invoked from inside the overlay.
- Right: "CLOSE ×" text button (no box, just text + 14px glyph).
- Between: nothing — keeps negative space.
- Bottom edge: the accent-gradient hairline.

Inside a submenu, the header morphs:
- Left: "← BACK" text button (same visual weight as CLOSE).
- Center: submenu title (same uppercase/tracking as nav items, not the current centered-18px treatment).
- Right: CLOSE × (so users can always exit without climbing back up).

### 4. CTA + Search treatment

- Replace the off-white rounded pill with a white button (`background: #FFFFFF; color: #1a1b2e; border-radius: 3px; padding: 14px 18px;`) — matches the site `.btn` primary spec inverted onto the midnight overlay. No drop shadow.
- Keep the existing modal-link hand-off (`js-modal-open-search-modal`). "Search" stays as a row with a magnifier glyph + label — just re-styled to left-align with the rest of the list. **Not** building a custom inline search input; Codex was right that it's scope creep and the existing modal already works.
- Preserve existing conditionals: render the account row only when `shop.customer_accounts_enabled`, render the search row only when `section.settings.header_search_enable` (same guards `slide-nav.liquid` uses today).

### 5. Utility footer inside the overlay

Add a small utility block at the bottom of the primary list (not a separate fixed footer — keep layout simple):

- Account / Log in — guarded by `shop.customer_accounts_enabled`.
- Social links — respect `settings.social_enable` (currently `false` in `config/settings_data.json:166` + `config/settings_schema.json:680`). Only render when that setting is on, then iterate `settings.social_instagram_link` / `settings.social_facebook_link` and skip any blank entries. Do not unilaterally expose social in the menu while the site-level setting is off.
- Shipping strip — pull from `section.settings.announcement_text` so copy stays in sync with the announcement bar. **Do not hardcode** the "Free US shipping" string. If the announcement is disabled (`section.settings.show_announcement == false`), omit the strip rather than falling back to hardcoded copy.

Group spacing: ~32px gap above the footer block, separated by a full-width accent-gradient hairline.

### 6. Motion

- Overlay enter: 200ms opacity fade + 8px translateY. No stagger on children.
- Submenu push: `transform: translateX(100% → 0)` on the submenu, `translateX(0 → -30%)` on the main list, both 280ms `cubic-bezier(0.32, 0.72, 0, 1)` (iOS spring feel, matches the site's general ease).
- Reduce-motion: skip transforms, keep opacity only.

### 7. Accessibility

- Give the overlay `role="dialog"`, `aria-modal="true"`, `aria-label="Menu"`.
- Use `theme.a11y.trapFocus({ container: overlay, elementToFocus: …  })` on open (matches how cart/search drawers do it at `theme.js.liquid:925, 1103, 1305`); call `removeTrapFocus` on close and restore focus to the hamburger trigger.
- On submenu open: call `trapFocus` again on the panel with `elementToFocus` = the Back button; on Back, `removeTrapFocus` on the panel and restore focus to the parent trigger `<button>`.
- Hidden panels must be removed from the a11y tree *and* tab order — set `aria-hidden="true"` **and** `tabindex="-1"` on all focusable descendants (cheap, reliable). Add `inert` on top as progressive enhancement where supported.
- Define backdrop dismissal explicitly: only the outer `.zenkai-overlay` element (not children) receives the dismiss click handler, via `event.target === overlay` check — already present, keep.
- `aria-expanded` on submenu toggles — keep.
- All tap targets ≥ 44px tall.

### 8. Implementation steps

1. Rewrite `snippets/zenkai-mobile-menu.liquid` markup:
   - Add overlay header (`<header class="zenkai-overlay__bar">` with logo + close).
   - Emit `<ul class="zenkai-menu__list">` only with primary items (no nested `<ul>` inside `<li>`).
   - After the primary list, emit one `<section class="zenkai-panel" data-submenu-id="…">` per dropdown link, each with its own header (back + title + close) and list of children.
   - Append utility footer (`<footer class="zenkai-overlay__utility">`).
2. Strip lines 10998–11377 in `assets/theme.scss.liquid` and replace with the new ruleset. Key rules:
   - `.zenkai-overlay { background: #1a1b2e; }` — no transform, no filter.
   - Top accent line via `::after` with the gradient recipe.
   - Panels: `.zenkai-panel { position: absolute; inset: 0; transform: translateX(100%); transition: transform 280ms cubic-bezier(.32,.72,0,1); } .zenkai-panel[aria-hidden="false"] { transform: translateX(0); }`.
   - Main list slides: `.zenkai-menu__list.is-pushed { transform: translateX(-30%); opacity: 0.6; }`.
3. Rewrite the inline JS:
   - Replace `submenuToggles` / `backButtons` wiring with a `openPanel(id)` / `back()` that also updates a small `openPanels` array for future multi-level support, toggles `is-pushed` on the main list, manages focus, and listens for `Escape`.
   - Keep the existing modal-link handoff (`js-modal-open-search-modal`).
4. Verify on iPhone SE (`<375px`) — the overlay header should remain 56px and not clip the logo.
5. Verify with `prefers-reduced-motion: reduce`.

### 9. What intentionally stays

- `zenkai-*` class prefix (avoids collisions with the legacy `slide-nav` snippet that still exists in the codebase).
- Focus-within existing header / icons layout (no section.liquid changes required beyond ensuring the trigger button lives in the bar and the logo asset is available to the overlay header).

## Pre-implementation verification (fragility audit)

The theme's had a lot of custom modifications, so some "theme default" hooks may already be decoupled. Verified each primitive the plan depends on:

| Primitive | Status | Notes |
|---|---|---|
| `theme.a11y.trapFocus` / `removeTrapFocus` | ✅ Live | `theme.js.liquid:65, 138`, actively used by cart+search drawers. |
| `js-drawer-open` body scroll-lock class | ✅ Live | `theme.scss.liquid:2881` applies `overflow: hidden`. Scrim rules at 2970/2984. Correct idiom. |
| ~~`screen-layer-open`~~ | ❌ **Wrong primitive** | That's ProductScreen (quick-shop). It does `.root { display: none }` — not a scroll-lock. Plan corrected to use `js-drawer-open`. |
| `section.settings.announcement_text` | ✅ Live | Still read at `announcement-bar.liquid:14`. Safe to reference. |
| `settings.social_enable` | ⚠️ **`false`** | Don't show social in menu footer unless user flips setting on. |
| `header-logo-block.liquid` | ⚠️ Not cleanly reusable | Tightly coupled to `.header-item--logo` scoping. Inline-render instead. |
| `linklists[section.settings.main_menu_link_list]` | ✅ Live | Points to `main-menu`. Shared across desktop nav, legacy slide-nav, and zenkai menu. |
| `.js-zenkai-toggle` wiring | ✅ Live, but conflated | Used on both opener (`header-icons.liquid:53`) and close button (`zenkai-mobile-menu.liquid:9`) — split in rewrite. |
| Scroll-detect listener (`is-scrolled`) | 💀 Dead code | No CSS rules target `is-scrolled`, and `overlay_header` is hardcoded `false` (`header.liquid:45`). Drop the listener. |

One unknown the static audit can't resolve: **app-injected CSS from `content_for_header`** (installed Shopify apps can inject styles that target any selector). Can't audit statically. If the redesign looks off in staging, that's where to look.

## Scope guardrails (things I explicitly am NOT doing)

Codex was right that the original plan's "history stack", multi-level API, and inline search were scope creep. The markup only renders one level of nesting today, so the redesign stays one level. If we ever add grandchildren, we extend then.

## Known limitations of the redesign

- **One level of nesting only.** `main_menu.links[i].links[j]` renders; `main_menu.links[i].links[j].links[k]` is silently flattened. Legacy `slide-nav.liquid` supports three levels; the current zenkai menu and this redesign support one. Acceptable for the current menu structure (HOME, ALL PRODUCTS, HOODIES, TEES, SWEATSHIRTS, HATS, COLLECTIONS → a few links).
- **Shopify theme editor** may double-bind event listeners on section re-render unless the init is idempotent (addressed in §1b).
- Not addressing the **legacy `slide-nav.liquid`** snippet — it's still in the codebase but no longer reachable (`mobile_menu_style` is hardcoded to `'thumb'`). Leaving it alone; removing dead code is a separate PR if desired.

## Open questions for the reviewer

1. Should submenu open via slide-from-right (iOS Settings pattern) or accordion-expand inline under the parent item? The plan picks slide-from-right because the user's menu may grow to multiple nested categories; accordion collapses work for 1 level but feel cramped with more. Does Codex agree?
2. Is there value in showing a "featured collection image" inside the Collections panel (streetwear drop aesthetic), or does that bloat the menu and hurt tap targets on small phones?
3. Any reason to keep the stagger intro animation? It's the trigger for the containing-block bug. I want to drop it. Counter-argument would be it telegraphs brand personality on open — is that worth the footgun?
4. Should the overlay's top be the accent-gradient line, or a solid `$colorAccent` 2px bar? Both exist in the theme — the site uses the gradient between sections but a solid bar under section headers.
5. Any mobile-nav a11y patterns I'm missing (e.g., `inert` attribute on background content, Pointer Events for background dismissal)?
