# Spec: Bookmarklet UX bundle (v2 wave 3b)

**Status:** Approved (T1) / Pending design Qs (T2)
**Created:** 2026-05-08
**Owner:** Sim
**Predecessor:** `specs/2026-05-08-masonry-dashboard.md` (wave 3a — masonry)

---

## Problem

Two related but separable UX gaps in the "save current tab" flow:

1. **T1 — Discoverability.** The bookmarklet shipped in v2 wave 1 but lives inside the `#import-dialog` (`views/app.php:117-130`), reached only by clicking the "Import" topbar button. Even the project owner forgot it existed.
2. **T2 — CSP-blocked sites + mobile.** Bookmarklets fail silently on a growing fraction of modern sites (GitHub, X, banking, Gmail) because of strict Content-Security-Policy. They also have no integration with iOS/Android/Windows native share sheets.

## Decided architecture

### T1 — Dedicated topbar entry
- New "+ Save…" or `↗` button in `.topbar-right` (between `Import` and `theme-toggle`).
- Opens a small dedicated `#bookmarklet-dialog` containing only the draggable bookmarklet link, the current install instructions, and (later) a "Share Target" block when T2 ships.
- Move the bookmarklet section *out* of `#import-dialog`. Import dialog goes back to being only about file import.
- Keep the existing `?r=quickadd` route untouched. T1 is purely surfacing.

### T2 — PWA + Web Share Target

Add four small things, all fitting the no-Node/no-build-step constraint:

1. **`01_Source/manifest.webmanifest`** — declares the app as a PWA and registers a share target:
   ```json
   {
     "name": "Bookmarks",
     "short_name": "Bookmarks",
     "start_url": "/index.php",
     "display": "standalone",
     "background_color": "#0f1115",
     "theme_color": "#0f1115",
     "icons": [
       { "src": "public/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "public/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ],
     "share_target": {
       "action": "/index.php?r=share",
       "method": "POST",
       "enctype": "multipart/form-data",
       "params": { "title": "title", "text": "text", "url": "url" }
     }
   }
   ```
2. **`01_Source/sw.js`** — minimal service worker (~25 LOC). Required for installability; otherwise iOS/Android won't show "Add to Home Screen". Caches the app shell only; lets API calls go straight to the network. No offline functionality.
3. **`<link rel="manifest" href="manifest.webmanifest">`** in `views/app.php` (and `views/quickadd.php`/`views/login.php` for installability from any entry point). `navigator.serviceWorker.register('/sw.js')` boot in `app.js`.
4. **`r=share` route** in `index.php` → new `views/share.php`. POST handler that accepts the share-sheet's `title`/`text`/`url` form fields. Behaves like `quickadd.php` but with POST — auth-aware, CSRF-aware, category-picker, last-category remembered. **Shares the auth-and-form code with `quickadd.php` via a new `views/_addbookmark-form.php` partial** to avoid duplication.

### Why this combo (recap from research)

| Mechanism | CSP-safe | Mobile share sheet | Build step | Effort |
|---|---|---|---|---|
| Bookmarklet (T1 surface only) | ❌ | ❌ | n/a (already shipped) | 30 min |
| **PWA Share Target (T2)** | ✅ | ✅ (Android, iOS-via-PWA, Windows Edge) | None | ~half session |
| Browser extension (deferred wave 4+) | ✅ | ❌ desktop-only | None for MV3 | 1-2 sessions |

T1 + T2 together cover ~95% of real-world "save the page I'm looking at" cases.

## Open design questions (need ratification before T2 implementation)

