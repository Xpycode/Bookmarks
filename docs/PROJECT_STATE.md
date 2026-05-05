# Project State

> **Size limit: <100 lines.** Digest, not archive. Detail goes in session logs.

## Identity
- **Project:** Bookmarks
- **One-liner:** Self-hosted single-user bookmark manager for Strato shared hosting — PHP 8 + SQLite, vanilla JS, zero build step.
- **Tags:** web, php, sqlite, self-hosted, bookmark-manager, strato
- **Started:** 2026-05-05
- **Repo:** github.com/Xpycode/Bookmarks
- **Working branch:** `claude/bookmark-manager-import-juSnx`

## Current Position
- **Funnel:** plan
- **Phase:** v1-shipped, picking v2 scope
- **Focus:** Decide which items from `research/2026-05-05-bookmark-manager-landscape.md` Top-10 list to bring into v2.
- **Status:** ready
- **Last updated:** 2026-05-05

## Funnel Progress

| Funnel | Status | Gate |
|--------|--------|------|
| **Define** | done | Stack + scope locked in initial session (PHP+SQLite, single-user, Strato) |
| **Plan** | active | Researched 25 competing managers; need to pick v2 scope |
| **Build** | done (v1) | Working app on the claude branch — categories, drag&drop, search, dark mode, import, auth |

## v1 Scope (shipped)

| Capability | Status |
|------------|--------|
| Nested categories with drag-to-reparent | ✅ |
| Bookmarks: add / edit / delete / reorder / move | ✅ |
| Search across title/url/notes (LIKE, debounced) | ✅ |
| Dark mode (system-pref default + manual toggle) | ✅ |
| Netscape HTML import (Chrome/Firefox/Safari/Bookmarkninja) | ✅ |
| Single-user auth (bcrypt + CSRF + HttpOnly session) | ✅ |
| Strato deploy via FTP (no Composer / no Node) | ✅ |

## v1 Non-Goals (deliberately out)
Tags, favicons, multiple dashboards, sync, multi-user, AI features, PDF/screenshot archiving, password-reset UI, browser extension.

## v2 Candidate Backlog (from research, prioritized)

1. **Tags alongside categories** — single new table, big flexibility gain.
2. **Auto-fetch metadata on save** — title/description/favicon/og:image (curl + meta-tag parse).
3. **SQLite FTS5 full-text search** with operator syntax (`tag:`, `url:`, `before:`, `after:`).
4. **REST API + bookmarklet + WebExtension** — "save from anywhere" path.
5. **Saved searches as smart folders** — store query, render as sidebar entry. Free given #3.
6. **Soft-delete trash + click counter + last-visited + read/unread flag** — QoL bundle.
7. **Grid/card view + keyboard shortcuts + command palette** — UX modernization. Builds on #2.
8. **HTML snapshot archiving** (single-file via `monolith`/SingleFile + Internet Archive submit). Hardest, biggest moat.
9. **Public read-only collection share + per-category RSS feed** — opaque-slug share URLs + XML feed.
10. **Pocket / Raindrop / Linkwarden JSON importers** — relevant given Pocket's 2025 sunset.

Deferred (HARD or scope-creep): AI auto-tag/auto-summary, semantic-search embeddings, multi-user/RBAC/SSO, native mobile apps, PDF/screenshot capture, floccus backend compatibility.

## Architecture (current)

```
index.php           Router: setup / login / api / import / app
lib/db.php          PDO SQLite + schema bootstrap (settings, categories, bookmarks)
lib/auth.php        Session, bcrypt, CSRF
lib/api.php         JSON API (POST, X-CSRF-Token required for mutations)
lib/parser.php      Netscape HTML parser + tree-to-DB importer
views/              setup.php, login.php, app.php (UI shell)
public/             app.css, app.js (Sortable.js from jsDelivr)
data/               bookmarks.sqlite (web-blocked via .htaccess)
docs/               Directions + research + session logs
```

Schema: `settings(key,value)`, `categories(id,name,parent_id,sort_order)`, `bookmarks(id,category_id,title,url,notes,sort_order,created_at)`. WAL + foreign keys ON.

## Active Decisions
<!-- Last 3-5. Full history in decisions.md -->
- 2026-05-05: Stack = PHP 8 + SQLite + vanilla JS, no build step. Constraint: must run on Strato shared hosting.
- 2026-05-05: Single-user only for v1 (multi-user/SSO deferred indefinitely).
- 2026-05-05: Netscape HTML the canonical import format; preserves folder hierarchy verbatim.
- 2026-05-05: Search uses LIKE for v1; FTS5 deferred until dataset growth justifies it.
- 2026-05-05: Strict separation — `data/` and `lib/` web-blocked via `.htaccess`.

## Blockers
<!-- Empty = good. -->


## Resume
<!-- If RESUME.md exists, note it here. -->


## Open Questions for Next Session
- Confirm Bookmarkninja export parses correctly against the user's actual file (parser tested only on synthetic HTML).
- Pick the v2 wave: top suspects are (1) tags + (2) auto-fetch metadata + (3) FTS5 — the three reinforce each other.
- Decide whether to keep working on `claude/bookmark-manager-import-juSnx` or branch off `feature/v2-*`.

---
*Source of truth for project position. Keep under 100 lines.*
