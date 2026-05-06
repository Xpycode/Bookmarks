# Bookmarks

Self-hosted single-user bookmark manager. PHP 8 + SQLite, vanilla JS frontend, no build step. Designed to drop onto Strato shared hosting (Basic Starter / PowerPaket) via FTP.

## Features

- **Categories** with arbitrary nesting, expand/collapse, per-category bookmark count.
- **Drag & drop** to reorder categories, reorder bookmarks within a category, and move bookmarks between categories (drag onto a category in the sidebar).
- **Search** across title, URL and notes.
- **Dark mode** toggle (remembered in localStorage; defaults to system preference).
- **Import** Netscape-format bookmark HTML files (Chrome, Firefox, Safari, Bookmarkninja). Folder structure is preserved.
- **Single-user login** with bcrypt password set on first visit. CSRF-protected mutating endpoints, HTTP-only session cookie.

## Requirements

- PHP 8.0+ with `pdo_sqlite` (default on Strato shared hosting).
- Apache `.htaccess` support (default on Strato).
- Nothing else — no Composer, no Node, no MySQL.

## Deploy to Strato

Use `./03_Scripts/deploy.sh`. It uses `lftp` over SFTP, mirrors `01_Source/`
to the subdomain's docroot, normalizes file perms (644/755), and never touches
the server's `data/bookmarks.sqlite` (the file is excluded from the stage).

Manual fallback: SFTP-upload everything in `01_Source/` to your domain's
docroot. Make sure `data/` is writable by PHP (Strato grants this by default).

Visit the URL in a browser. You'll see the **first-run setup** page — pick a
password (≥ 8 characters). After setup you're logged in; click **Import** to
upload your existing bookmark HTML.

The SQLite database lives at `data/bookmarks.sqlite` (web-blocked via
`data/.htaccess`). Back it up by downloading that one file via SFTP.

## Updating later

Just re-run `./03_Scripts/deploy.sh`. The DB on the server is preserved.

## Project layout

The deployable PHP app lives under `01_Source/`. The other top-level folders
are organizational placeholders shared with the project's sibling websites.

```
01_Source/            ← Everything in here gets deployed.
  index.php           Router (login, setup, API, import, app)
  .htaccess           DirectoryIndex, PHP handler, hide dotfiles
  lib/
    db.php            SQLite connection + schema
    auth.php          Session, password, CSRF
    api.php           JSON API handlers
    parser.php        Netscape HTML bookmark parser + tree importer
    .htaccess         Deny direct access to PHP includes
  views/
    setup.php         First-run password setup
    login.php         Sign-in form
    app.php           Main UI shell
  public/
    app.css           Styles (light + dark)
    app.js            Frontend (categories, bookmarks, search, drag&drop)
  data/
    .htaccess         Deny all (web-blocks the SQLite file)
    bookmarks.sqlite  Created on first visit; gitignored.
03_Scripts/
  deploy.sh           SFTP deploy via lftp (gitignored — contains creds)
02_Design/, 03_Screenshots/, 04_Exports/   placeholders (mirror sibling projects)
docs/                 Project documentation
```

## API endpoints (all under `index.php?r=api&action=…`)

POST JSON; mutating actions require `X-CSRF-Token` header.

| Action | Body | Notes |
| --- | --- | --- |
| `list` | — | Returns `{categories, bookmarks}` |
| `add_category` | `{name, parent_id?}` | |
| `rename_category` | `{id, name}` | |
| `delete_category` | `{id}` | Cascades to children + bookmarks |
| `reorder_categories` | `{parent_id, ids[]}` | Sets order and parent in one call |
| `add_bookmark` | `{category_id, title?, url, notes?}` | |
| `update_bookmark` | `{id, title?, url, notes?}` | |
| `delete_bookmark` | `{id}` | |
| `reorder_bookmarks` | `{category_id, ids[]}` | Used for both reorder and move |
| `search` | `{q}` | LIKE on title/url/notes, max 200 results |

Import is `POST index.php?r=import` with multipart `file` field plus `csrf` token.

## Resetting the password

There's no "forgot password" — it's a single-user, locally-stored hash. To reset without losing data, open `01_Source/data/bookmarks.sqlite` (or the one on the server, downloaded via SFTP) in any SQLite client and run:

```sql
DELETE FROM settings WHERE key = 'password_hash';
```

Then revisit the site to set a new one. To wipe everything, delete `data/bookmarks.sqlite` and run setup again.
