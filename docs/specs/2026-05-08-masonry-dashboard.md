# Spec: Masonry Dashboard (v2 wave 3a)

**Status:** Approved
**Created:** 2026-05-08
**Owner:** Sim
**Companion session log:** `sessions/2026-05-08a.md` (wave 2 dashboard rebuild — predecessor)

---

## Problem

The dashboard's CSS Grid (`repeat(auto-fill, minmax(320px, 1fr))`) lays out cards in **rows**: every row's height is bounded by the tallest card in it, so short cards (DW/AI intern with 2 items, DW/MCR with 3, DW/MPS with 3) leave large vertical voids beneath them before the next row begins.

Bookmarkninja avoids this with **masonry** packing: same-width columns, but each column packs independently. Visual density goes from "row-bounded with holes" to "every card hugs the one above it in its own column."

## Decided architecture

**Column-wrapped masonry, flat-order persistence.** Render N column `<div>`s and distribute cards into them greedily (each card → currently shortest column). Each column is its own Sortable container, all sharing one group — cross-column drag is then native Sortable behavior (already used for inter-card bookmark drag).

After any drag, flatten columns back to a flat order in **zigzag reading order** (col0[0], col1[0], …, colN[0], col0[1], col1[1], …) and persist via the existing `views_data[viewId].order` API. No schema change.

### Why not the alternatives

| Rejected | Reason |
|---|---|
| Native CSS `grid-template-rows: masonry` | Safari 26 only in 2026; Edge/Chrome still flagged. Edge is the user's daily browser. |
| Flat container + absolute positioning (Muuri-style) | Conflicts with Sortable.js's drop-target detection (out-of-flow items). |
| Muuri (full library) | ~30kb, would replace Sortable, copyright stamp 2020 (maintenance unclear). |
| CSS multi-column (`columns:`) | Janky drag preview because columns reflow mid-drag. |
| Per-column persistence | More code + schema change for a v2 follow-up that may not be needed. Defer. |

### Locked decisions (from earlier conversation)

| ID | Decision |
|---|---|
| A | **Zigzag flatten** on persist (preserves left-to-right reading order) |
| B | **Cap each column at `max-width: 400px`** so single-card views don't show one giant card |
| C | **Flat `order` + greedy repack** on each load (no schema change) |
| D | **Roll our own** ~80 LOC vanilla JS (no new CDN dep beyond existing Sortable.js) |

## File-by-file changes

### `01_Source/public/app.css` — replace `.dashboard-grid` block (~10 LOC)
```css
.dashboard-grid {
    display: flex;
    gap: 16px;
    align-items: flex-start;        /* columns size to content */
}
.dash-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1 1 0;
    min-width: 0;
    max-width: 400px;               /* decision B */
}
```
Removes: `display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`.

### `01_Source/public/app.js` — add layout engine (~80 LOC new)
1. New `layoutDashboard(container)` function:
   - Read all `.dash-card` children currently in `container` (in DOM order).
   - Compute column count: `Math.max(1, Math.floor((containerW + GAP) / (COL_MIN + GAP)))`. `COL_MIN = 320`, `GAP = 16`.
   - Build N empty `<div class="dash-col">` placeholders, init heights `[0, 0, ...]`.
   - For each card, append to column with smallest tracked height; update height by `card.offsetHeight + GAP`.
   - `container.replaceChildren(...cols)`.
   - Re-arm a Sortable on each new `.dash-col` with shared `group: 'dashboard-cards'` and `handle: '.dash-card-head'` (matching current per-card drag-handle behavior).

2. Replace the existing single `Sortable(.dashboard-grid)` instance with the per-column instances created inside `layoutDashboard`.

3. Sortable `onEnd` callback:
   - Flatten current `.dash-col > .dash-card` array via zigzag (decision A).
   - PUT new flat order to existing `set_dashboard_order` API endpoint.
   - Call `layoutDashboard()` again to re-pack with updated heights.

4. Re-layout triggers (each calls `layoutDashboard`):
   - Initial dashboard render
   - `window.resize` (debounced 150ms; skip if `state.dragging === true`)
   - Sortable `onStart` sets `state.dragging = true`; `onEnd` sets `false` then calls `layoutDashboard`
   - After `add_bookmark`, `delete_bookmark`, `update_category` (color), `toggle_hidden`
   - After `switch_view` / `create_view` / `delete_view`

### `01_Source/views/app.php` — no change
The dashboard container is already `<section class="dashboard"><div class="dashboard-grid">…</div></section>`. The grid div will now contain `.dash-col` children instead of `.dash-card` children directly.

## Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| 1 | View "All" with 16 cards of varying heights | Dashboard renders | No vertical void taller than `max(card heights) - min(card heights)` exists between any two stacked cards in the same column |
| 2 | A card has 1 item, the next column's card has 12 | Layout runs | The 1-item card is followed in its column by another card, not by empty space |
| 3 | User drags card from column 4 to column 1 between two existing cards | Drop completes | Card lands at correct insertion point; columns re-pack; persisted order reflects new position |
| 4 | Window resized from 1440px to 800px | Resize fires | Column count drops (e.g. 4 → 2); cards re-distribute; no layout flash if mid-drag |
| 5 | User adds a bookmark to a card | Save completes | That card grows; lower cards in its column shift down; cards in shorter columns may shift up |
| 6 | View "At work" has 6 cards | User switches view via topbar dropdown | Dashboard re-packs with the new card subset |
| 7 | User hides a card via right-click | Hide toggles | Card disappears; remaining cards re-pack |
| 8 | Single-card view | Renders | One column of width 400px (capped); not full viewport width |
| 9 | Mobile-narrow window (<400px) | Renders | One column at full width; column cap doesn't shrink content |
| 10 | User drags in fast succession across multiple columns | Drag in progress | No double-layout race; resize handler skips while `dragging === true` |

## Manual smoke test plan (live deploy)

1. Deploy to `bookmarks.lucesumbrarum.com` via `./03_Scripts/deploy.sh`.
2. Open in Edge and Safari side-by-side.
3. Run criteria 1-10 in order, ticking each.
4. Specifically verify the `DW/AI intern` (2 items), `DW/MCR` (3 items), `DW/MPS` (3 items) voids from the wave-2 screenshot are gone.
5. Drag-test: move a card between columns 1↔5 and back; reload; verify position persists in roughly the same column (greedy repack may not place it identically — that's the documented tradeoff of decision C).

## Rollback plan

The change is contained to two files (`app.css`, `app.js`) plus one new spec doc. Rollback = revert the commit. Schema is untouched (decision C), so the SQLite DB on the server is not affected.

## Out of scope (deferred)

- Per-column persistence (would let cards stay in the column the user dropped them into across reloads). Promote to wave 3a-followup if flat repack feels disorienting in practice.
- Native CSS masonry (`grid-template-rows: masonry`) progressive enhancement. Add a `@supports` block once Chrome ships it.
- Card resize handles (pin a card to span 2 columns wide). Bookmarkninja-style; not needed for v3a.
- Auto-scroll while dragging near top/bottom of viewport. Sortable has this built-in; just need to enable.

## Effort estimate

~80 LOC new JS + ~10 LOC CSS changes + ~30 min manual smoke test on live deploy = **half a session**.

## Decisions to log on completion

→ `decisions.md`:
- "Dashboard switched from CSS Grid to column-wrapped masonry; flat-order persistence retained for v3a."
- "Each column capped at 400px max-width to prevent single-card views from spanning the full viewport."

→ `PROJECT_STATE.md`:
- Mark wave 3a shipped under "Shipped"
- Add masonry capability row
- Update phase note