| ID | Question | Default proposal |
|---|---|---|
| **E** | App name in manifest — `"Bookmarks"` (clean) or `"Lucesumbrarum Bookmarks"` (disambiguates if you ever install multiple)? | `"Bookmarks"`, `"short_name": "Bookmarks"` |
| **F** | Theme color — pull from existing CSS `--bg` (`#0f1115`-ish) or use the dashboard accent (the blue active-button color)? | `#0f1115` (matches the OS chrome to the app's dark background; less visual disruption when launched from home screen) |
| **G** | **Icons** — generate via tool (e.g., a 1-letter "B" on the dark bg), borrow from elsewhere, or skip and let the OS show a default? | Generate two simple 192/512 PNGs server-side once during deploy. Or: I write a tiny `03_Scripts/make-icons.sh` that uses ImageMagick (assumed available locally — Strato won't run it). Or: skip for now, ship without icons; iOS/Android will show a generic placeholder. **Cheapest first option: ship without, add later.** |
| **H** | After share, show category picker (consistent with bookmarklet) or auto-save to last-used category (one-tap)? | **Show picker** — consistent with bookmarklet, predictable. Add "auto-save to last category" as an explicit checkbox later if the picker step feels heavy. |
| **I** | Service worker cache strategy — cache app shell (HTML/CSS/JS) for offline UI shell, or no-cache (fetch always)? | **Cache app shell only.** Stale-while-revalidate on the cached shell so updates roll in within one navigation, but the app loads instantly even on flaky mobile data. API calls always go to network. |
| **J** | Where to put the manifest tag — `app.php` only (logged-in users install it) or every entry point (`login.php`, `quickadd.php` too)? | **Every entry point.** Otherwise a user who's never logged in can't install it. Manifest is static-served, no risk. |

## File-by-file diff

### T1 (this turn)
- `01_Source/views/app.php` — extract bookmarklet block out of `#import-dialog`, into new `#bookmarklet-dialog`. Add `id="bookmarklet-btn"` topbar button. ~10 LOC moved + 1 LOC new.
- `01_Source/public/app.js` — wire `#bookmarklet-btn` to open `#bookmarklet-dialog`. ~3 LOC near other dialog wiring.
- `01_Source/public/app.css` — minor: ensure `.bookmarklet-link` styling still works in standalone dialog (likely zero changes; styles are on the link itself).

### T2 (after ratification)
- `01_Source/manifest.webmanifest` — new file
- `01_Source/sw.js` — new file
- `01_Source/views/app.php`, `login.php`, `quickadd.php` — add `<link rel="manifest">`, `<meta name="theme-color">`, apple-touch-icon link
- `01_Source/public/app.js` — `navigator.serviceWorker.register()` boot
- `01_Source/index.php` — add `r=share` route handler
- `01_Source/views/share.php` — new (POST-handling sibling of `quickadd.php`)
- `01_Source/views/_addbookmark-form.php` — new partial extracted from quickadd, reused by share. Contains the category-picker + form rendering JS.
- `01_Source/public/icons/icon-192.png`, `icon-512.png` — depending on decision G

## Acceptance criteria

### T1
1. Bookmarklet button visible in topbar, between Import and theme toggle.
2. Click opens dedicated dialog showing only the draggable link + drag instructions.
3. Import dialog no longer contains the bookmarklet section.
4. Existing dragged bookmarklets in users' bookmark bars continue to work unchanged (URL is identical).

### T2
5. `manifest.webmanifest` validates against [W3C Manifest spec](https://www.w3.org/TR/appmanifest/).
6. Service worker registers without errors in DevTools → Application → Service Workers.
7. Chrome on Android / Edge on Windows shows "Install Bookmarks" install prompt after first navigation.
8. Once installed, sharing a URL from any other app surfaces "Bookmarks" in the system share sheet.
9. Tapping "Bookmarks" from share sheet → app opens to category-picker form pre-filled with shared URL/title.
10. Save → bookmark created in chosen category → app navigates to the category's list view (or closes share intent if launched from share sheet).

## Smoke test plan

### T1
- Click new "+" topbar button → dialog opens with draggable link → drag to bookmark bar → click on any external page → quickadd popup works.
- Click "Import" → only file import form (no bookmarklet section).

### T2
- Chrome DevTools → Application → Manifest → no errors.
- Lighthouse PWA audit → installable.
- Android Chrome: "Install app" appears in 3-dot menu after first navigation.
- Share a URL from another app → Bookmarks appears in target list → share → form opens with prefilled URL → category selected → save → success.

## Rollback plan

T1 is contained to two file edits — revert is single commit.
T2 adds 5 new files; revert removes them and the `<link rel="manifest">` references. No schema change. No database touched. No data migration.

## Out of scope (deferred)

- Browser extension (wave 4+ if needed)
- Auto-fetch metadata when sharing (use shared `text` field as notes; auto-fetch is its own backlog item)
- Offline mode for the full app (just the shell; full offline needs IndexedDB sync layer — large)
- iOS-specific share sheet limitations (iOS share targets via PWA work but require "Add to Home Screen" — can't be triggered programmatically)

## Effort estimate

- T1: ~30 min including deploy + smoke test
- T2: ~2-3 hours including manifest, service worker, share route, share view, form-partial extraction, icons (if doing)
- Total: half a session for T1 + full session for T2

## Decisions to log on completion

→ `decisions.md`:
- "Bookmarklet surfaced as dedicated topbar button; Import dialog scoped back to file-import only."
- "PWA + Web Share Target shipped as the canonical save-current-tab path on mobile and CSP-blocked sites; bookmarklet retained as the desktop fallback for users who haven't installed the PWA."
- (If applicable) "Service worker scope is app-shell-only; API calls bypass cache."
