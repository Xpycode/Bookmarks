# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.

## [Unreleased]

### Added
- `CLAUDE.md` at repo root with locked-in stack constraints and architecture pointer.
- `docs/PROJECT_STATE.md`, `docs/decisions.md`, `docs/sessions/_index.md` seeded for this project.
- `docs/research/2026-05-05-bookmark-manager-landscape.md` — competitive landscape survey of ~25 bookmark managers, with a Top-10 prioritized additions list driving the v2 backlog.
- `CHANGELOG.md` (this file).
- `03_Scripts/deploy.sh` (gitignored — has SFTP creds): `lftp mirror` upload of `01_Source/` to `bookmarks.lucesumbrarum.com` on Strato. Pattern matches LUCESUMBRARUM/LEARNING.

### Changed
- **Reorganized to numbered-folder layout** (`01_Source/`, `02_Design/`, `03_Screenshots/`, `03_Scripts/`, `04_Exports/`) to match the convention used across the user's other websites (LUCESUMBRARUM, LEARNING, KinoBerlin). The PHP app subtree (`index.php`, `.htaccess`, `lib/`, `views/`, `public/`, `data/`) moved into `01_Source/` together — `__DIR__` requires still resolve correctly because the whole subtree moved as one unit.
- LLM-Directions framework files (`00_*.md` … `60_*.md`, `commands/`, `cookbook/`, `hooks/`, `mcp-templates/`, `scripts/`, `skills/`, `specs/`, `AGENTS.md`, `CLAUDE-GLOBAL-TEMPLATE.md`, `Directions-CURRICULUM.md`, `PATTERNS-COOKBOOK.md`, `README.md`, `RESUME.md`, `TASKS.md`, `tasks-archive.md`, `ideas.md`, `install-directions.sh`, `IMPLEMENTATION_PLAN-template.md`, `LICENSE`, `.claude-plugin/`, `.cowork.yml`) gitignored from this repo. They stay on disk for Claude reference but no longer pollute git history. `docs/` now tracks only project-authored files (~10 files instead of 175).
- Root `.gitignore`: ignore `.claude/` and `.fastembed_cache/`. SQLite-DB ignore patterns updated to `01_Source/data/*.sqlite*`.
- `docs/.gitignore`: dropped the `sessions/*.md` rule that the LLM-Directions framework ships with (that rule is right for the framework's own repo, wrong for a consuming project where session logs are the tracked artifact). Replaced with the "ignore-everything-except-project-files" pattern above.
- Renamed `docs/sessions/session-2026-05-05T11-55-38Z.md` → `docs/sessions/2026-05-05a.md` for naming consistency with the per-day suffix convention.
- Moved `docs/feature-research-2026-05-05T12-04-18Z.md` → `docs/research/2026-05-05-bookmark-manager-landscape.md`.

### Known issue (resolved)
- First live deploy returned `index.php` as a download (`Content-Type: application/x-httpd-php`). **Initial diagnosis (PHP not enabled in Strato panel) was wrong.** Real cause: the v1 `.htaccess` shipped with `<FilesMatch "\.php$"> SetHandler application/x-httpd-php </FilesMatch>` — a mod_php directive. Strato uses PHP-FastCGI (verified by inspecting LUCESUMBRARUM, apps.lucesumbrarum.com, RemoteInterviewSetupGuide — three working PHP sites with zero PHP-handler directives between them). On FastCGI, that directive doesn't get ignored — Apache literally puts `application/x-httpd-php` into the response Content-Type header, so the browser downloads instead of executing. Fix: removed the entire `<FilesMatch "\.php$">` block from `01_Source/.htaccess`; PHP defaults work. `curl -I` after fix returns `text/html` + `x-powered-by: PHP/8.4.20`. Site live.

### Added (continued)
- Bug fix: Cancel button in the Add-bookmark dialog now closes the dialog. Was previously blocked by HTML5 `required`-field validation firing before the JS cancel branch could run. One-attribute fix: `formnovalidate` on the Cancel button.
- **Bookmarklet** (quickadd) — new `?r=quickadd` route + `views/quickadd.php`. Handles its own auth (preserves URL/title query params across login). Pre-filled form, category dropdown, last-used category remembered in localStorage, saves via existing `add_bookmark` API then `window.close()`. Bookmarklet UI lives in the Import dialog: a draggable styled `<a href="javascript:…">+ Bookmarks</a>` that opens a 520×640 popup.
- **Dashboard view** — new `▦ Dashboard` toggle in the topbar cycles list ⇄ dashboard (persisted in localStorage). Dashboard renders all categories with direct bookmarks as cards in a CSS-Grid `repeat(auto-fill, minmax(320px, 1fr))` layout: title (full breadcrumb path), count badge, top 7 bookmarks, "+ N more" button. Cards rendered in tree order (depth-first traversal). Click card header → drills into list view of that category.

---

## [0.1.0] — 2026-05-05

First working build. Self-hosted single-user bookmark manager for Strato shared hosting.

### Added
- PHP 8 + SQLite backend with `pdo_sqlite`, WAL mode, foreign keys ON.
- Schema: `settings`, `categories` (nested via `parent_id`), `bookmarks`.
- Single-user auth: bcrypt password set on first visit, HttpOnly + SameSite=Lax session cookie, CSRF token via `hash_equals` on every mutating endpoint, 500 ms throttle on failed logins.
- `.htaccess` deny rules for `data/` and `lib/` (defense in depth).
- JSON API at `index.php?r=api&action=…` — list, search, add/rename/delete/reorder for both categories and bookmarks. CSRF-required for mutations.
- Netscape HTML import (`index.php?r=import`) — tag-walk parser preserving folder hierarchy verbatim. Import wrapped in a transaction with rollback on failure. Top-level orphans land in an auto-created `Imported` category. Tested against synthetic HTML; not yet validated against a real Bookmarkninja export.
- Frontend: vanilla JS + CSS, dark-mode toggle (system-pref default + manual), Sortable.js 1.15.2 from jsDelivr CDN for drag & drop, debounced search.
- Drag & drop: reorder categories, reparent categories, reorder bookmarks within a category, move bookmarks between categories.
- Deploy via FTP to Strato. No Composer, no Node, no MySQL.
