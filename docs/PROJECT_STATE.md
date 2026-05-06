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
- **Phase:** v2 wave 1 shipped, picking wave 2
- **Focus:** Verify wave 1 in browser (dashboard, bookmarklet, Cancel-button fix), then pick wave 2 from the v2 backlog. Recommended trio: tags → auto-fetch metadata → FTS5.
- **Status:** ready
- **Last updated:** 2026-05-06

## Funnel Progress

| Funnel | Status | Gate |
|--------|--------|------|
| **Define** | done | Stack + scope locked. Hard constraint: PHP+SQLite, no Composer/Node, Strato-FastCGI deployable. |
| **Plan** | done | 25-manager landscape research → Top-10 backlog. |
| **Build** | active | v1 live with 609 imported bookmarks. v2 wave 1 deployed `d637d64`. |

## Shipped (v1 + v2 wave 1)

| Capability | Where |
|------------|-------|
| Nested categories with drag-to-reparent | v1 |
| Bookmarks: add / edit / delete / reorder / move | v1 |
| Search across title/url/notes (LIKE, debounced) | v1 |
| Dark mode (system-pref default + manual toggle) | v1 |
| Netscape HTML import — verified against real Bookmarkninja export | v1 |
| Single-user auth (bcrypt + CSRF + HttpOnly session) | v1 |
| Strato deploy (`./03_Scripts/deploy.sh` — lftp + stage-then-mirror) | v1 |
| **Dashboard view** (CSS-Grid card layout, all categories at once) | v2 wave 1 |
| **Bookmarklet** (popup-with-mini-form pattern: `?r=quickadd`) | v2 wave 1 |
| **Cancel-button bug fix** (Add-bookmark dialog) | v2 wave 1 |

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

Schema unchanged from v1: `settings(key,value)`, `categories(id,name,parent_id,sort_order)`, `bookmarks(id,category_id,title,url,notes,sort_order,created_at)`.

## Active Decisions
<!-- Last 5. Full history in decisions.md. -->
- 2026-05-06: **Numbered-folder layout** adopted (`01_Source/`, `03_Scripts/`, etc.) to match LUCESUMBRARUM/LEARNING/KinoBerlin. Reverses the earlier root-level decision.
- 2026-05-06: **Never add `SetHandler application/x-httpd-php` on Strato.** Strato uses PHP-FastCGI; that mod_php directive breaks execution. Verified across three working PHP sites with zero handler directives.
- 2026-05-06: **Dashboard pattern: uniform card grid, NOT bento.** 20 same-class categories want consistent tiles, not asymmetric hero/spec layout. CSS Grid `repeat(auto-fill, minmax(320px, 1fr))` for natural responsive flow.
- 2026-05-06: **Bookmarklet pattern: popup-with-mini-form (the standard).** Self-contained `views/quickadd.php` handles its own auth so URL/title query params survive the login redirect. Reuses existing `add_bookmark` API.
- 2026-05-06: **Imported the real 609-bookmark Bookmarkninja export.** Parser preserves folder hierarchy + notes; silently drops `TAGS=` and `ADD_DATE=` attributes (planned re-import once tags land in schema).

## Blockers
None.

## Open Questions for Next Session
- Verify wave 1 in the browser (especially: bookmarklet drag in Safari, dashboard with the 17 leaf categories, dashboard refresh after sidebar actions).
- Pick wave 2 scope. Recommended: **tags first**, then re-import the export to backfill tags from the original `TAGS=` attribute. Auto-fetch metadata can come right after to give cards real favicons.
- Decide: keep `+ N more` cards at natural height (current), or normalize to `min-height: 280px` so footer rows align across columns?
- Silence `x-powered-by: PHP/8.4.20` header? (one-liner `header_remove("X-Powered-By");` in index.php.)

---
*Source of truth for project position. Keep under 100 lines.*
