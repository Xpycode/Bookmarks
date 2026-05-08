# Session History — Bookmarks

## Active Project
Bookmarks — self-hosted PHP+SQLite bookmark manager for Strato shared hosting.

## Current Status
→ See [PROJECT_STATE.md](../PROJECT_STATE.md)

## Sessions

| Date | Focus | Outcome | Log |
|------|-------|---------|-----|
| 2026-05-05 11:55 UTC | Build v1 from scratch (PHP 8 + SQLite) | Shipped working app — categories, drag&drop, search, dark mode, Netscape HTML import, single-user auth. Smoke-tested parser end-to-end. Committed `f4c0e9a` to `claude/bookmark-manager-import-juSnx`. | [log](2026-05-05a.md) |
| 2026-05-05 12:04 UTC | Survey bookmark-manager landscape, propose v2 backlog | Reviewed ~25 competing managers. Produced Top-10 prioritized additions list (tags, auto-fetch metadata, FTS5, REST API+bookmarklet, etc.). Committed `669f178` adding [feature-research](../research/2026-05-05-bookmark-manager-landscape.md). | (no separate session log — research doc is the artifact) |
| 2026-05-05 (session c) | Set up Directions on top of imported repo; commit + merge to main + push | Cloned `claude/bookmark-manager-import-juSnx` into local working dir. Installed Directions in `docs/`. Seeded `PROJECT_STATE.md` and `decisions.md` from prior session log + research doc. Committed `bd02f04` (172 files, 30 K insertions). Fast-forwarded `main` from `93739d3` → `bd02f04` and pushed both branches to origin. | [log](2026-05-05c.md) |
| 2026-05-06 (session a) | Ship deploy script, fix PHP-not-executing on Strato, reorg into numbered folders, untrack framework, import 609 real bookmarks, plan v2 dashboard | Wrote `03_Scripts/deploy.sh` (lftp + stage-then-mirror, LEARNING-pattern). First deploy "succeeded" but Strato served `index.php` as a download — diagnosed by comparing `.htaccess` against three working PHP sites (LUCESUMBRARUM, apps.lucesumbrarum.com, RemoteInterviewSetupGuide), all of which have NO PHP-handler directive. The `SetHandler application/x-httpd-php` line we shipped was the bug on FastCGI. Removed it, redeployed, site live (PHP 8.4.20). Same session: reorg into `01_Source/`/`03_Scripts/`/etc. to match other 3-Websites projects, untracked 164 LLM-Directions framework files (`docs/` 175→8 tracked), imported user's real Bookmarkninja export (20 categories + 609 bookmarks). | [log](2026-05-06a.md) |
| 2026-05-08 (session a) | v2 wave 2 — full dashboard rebuild | Diagnosed the wave-1 dashboard toggle bug (3 children flowing into a 2-col grid). Rebuilt as a draggable Bookmarkninja-style card wall: sidebar hidden in dashboard mode, drag cards by header (Sortable.js), drag bookmarks within and between cards (shared group), card body scrolls internally above 360px (no more `+ N more`), right-click menus on cards and bookmarks, per-category colors via `<dialog>` picker (Safari blocks programmatic OS pickers on offscreen inputs), per-view hide, **named views** with clone/rename/delete in a topbar dropdown. Five live deploys. One regression caught: `state.hiddenIds` reference left over after state-shape change — empty grid with populated meta line was the giveaway. | [log](2026-05-08a.md) |

---

## Session Log Template

When starting a new session, create a file: `sessions/YYYY-MM-DD[a|b|c].md`

```markdown
# Session: [Date] [a/b/c]

## Goal
[What we're trying to accomplish]

## Context
- Previous session: [link or summary]
- Current phase: [discovery|planning|implementation|polish|shipping]

## Progress

### Completed
- [x] [What got done]

### In Progress
- [ ] [What's being worked on]

### Discovered
- [New things learned]

### Decisions Made
- [Decision] → logged in decisions.md

### Blockers
- [Anything blocking progress]

## Next Session
- [What to do next]

## Notes
[Anything else worth remembering]
```

---
*One log per session. Link from here.*
