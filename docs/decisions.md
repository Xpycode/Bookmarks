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

*Append new decisions below. Keep oldest at top.*
