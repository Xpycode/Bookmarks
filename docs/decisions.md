# Decisions Log

The WHY behind technical and design choices. Append new decisions; do not rewrite old ones.

---

## 2026-05-05 — Stack: PHP 8 + SQLite + vanilla JS, zero build step

**Context:** User wants a self-hosted alternative to Bookmarkninja, deployable to Strato shared hosting (Basic Starter or PowerPaket) via FTP. No CI, no Docker, no Node toolchain available on the target host.

**Options considered:**
1. PHP + SQLite + vanilla JS — runs on any LAMP-ish shared host, single-file deploy.
2. PHP + MySQL — extra config, MySQL not always default on Basic Starter.
3. Node + SQLite — needs persistent process, Strato shared doesn't support that cleanly.
4. Static + JS-only with localStorage — no cross-device, no auth, no real backend.

**Decision:** Option 1 — PHP 8 + SQLite, vanilla JS frontend, no build step.

**Rationale:** Matches Strato's defaults (PHP 8 + `pdo_sqlite` + Apache `.htaccess` ship enabled). Single SQLite file is trivial to back up. Zero build step means edit-PHP/refresh workflow; no Composer or npm required.

**Consequences:** No frontend framework — UI logic is hand-rolled DOM. Sortable.js loaded from jsDelivr CDN (only external runtime dep). Schema migrations will need to be hand-written when added.

---

## 2026-05-05 — Single-user only for v1

**Context:** Personal tool, replacing a single-user Bookmarkninja workflow.

**Decision:** Single password (bcrypt, set on first visit). No user table. Multi-user / OAuth / SSO deferred indefinitely.

**Rationale:** Auth complexity is the largest accidental-complexity tax for personal tools. Skipping it keeps the codebase tiny and the threat model trivial.

**Consequences:** No public-collection-sharing UX without later work; if shared/team use ever wanted, it's a real refactor.

---

## 2026-05-05 — Netscape HTML as canonical import format

**Context:** Chrome, Firefox, Safari, and Bookmarkninja all export Netscape HTML. Need to preserve folder hierarchy on import.

**Decision:** Hand-written tag-walk parser (not regex). `<H3>` opens a folder, `</DL>` closes it, `<A HREF>` adds a bookmark. Whole import in a single SQLite transaction with rollback on failure. Top-level orphan bookmarks land in an auto-created `Imported` category.

**Rationale:** Tag-walk handles nested folders correctly where line-mode regex breaks on multi-line `<DT>` blocks. Transaction-or-rollback prevents partial-import corruption.

**Consequences:** Untested against the user's actual Bookmarkninja export — a real export may include extra attributes (descriptions, icons, tags) that the v1 parser silently drops. Re-test before declaring import "done."

---

## 2026-05-05 — Search via LIKE, FTS5 deferred

**Context:** Personal-scale dataset. Bookmarkninja recommends 50–150 bookmarks per Tab; even with several Tabs the corpus is small.

**Decision:** Substring `LIKE` across `title`, `url`, `notes`, capped at 200 results, 200ms debounce on the frontend.

**Rationale:** SQLite FTS5 ships with PHP's `pdo_sqlite`, but the virtual table + tokenizer + ranking add complexity for no perceptible win at this scale.

