# Project State

> **Size limit: <100 lines.** Digest, not archive. Detail goes in session logs.

## Identity
- **Project:** Bookmarks
- **One-liner:** Self-hosted single-user bookmark manager for Strato shared hosting — PHP 8 + SQLite, vanilla JS, zero build step.
- **Tags:** web, php, sqlite, self-hosted, bookmark-manager, strato
- **Started:** 2026-05-05
- **Repo:** github.com/Xpycode/Bookmarks
- **Live URL:** https://bookmarks.lucesumbrarum.com (PHP 8.4.20, Apache/Strato)
- **Working branch:** `main` (also kept in sync with `claude/bookmark-manager-import-juSnx`)

## Current Position
- **Funnel:** build
- **Phase:** v2 wave 3b shipped (PWA + Web Share Target, bookmarklet surfaced in topbar, asset cache-bust). Save-current-tab UX now covers desktop bookmarklet + mobile/CSP-safe share sheet.
- **Focus:** Wave 4 picks. Recommended next: **tags alongside categories** (data already in import; biggest UX win). Or wave 5: **auto-fetch metadata** (favicons + descriptions on save).
- **Status:** ready
- **Last updated:** 2026-05-08

## Funnel Progress

| Funnel | Status | Gate |
|--------|--------|------|
| **Define** | done | Stack + scope locked. Hard constraint: PHP+SQLite, no Composer/Node, Strato-FastCGI deployable. |
| **Plan** | done | 25-manager landscape research → Top-10 backlog. |
| **Build** | active | v1 live with 609 imported bookmarks. v2 waves 2 + 3a dashboard + 3b save-tab UX all live. |

## Shipped (v1 + v2 waves 1–3a)

| Capability | Where |
|------------|-------|
| Nested categories w/ drag-reparent · bookmarks CRUD+reorder · search · dark mode · Netscape HTML import · bcrypt auth+CSRF · Strato deploy script | v1 |
| Dashboard view (CSS-Grid card layout) · `?r=quickadd` bookmarklet · Cancel-fix | v2 wave 1 |
| Dashboard rebuild — full-width, sidebar hidden, drag-cards-by-header, drag bookmarks between cards (Sortable shared group), right-click menus, per-category colors via `<dialog>`, per-view hide, **named views** with topbar dropdown | v2 wave 2 |
| **Column-wrapped masonry** — greedy shortest-column packing, debounced resize re-layout. Card-body `max-height` raised 360px → 70vh now that columns pack independently. **Per-column persistence (`view.dashboard_columns`)** added in 3a-followup so drops stay sticky across reloads; greedy is now fallback only. New `set_view_columns` API endpoint. | v2 wave 3a |
| **Save-current-tab UX**: bookmarklet surfaced as topbar `↗ Save tools` button (out of the buried Import dialog) · **PWA + Web Share Target** (`manifest.webmanifest`, root-scope `sw.js`, `r=share` route, `views/share.php` POST handler). Native mobile share-sheet integration. Bookmarklet origin hardcoded to canonical URL. | v2 wave 3b |
| **Cache-busted assets** (`asset('app.css')` helper appends `?v=<filemtime>` — no more hard-refresh after deploy). | v2 wave 3b |

## v2 Backlog (remaining, prioritized)

1. **Tags alongside categories** — single new table; biggest UX gain. Tags exist in the imported data (`TAGS=…` attr in Bookmarkninja export) but are silently dropped today.
2. **Auto-fetch metadata on save** — title/description/favicon/og:image (curl + meta-tag parse). Enables true favicons in dashboard cards (replacing the colored-initial placeholders).
3. **SQLite FTS5 full-text search** with operator syntax (`tag:`, `url:`, `before:`, `after:`).
4. **Saved searches as smart folders** — store query, render as sidebar entry. Cheap given #3.
5. **Soft-delete trash + click counter + last-visited + read/unread flag** — QoL bundle.
6. **Keyboard shortcuts + command palette** — pairs with dashboard for fast nav.
7. **HTML snapshot archiving** (single-file via `monolith`/SingleFile + Internet Archive submit). Hardest, biggest moat.
8. **Public read-only collection share + per-category RSS feed** — opaque-slug share URLs + XML feed.
9. **Pocket / Raindrop / Linkwarden JSON importers** — relevant given Pocket's 2025 sunset.
10. ✅ ~~REST API + bookmarklet + WebExtension — partially shipped (bookmarklet done; WebExtension still TBD)~~
11. ✅ ~~Grid/card view — shipped as the dashboard~~

