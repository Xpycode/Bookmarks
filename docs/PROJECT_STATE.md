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
- **Phase:** v2 wave 2 shipped (dashboard rebuild — drag, colors, hide, named views), fine-tuning next.
- **Focus:** User-driven fine-tuning of the live dashboard. Then pick wave 3 from backlog (recommended trio still tags → auto-fetch metadata → FTS5).
- **Status:** ready
- **Last updated:** 2026-05-08

## Funnel Progress

| Funnel | Status | Gate |
|--------|--------|------|
| **Define** | done | Stack + scope locked. Hard constraint: PHP+SQLite, no Composer/Node, Strato-FastCGI deployable. |
| **Plan** | done | 25-manager landscape research → Top-10 backlog. |
| **Build** | active | v1 live with 609 imported bookmarks. v2 wave 2 dashboard live (uncommitted on main). |

## Shipped (v1 + v2 waves 1–2)

| Capability | Where |
|------------|-------|
| Nested categories with drag-to-reparent | v1 |
| Bookmarks: add / edit / delete / reorder / move | v1 |
| Search across title/url/notes (LIKE, debounced) | v1 |
| Dark mode (system-pref default + manual toggle) | v1 |
| Netscape HTML import — verified against real Bookmarkninja export | v1 |
| Single-user auth (bcrypt + CSRF + HttpOnly session) | v1 |
| Strato deploy (`./03_Scripts/deploy.sh` — lftp + stage-then-mirror) | v1 |
| Dashboard view (CSS-Grid card layout) | v2 wave 1 |
| Bookmarklet (`?r=quickadd` popup) | v2 wave 1 |
| Cancel-button fix (Add-bookmark dialog) | v2 wave 1 |
| **Dashboard rebuild — full-width, sidebar hidden, drag cards by header** | v2 wave 2 |
| **Drag bookmarks within and between cards** (Sortable shared group) | v2 wave 2 |
| **Right-click context menus** (bookmarks + card headers) | v2 wave 2 |
| **Per-category colors** (`<dialog>` color picker, `categories.color` column) | v2 wave 2 |
| **Hide categories per-view** (`hidden_ids` in `settings.views_data`) | v2 wave 2 |
| **Named views** (clone/rename/delete; `View: All ▾` dropdown in topbar) | v2 wave 2 |
| **Internal-scroll cards** (no `+ N more` cap; `max-height: 360px` per card body) | v2 wave 2 |

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
- 2026-05-08: **Dashboard mode hides the sidebar.** Cards are the primary nav now; tree is for list-view only. `body.dashboard-mode` class drives both sidebar visibility and the layout grid template.
- 2026-05-08: **Card colors live on the categories table; hidden-set lives in settings (per-view).** Property-of-category vs property-of-view distinction. Avoids schema rework when phase-3 added named views.
- 2026-05-08: **Named views stored as a single JSON in `settings.views_data`** (`{ views: [...], current_view_id }`). No `views` table — promote later if views grow more fields.
- 2026-05-06: **Numbered-folder layout** adopted (`01_Source/`, `03_Scripts/`, etc.) to match LUCESUMBRARUM/LEARNING/KinoBerlin. Reverses the earlier root-level decision.
- 2026-05-06: **Never add `SetHandler application/x-httpd-php` on Strato.** Strato uses PHP-FastCGI; that mod_php directive breaks execution.

## Blockers
None.

## Open Questions for Next Session
- User-driven fine-tuning of the dashboard. Topics not yet picked.
- Add cache-busting `app.js?v=<mtime>` to `views/app.php`? (Edge-vs-Safari mismatch this session was 100% browser cache.)
- Strip `x-powered-by: PHP/8.4.20` (one-liner `header_remove("X-Powered-By");` in `index.php`).
- Wave 3 scope. Recommended: tags → auto-fetch metadata → FTS5. None touched yet.

---
*Source of truth for project position. Keep under 100 lines.*
