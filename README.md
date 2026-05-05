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

## Deploy to Strato (FTP)

1. Upload the entire repository to a directory under your domain (e.g. `/bookmarks/` or the document root of a subdomain).
2. Make sure the `data/` directory is writable by PHP. On Strato shared hosting it usually is by default; if not, `chmod 755 data` via FTP.
3. Visit your URL in the browser. You'll see the **first-run setup** page — pick a password (≥ 8 characters).
4. After setup you're logged in. Click **Import** to upload your existing bookmark HTML.

The SQLite database is stored at `data/bookmarks.sqlite`. It is blocked from direct web access by `data/.htaccess`. Back it up by downloading that single file.

## Updating later

Replace the PHP/JS/CSS files via FTP. Don't overwrite `data/`.

## Project layout

```
index.php           Router (login, setup, API, import, app)
lib/
  db.php            SQLite connection + schema
  auth.php          Session, password, CSRF
  api.php           JSON API handlers
  parser.php        Netscape HTML bookmark parser + tree importer
views/
  setup.php         First-run password setup
  login.php         Sign-in form
  app.php           Main UI shell
public/
  app.css           Styles (light + dark)
  app.js            Frontend (categories, bookmarks, search, drag&drop)
data/               SQLite DB lives here (web-blocked)
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

There's no "forgot password" — it's a single-user, locally-stored hash. To reset without losing data, open `data/bookmarks.sqlite` in any SQLite client and run:

```sql
DELETE FROM settings WHERE key = 'password_hash';
```

Then revisit the site to set a new one. To wipe everything, just delete `data/bookmarks.sqlite` and run setup again.
