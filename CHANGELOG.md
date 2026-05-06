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

### Known issue
- First deploy attempt (`bd02f04` → live) failed: Strato served `index.php` as a download instead of executing it (`Content-Type: application/x-httpd-php` returned the source verbatim). Cause: PHP not enabled for the `bookmarks.lucesumbrarum.com` subdomain in Strato's hosting control panel. Fix: enable PHP 8 for the subdomain in Strato's UI, then re-run `./03_Scripts/deploy.sh`. No code change needed.

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