Deferred (HARD or scope-creep): AI auto-tag/auto-summary, semantic-search embeddings, multi-user/RBAC/SSO, native mobile apps, PDF/screenshot capture, floccus backend compatibility.

## Architecture

```
01_Source/                                ← deployed payload
  index.php         Router: setup / login / api / import / quickadd / app
  .htaccess         DirectoryIndex, hide dotfiles. NO PHP-handler directive.
  lib/{db,auth,api,parser}.php + .htaccess
  views/{setup,login,app,quickadd}.php    ← quickadd is the bookmarklet target
  public/{app.css, app.js}                ← dashboard + view-toggle in app.js
  data/.htaccess                           ← server-side bookmarks.sqlite is web-blocked
03_Scripts/deploy.sh   lftp + stage-then-mirror (gitignored — has SFTP creds)
04_Exports/            user's real Bookmarkninja export (gitignored — personal)
```

Schema (v2 wave 2): `settings(key,value)`, `categories(id,name,parent_id,sort_order, color)`, `bookmarks(id,category_id,title,url,notes,sort_order,created_at)`. Per-view dashboard order + hidden set live in `settings.views_data` as JSON.

## Active Decisions
<!-- Last 5. Full history in decisions.md. -->
- 2026-05-08: **PWA + Web Share Target as canonical save-current-tab path.** New `manifest.webmanifest` declares the app installable and registers `/index.php?r=share` as a share target. Root-scope `sw.js` (minimal — install eligibility, network-first navigations). `views/share.php` mirrors `quickadd.php` structure (inline login preserves payload via hidden POSTs). Bookmarklet retained as desktop-only fallback. Browser extension deferred.
- 2026-05-08: **Bookmarklet surfaced as dedicated topbar button** (`↗ Save tools`). Out of the Import dialog. Origin hardcoded to canonical URL — no more `$_SERVER['HTTP_HOST']` drift.
- 2026-05-08: **Cache-bust assets via `?v=<filemtime>`** — single `asset()` helper in `lib/assets.php` used by all entry points. Eliminates the post-deploy hard-refresh ritual.
- 2026-05-08: **Dashboard switched to column-wrapped masonry, then promoted to per-column persistence** (3a-followup) after the post-drag repack proved disorienting in practice. Source of truth is now `view.dashboard_columns` (array of arrays of cat IDs); greedy is fallback only. No post-drag repack — cards stay where Sortable drops them. New `set_view_columns` API endpoint.
- 2026-05-08: **Card-body `max-height` raised from 360px → 70vh.** Wave-2's 360px cap solved a CSS-Grid row-bound problem that no longer exists with masonry.

## Blockers
None.

## Open Questions for Next Session
- **PWA icons** (decision G default was "skip for now"). Without `192x192` and `512x512` PNGs in `public/icons/`, the OS shows a generic placeholder when installed. Two-line `manifest.webmanifest` change once icons exist. Trivial when artwork is ready.
- Test the **Web Share Target on a real mobile device**: install the PWA on Android/iOS, share a URL from another app, confirm "Bookmarks" appears in the share sheet and the picker form opens with prefilled URL/title. Not testable from desktop alone.
- Strip `x-powered-by: PHP/8.4.20` (one-liner `header_remove("X-Powered-By");` in `index.php`).
- Wave 4 candidate (still recommended): **tags alongside categories** — biggest UX win, data already in import (`TAGS=…` attr in Bookmarkninja export currently dropped).

---
*Source of truth for project position. Keep under 100 lines.*
