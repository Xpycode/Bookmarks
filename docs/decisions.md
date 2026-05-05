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

*Append new decisions below. Keep oldest at top.*
