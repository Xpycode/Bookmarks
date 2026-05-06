# Bookmarks — Claude Project Instructions

Self-hosted single-user bookmark manager. Replacement for Bookmarkninja, deployable to **Strato shared hosting** (Basic Starter / PowerPaket) via FTP.

> Full project context lives in [`docs/00_base.md`](docs/00_base.md). Live state in [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md). Decisions in [`docs/decisions.md`](docs/decisions.md). Competitive landscape research in [`docs/research/2026-05-05-bookmark-manager-landscape.md`](docs/research/2026-05-05-bookmark-manager-landscape.md).

## Tech Stack (locked in v1)

- **Backend:** PHP 8.0+ with `pdo_sqlite`. No Composer.
- **Database:** SQLite (single file at `data/bookmarks.sqlite`, WAL mode, foreign keys ON).
- **Frontend:** Vanilla JS + CSS. **No build step. No Node.** Sortable.js 1.15.2 loaded from jsDelivr CDN — that's the only runtime dep.
- **Web server:** Apache with `.htaccess` (Strato default).
- **Deploy:** FTP upload of the whole repo to a Strato directory.

**Hard constraints:** anything that requires Node, Composer, MySQL, Docker, or a persistent process is out — Strato shared hosting doesn't support it.

## Folder structure

Numbered-folder convention shared across all `3-Websites/*` projects:

```
Bookmarks/
├── 01_Source/             ← THE PHP APP (everything that gets deployed)
│   ├── index.php          Router: setup / login / api / import / app
│   ├── .htaccess          DirectoryIndex, hide dotfiles, PHP handler
│   ├── lib/
│   │   ├── db.php         PDO SQLite + schema bootstrap
│   │   ├── auth.php       Session, bcrypt, CSRF token
│   │   ├── api.php        JSON API (POST + X-CSRF-Token for mutations)
│   │   ├── parser.php     Netscape HTML bookmark parser + tree importer
│   │   └── .htaccess      Deny all (block direct PHP-include access)
│   ├── views/             setup.php, login.php, app.php
│   ├── public/            app.css, app.js
│   └── data/              SQLite DB (web-blocked via data/.htaccess)
├── 02_Design/             ← UI mockups / design source files (empty placeholder)
├── 03_Screenshots/        ← UI screenshots (empty placeholder)
├── 03_Scripts/
│   └── deploy.sh          gitignored — SFTP creds, lftp mirror to Strato
├── 04_Exports/            ← N/A for PHP (empty placeholder)
├── docs/                  ← project docs only (PROJECT_STATE, decisions,
│                            sessions/, research/); LLM-Directions framework
│                            files live on disk but are gitignored
├── CHANGELOG.md, CLAUDE.md, README.md, LICENSE, .gitignore
```

**Why `01_Source/`?** Matches the convention used across the user's other web
projects (LUCESUMBRARUM, LEARNING, KinoBerlin) so the work-folder layout is
the same everywhere. PHP `__DIR__` requires still work because the entire app
subtree moves together — `__DIR__` resolves to wherever the calling file lives.

API: `POST index.php?r=api&action=…`. Mutating actions require `X-CSRF-Token` header. Import: `POST index.php?r=import` (multipart, `csrf` field + `file` field).

## What Makes This Project Different (preserve)

The reference product (Bookmarkninja) succeeds on **visual recall** — a dashboard-with-tabs layout where users find bookmarks by where they put them on the page, not by search. The v1 doesn't reproduce the dashboard concept yet; it ships a sidebar+list UI. **Any v2 work that adds Tabs / pinning / multi-dashboard should preserve that "everything in view at once" pattern.**

## Working Conventions

- **Branch:** `claude/bookmark-manager-import-juSnx` is the working branch the project was imported on. Branch off `feature/<name>` for new work; never commit directly to `main`.
- **PHP style:** `declare(strict_types=1);` at the top of every file. PDO prepared statements only — never string-concat SQL. CSRF check via `hash_equals` for every mutating endpoint.
- **Frontend style:** Plain DOM API. No framework. Match the existing event-handler patterns in `public/app.js`.
- **Schema changes:** edit `lib/db.php` and add an `ALTER TABLE` in the bootstrap block (idempotent — wrap in try/catch or `IF NOT EXISTS`). There's no migration tool; the bootstrap runs every request.
- **Don't break the deploy contract:** zero new build steps, zero new server-side dependencies without explicit user confirmation.

## Testing

There's no test framework yet. For now: smoke-test parser changes against synthetic HTML; smoke-test API changes via `curl` with a real session cookie; manually exercise the UI in a browser before claiming a feature works.

## Quick Commands

- `/status` — phase, focus, blockers, last session
- `/log` — start/append today's session log
- `/decide` — append a decision to `docs/decisions.md`
- `/spec` — write a feature spec before implementing
- `/plan` — generate an implementation plan
- `/code-review` — pre-commit quality checklist
- `/security-audit` — OWASP-pattern review (relevant before exposing this to the open internet)

## Pointers

- v1 build session: `docs/sessions/2026-05-05a.md`
- v2 backlog & competitive analysis: `docs/research/2026-05-05-bookmark-manager-landscape.md`
- Deploy/operate: top-level `README.md`
- Directions framework reference: `docs/00_base.md`

## Deploy

`03_Scripts/deploy.sh` (gitignored — contains SFTP credentials) builds a stage
dir from `01_Source/`, normalizes file/dir perms to 644/755, and `lftp mirror`s
to `bookmarks.lucesumbrarum.com`. **The SQLite DB on the server is never
touched** — `01_Source/data/bookmarks.sqlite*` is excluded from the stage, so
even if the live DB existed in the local data/ dir it wouldn't ship.

Usage: `./03_Scripts/deploy.sh --dry-run` then `./03_Scripts/deploy.sh`.