**Consequences:** Search is non-ranked and slow on very large datasets. Revisit once a real corpus exists or once full-page text capture lands (HTML snapshot archiving — see research doc item #8).

---

## 2026-05-05 — Web-block `data/` and `lib/` via .htaccess

**Context:** SQLite DB lives in `data/bookmarks.sqlite`. PHP includes live in `lib/`. Both are colocated with the document root because Strato shared hosting doesn't give a path above the docroot.

**Decision:** `.htaccess` in each directory: `Require all denied` (Apache 2.4) plus legacy `Deny from all` for older configs.

**Rationale:** Defense-in-depth. Even if PHP misconfigures or Apache flips off, the deny rule blocks direct GET of the sqlite file or PHP includes.

**Consequences:** Backups via FTP still work (server-side file access). If user moves to nginx, the `.htaccess` files become inert and equivalent rules need to be added to the nginx config.

---

## 2026-05-08 — Dashboard mode hides the sidebar

**Context:** Wave-1 dashboard kept the sidebar visible alongside the card grid. With 3 children (sidebar + content + dashboard) in a 2-column CSS grid, the dashboard auto-flowed to row 2 col 1, producing an empty `All categories` strip below the sidebar. Beyond fixing that layout bug, the user wanted Bookmarkninja-style "everything in view" cards.

**Decision:** In dashboard mode, hide the sidebar entirely. `body.dashboard-mode` class drives both `.sidebar { display: none }` and `.layout { grid-template-columns: 1fr }`.

**Rationale:** Cards are now the primary nav. The tree only matters for list-view drill-down. Trying to render both at once gives neither enough room. Toggling via a single body class keeps the JS-CSS contract simple (one class, all dependent rules in CSS).

**Consequences:** Switching to a deeply-nested category for editing now takes one extra click (Dashboard → list view via right-click "Open in list view" or the toggle). Acceptable tradeoff for the dashboard's full-width view.

---

## 2026-05-08 — Card colors live on the row; hidden-set lives per-view

**Context:** Phase 2 added per-category colors and per-category hide. Phase 3 (named views) needed a place to put per-view hidden-state.

**Decision:** Color is a property of the *category* — stored as `categories.color TEXT` (nullable), persists across views. Hidden-state is a property of the *view* — stored as a JSON id-array in `settings.views_data.views[i].hidden_ids`.

**Rationale:** "MCR is red" is a permanent visual identity for that category — it should be red no matter which view you're looking from. "MCR is hidden" is contextual — it's hidden in the Work view but visible in All. Putting hidden in `settings` (rather than on `categories`) made phase 3's per-view extension a straight JSON change with zero schema work.

**Consequences:** Per-view colors are not possible (and explicitly rejected — would be confusing). Color always reflects the global category state.

---

## 2026-05-08 — Named views stored as a single JSON in `settings.views_data`

**Context:** Phase 3 introduced multiple "views" — each with its own dashboard order and hidden set. Could've been a `views` table + a `view_categories` join, or a single JSON blob in `settings`.

**Decision:** Single JSON blob in `settings`, key `views_data`: `{ views: [{ id, name, dashboard_order, hidden_ids }, ...], current_view_id }`. New `ensureViewsData()` PHP helper migrates legacy `dashboard_order` + `hidden_ids` keys into a default "All" view on first call.

**Rationale:** Zero schema migration on a codebase whose `db.php` only runs `initSchema` for new DBs. Single atomic write per view operation. Data is small (<10kB even with dozens of views). Strictly simpler than a real table while the schema needs are this thin.

**Consequences:** Promote to a real `views` table when views grow more fields (descriptions, tag filters, sharing slugs). Until then, all view actions (`add_view`, `rename_view`, `delete_view`, `set_current_view`, `set_view_order`, `set_view_hidden`) read-modify-write the single key.

---

## 2026-05-08 — Native `<dialog>` color picker, not the OS picker

**Context:** First attempt at Change-color was a programmatic `.click()` on an offscreen `<input type="color">`. Worked in Chrome; Safari silently blocked it (anti-spoofing — refuses to open native pickers for off-screen inputs).

**Decision:** Use a real visible `<dialog>` containing the color input + Save / Reset to auto / Cancel buttons. No programmatic native-picker triggers.

**Rationale:** Cross-browser portable. Matches existing `#bookmark-dialog` and `#import-dialog` patterns. Reset-to-auto is now a peer button instead of a separate context-menu item.

**Consequences:** Slightly more clicks per color change (open dialog, pick, save) vs Chrome-style direct picker. Fine for a single-user tool used a few times per category.

---

## 2026-05-08 — Dashboard switched from CSS Grid to column-wrapped masonry

**Context:** The wave-2 dashboard used `display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`. CSS Grid is row-bound: every row's height is bounded by the tallest card in it, so short cards (DW/AI intern with 2 items, DW/MCR with 3) left vertical voids beneath them before the next row began. User wanted Bookmarkninja-density.

**Decision:** Replace the single grid container with N flex column `<div class="dash-col">` children. Each column's cards stack with `flex-direction: column`. JS (`layoutDashboard()` in `app.js`) computes column count from `containerW / 320px`, then iterates cards greedily — each card → whichever column's `offsetHeight` is currently shortest. Each column is its own Sortable instance, all sharing `group: 'dashboard-cards'` so cross-column drag uses native Sortable cross-container behavior (already proven for inter-card bookmark drag).

**Rationale:** Native CSS `grid-template-rows: masonry` exists in Safari 26 but not Edge/Chrome in 2026 — Edge is the daily browser. Library options (Muuri, Macy.js) either replace Sortable or duplicate it; rolling our own is ~80 LOC, no new CDN dep, and matches the project's vanilla-JS ethos. Column-wrapped (vs flat-container + absolute positioning) avoids out-of-flow conflicts with Sortable's drop-target detection.

**Consequences:**
- **Persistence stays as a flat array** in `views_data[viewId].dashboard_order`. After drag, cards are flattened in zigzag (reading) order — `col0[0], col1[0], …, colN[0], col0[1], …` — and re-packed greedily on next render.
- **Drag-target column isn't guaranteed sticky across reloads.** Greedy repack may place a dropped card in a different column than where it was dropped, if heights changed. Documented tradeoff; promote to per-column persistence later if it bothers the user in practice.
- Each column capped at `max-width: 400px` so single-card views don't span the whole viewport.
- New `state.dashboardDragging` flag guards a debounced `window.resize` re-layout from racing with Sortable's mid-drag DOM mutations.

**Spec:** `docs/specs/2026-05-08-masonry-dashboard.md`

---

## 2026-05-08 — Card-body `max-height` raised from 360px to 70vh

**Context:** Wave 2 capped `.dash-card-list` at `max-height: 360px` to prevent a 200-bookmark category from blowing out the row's height in CSS Grid (and thus dragging columns full of empty space). With masonry packing each column independently, that constraint solves a problem that no longer exists for cards under ~25 items.

**Decision:** `max-height: 70vh`. Adapts to viewport height. Most cards (≤25 items, which is the vast majority) fit fully without internal scroll. Only the truly huge categories (Privat/divers with 281 items, Catalog with 194) still scroll inside their card.

**Rationale:** Bookmarkninja-fidelity wants "everything in view at once" by default. Pure removal of the cap turned Privat/divers into an ~8000px-tall card. `70vh` is the middle path — cards are as tall as needed up to a screen-aware limit. Viewport-relative beats fixed pixels because user's screen height varies.

**Consequences:** A user on a tall display (1440p portrait, etc.) now sees more bookmarks per card before scrolling kicks in. The page becomes slightly longer overall when many tall cards are visible — masonry packs them efficiently, but the vertical scroll on the dashboard itself grows.

---

## 2026-05-08 — Bookmarklet surfaced as dedicated topbar button

**Context:** The `?r=quickadd` bookmarklet shipped in v2 wave 1 but lived inside the `#import-dialog`, reached only via the "Import" topbar button. Even the project owner forgot it existed (this session opened with "research how to add bookmark droplets" — the answer was "you already have one").

**Decision:** New `↗ Save tools` button in the topbar (between `▦ Dashboard` and `Import`). Opens a dedicated `#bookmarklet-dialog` containing the draggable bookmarklet link + drag instructions + a "Coming soon: install as a PWA" hint. Import dialog scoped back to file-import only.

**Rationale:** Discoverability. Also gives a single home for "save current tab" entry points — bookmarklet now, PWA install instructions soon, browser extension link later. Side fix: hardcoded `$origin = 'https://bookmarks.lucesumbrarum.com'` in the bookmarklet (was `$_SERVER['HTTP_HOST']`-based) to eliminate the host-drift class of bug we were chasing earlier in this session (Edge tracking-prevention symptom).

**Consequences:** Existing dragged bookmarklets continue to work (URL is identical). Newly-dragged ones can never inherit a wrong origin from a `www.`-prefixed or dev URL.

---

## 2026-05-08 — PWA + Web Share Target as canonical "save current tab" path

**Context:** Bookmarklets get silently CSP-blocked on a growing fraction of modern sites (GitHub, X, Gmail, banking) and have no integration with iOS/Android/Windows native share sheets. Karakeep + Linkwarden both ship bookmarklet *plus* MV3 extension *plus* PWA — bookmarklet-only is not enough in 2026.

**Decision:** Ship a Progressive Web App with Web Share Target. Five new files, no new dependencies, no build step:
- `manifest.webmanifest` — declares the app installable, registers `/index.php?r=share` as a share target receiving `title`/`text`/`url` via POST multipart/form-data.
- `sw.js` (root scope) — minimal service worker required for installability eligibility. Network-first for navigations with offline fallback to cached `/index.php` shell. API calls and share-target POSTs always pass through.
- `views/share.php` — POST-handling sibling of `quickadd.php`. Same auth-aware-inline-login pattern (preserves shared payload via hidden form fields across the login round-trip), same category-picker form, same `add_bookmark` API call with CSRF.
- `index.php?r=share` route handler.
- Manifest/theme-color references on every entry-point view (`app.php`, `login.php`, `setup.php`, `quickadd.php`).

`.htaccess` adds `AddType application/manifest+json .webmanifest` so browsers don't reject the manifest on Strato's default MIME map.

**Rationale:** Web Share Target is the only mechanism that (a) bypasses CSP entirely (the browser captures the URL, doesn't run JS on the source page), (b) integrates with native mobile share sheets, and (c) fits the no-Node/no-build-step constraint. Browser extension was deferred — covers desktop CSP-blocked sites but not mobile, requires more code, and PWA + bookmarklet together cover ~95% of cases.

**Consequences:**
- Once installed (Add to Home Screen on iOS/Android, or "Install app" in Edge/Chrome menu), Bookmarks appears in the OS share sheet next to Mail and Messages.
- Cancel button on the share form navigates to `/index.php` (the dashboard) rather than `window.close()` — share-target tabs aren't programmatically closable on most platforms.
- Skipped icons for v3b (decision G default). PWA installs use the OS placeholder until a future wave adds 192/512 PNGs.
- Last-used category is shared via the `quickadd_last_category` localStorage key with the bookmarklet — using either entry point updates the default for both.

---

## 2026-05-08 — Cache-bust assets via `?v=<filemtime>`

**Context:** Three sessions in a row opened with hard-refresh-dance because Apache's default `Cache-Control` lets browsers hold onto `app.css`/`app.js` for an hour or more, and post-deploy users were seeing stale code. The Edge "Service Unavailable" bookmarklet bug earlier this session was also caused by stale cache (Edge Tracking Prevention's verdict, but in the same family of cache-staleness pain).

**Decision:** New `lib/assets.php` exports a single `asset(string $name): string` helper that returns `public/{$name}?v={filemtime}`. Memoized via `static $cache` to avoid repeated `stat()` calls per request. Used at all 5 stylesheet/script reference points across the four entry-point views.

**Rationale:** mtime-based cache-bust is zero-compute (single `stat()` syscall, OS-cached anyway) and only advances when content actually changes (lftp mirror skips unchanged files). Content-hash would be marginally more accurate but requires reading the file — overkill for this single-tenant app.

**Consequences:** Each deploy auto-invalidates browser cache for changed files. New assets just call `asset('whatever.json')` to opt in. Stale-cache deploy bugs eliminated as a class.

---

## 2026-05-08 — Promoted dashboard layout from flat-order to per-column persistence

**Context:** Wave 3a's masonry shipped with explicit decision C: "Flat order + greedy repack on each load." The spec documented the tradeoff: "drag-target column not guaranteed sticky across reloads — promote to per-column storage only if it bothers in practice." It bothered. Two compounding bugs surfaced once the dashboard had a real range of card heights (DW/Studio at 12 items, DW/TIB/Confluence at 25, Privat/divers at 281):

1. **Post-drag repack reshuffled unrelated cards.** `Sortable.onEnd` ran `layoutDashboard()` again, which re-greedy-packed everything. One card moving by one slot cascaded into different column assignments for cards 5+ columns away. Felt like the dashboard ignored the user's intent.
2. **Reload didn't preserve drop position.** Even without bug 1, on next render `layoutDashboard()` ran greedy from scratch — a card dropped in column 4 might land in column 2.

Both shared the root cause: greedy packing was the source of truth for column placement.

**Decision:** Per-view `dashboard_columns` is now the source of truth. New JSON key on each view: `dashboard_columns: [[id, id, ...], [id, id, ...], ...]` — array of arrays of category IDs, one inner array per column. Greedy packing is now the *fallback* — used only when (a) no saved layout exists for this view, (b) saved layout's column count doesn't match the current viewport, or (c) new categories aren't in the saved layout. After greedy fallback runs, the result is auto-persisted as a fresh `dashboard_columns` so subsequent drags can use the fast path.

Drag handler simplified: `Sortable.onEnd` now persists current column membership and **does not call `layoutDashboard()` again**. Cards stay exactly where Sortable dropped them.

**Rationale:** No schema change needed — `views_data` is already a JSON blob, adding a key is free. Greedy as default-when-empty + saved-as-truth-when-arranged matches user mental model: "the layout is whatever I made it; the system fills in the rest." Stale ids in `dashboard_columns` (from hidden/deleted cats) are tolerated and silently skipped via the `cardById` lookup — this means showing-back a previously-hidden card returns it to *exactly* the column position the user originally placed it in.

**Consequences:**
- Reverses the wave-3a "flat order + repack" tradeoff entirely.
- New API endpoint `set_view_columns` mirrors `set_view_order`'s shape.
- Window resize across column-count boundaries still re-runs greedy; the saved layout for the previous column count is overwritten. Cross-width persistence (e.g. "remember the 5-column layout when I'm wide and the 3-column layout when narrow") was considered and rejected as overkill.
- Flat `dashboard_order` is still kept in sync on each drag — used as the seed for greedy when the column count mismatches.

---

*Append new decisions below. Keep oldest at top.*
