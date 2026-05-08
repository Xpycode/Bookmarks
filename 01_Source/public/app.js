(() => {
    const csrf = document.querySelector('meta[name=csrf-token]').content;

    const state = {
        categories: [],
        bookmarks: [],
        selectedCategoryId: null,
        expanded: new Set(JSON.parse(localStorage.getItem('expandedCats') || '[]')),
    };

    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

    const api = async (action, body = {}) => {
        const isMutating = action !== 'list' && action !== 'search';
        const res = await fetch(`index.php?r=api&action=${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(isMutating ? { 'X-CSRF-Token': csrf } : {}),
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API ${action}: ${res.status} ${text}`);
        }
        return res.json();
    };

    /* ---------- PWA service worker ---------- */
    // Register on load (not blocking initial render). Failure is non-fatal —
    // app works fine without the SW; install prompt and share-target just
    // become unavailable.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn('SW registration failed:', err);
            });
        });
    }

    /* ---------- Theme ---------- */
    const applyTheme = () => {
        const t = localStorage.getItem('theme');
        const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', dark);
    };
    applyTheme();
    $('#theme-toggle').addEventListener('click', () => {
        const dark = !document.documentElement.classList.contains('dark');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        applyTheme();
    });

    /* ---------- Banners ---------- */
    $$('.banner-close').forEach(b => b.addEventListener('click', e => e.target.closest('.banner').remove()));

    /* ---------- Data load ---------- */
    const load = async () => {
        const data = await api('list');
        state.categories = data.categories;
        state.bookmarks = data.bookmarks;
        state.views = Array.isArray(data.views) ? data.views : [];
        state.currentViewId = data.current_view_id ?? (state.views[0]?.id ?? null);
        renderTree();
        renderBookmarks();
        renderViewPicker();
        if (state.viewMode === 'dashboard') renderDashboard();
    };

    /* ---------- Helpers ---------- */
    const childrenOf = (parentId) =>
        state.categories.filter(c => (c.parent_id ?? null) === parentId).sort((a, b) => a.sort_order - b.sort_order);

    const bookmarksOf = (catId) =>
        state.bookmarks.filter(b => b.category_id === catId).sort((a, b) => a.sort_order - b.sort_order);

    const countDescendants = (catId) => {
        let total = bookmarksOf(catId).length;
        for (const c of childrenOf(catId)) total += countDescendants(c.id);
        return total;
    };

    const findCategory = (id) => state.categories.find(c => c.id === id);

    const categoryPath = (catId) => {
        const parts = [];
        let cur = findCategory(catId);
        while (cur) {
            parts.unshift(cur.name);
            cur = cur.parent_id ? findCategory(cur.parent_id) : null;
        }
        return parts.join(' / ');
    };

    const colorFor = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
    };

    const initialFor = (url) => {
        try {
            const u = new URL(url);
            return u.hostname.replace(/^www\./, '')[0]?.toUpperCase() || '?';
        } catch {
            return (url[0] || '?').toUpperCase();
        }
    };

    const domainFor = (url) => {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch { return url; }
    };

    const saveExpanded = () => localStorage.setItem('expandedCats', JSON.stringify([...state.expanded]));

    /* ---------- Tree render ---------- */
    const renderTree = () => {
        const root = $('#category-tree');
        root.innerHTML = '';
        renderTreeLevel(root, null);
        attachSortable(root, null);
    };

    const renderTreeLevel = (ul, parentId) => {
        ul.dataset.parent = parentId === null ? '' : parentId;
        for (const cat of childrenOf(parentId)) {
            const li = document.createElement('li');
            li.dataset.id = cat.id;
            const row = document.createElement('div');
            row.className = 'tree-row' + (state.selectedCategoryId === cat.id ? ' active' : '');
            row.dataset.id = cat.id;
            const hasChildren = childrenOf(cat.id).length > 0;
            const expanded = state.expanded.has(cat.id);
            row.innerHTML = `
                <span class="twisty">${hasChildren ? (expanded ? '▾' : '▸') : ''}</span>
                <span class="name"></span>
                <span class="count">${countDescendants(cat.id) || ''}</span>
                <span class="tree-actions">
                    <button data-action="add" title="Add subcategory">+</button>
                    <button data-action="rename" title="Rename">✎</button>
                    <button data-action="delete" title="Delete">🗑</button>
                </span>
            `;
            row.querySelector('.name').textContent = cat.name;

            row.addEventListener('click', (e) => {
                if (e.target.closest('.tree-actions') || e.target.classList.contains('twisty')) return;
                selectCategory(cat.id);
            });
            row.querySelector('.twisty').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!hasChildren) return;
                if (state.expanded.has(cat.id)) state.expanded.delete(cat.id);
                else state.expanded.add(cat.id);
                saveExpanded();
                renderTree();
            });
            row.querySelector('[data-action=add]').addEventListener('click', (e) => {
                e.stopPropagation();
                addCategory(cat.id);
            });
            row.querySelector('[data-action=rename]').addEventListener('click', (e) => {
                e.stopPropagation();
                renameCategory(cat);
            });
            row.querySelector('[data-action=delete]').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCategory(cat);
            });

            // Allow dropping bookmarks onto the category row
            row.addEventListener('dragover', (e) => {
                if (window._draggingBookmarkId) {
                    e.preventDefault();
                    row.classList.add('drag-over');
                }
            });
            row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
            row.addEventListener('drop', async (e) => {
                row.classList.remove('drag-over');
                const bid = window._draggingBookmarkId;
                if (!bid) return;
                e.preventDefault();
                const bm = state.bookmarks.find(b => b.id === bid);
                if (!bm || bm.category_id === cat.id) return;
                bm.category_id = cat.id;
                bm.sort_order = bookmarksOf(cat.id).length;
                await api('reorder_bookmarks', {
                    category_id: cat.id,
                    ids: bookmarksOf(cat.id).map(b => b.id),
                });
                renderBookmarks();
                renderTree();
            });

            li.appendChild(row);

            if (hasChildren && expanded) {
                const childUl = document.createElement('ul');
                li.appendChild(childUl);
                renderTreeLevel(childUl, cat.id);
                attachSortable(childUl, cat.id);
            }
            ul.appendChild(li);
        }
    };

    const attachSortable = (ul, parentId) => {
        new Sortable(ul, {
            group: 'categories',
            animation: 150,
            handle: '.tree-row',
            draggable: 'li',
            onEnd: async (evt) => {
                const newParentRaw = evt.to.dataset.parent;
                const newParent = newParentRaw === '' ? null : Number(newParentRaw);
                const ids = Array.from(evt.to.children).map(li => Number(li.dataset.id));
                await api('reorder_categories', { parent_id: newParent, ids });
                await load();
            },
        });
    };

    const selectCategory = (id) => {
        state.selectedCategoryId = id;
        // Auto-expand ancestors
        let cur = findCategory(id);
        while (cur && cur.parent_id) {
            state.expanded.add(cur.parent_id);
            cur = findCategory(cur.parent_id);
        }
        saveExpanded();
        renderTree();
        renderBookmarks();
    };

    /* ---------- Bookmarks render ---------- */
    const renderBookmarks = () => {
        const ul = $('#bookmark-list');
        const empty = $('#empty-state');
        const head = $('#current-cat-name');
        const addBtn = $('#add-bookmark');
        ul.innerHTML = '';

        if (!state.selectedCategoryId) {
            head.textContent = 'Select a category';
            addBtn.disabled = true;
            empty.classList.remove('hidden');
            empty.textContent = 'Pick a category on the left, or create one with the + button.';
            return;
        }
        const cat = findCategory(state.selectedCategoryId);
        head.textContent = cat ? categoryPath(cat.id) : '—';
        addBtn.disabled = false;

        const bms = bookmarksOf(state.selectedCategoryId);
        if (bms.length === 0) {
            empty.classList.remove('hidden');
            empty.textContent = 'No bookmarks here yet.';
        } else {
            empty.classList.add('hidden');
        }

        for (const bm of bms) {
            const li = document.createElement('li');
            li.className = 'bookmark';
            li.dataset.id = bm.id;
            li.draggable = true;

            const icon = document.createElement('div');
            icon.className = 'bookmark-icon';
            icon.style.background = colorFor(domainFor(bm.url));
            icon.textContent = initialFor(bm.url);

            const main = document.createElement('div');
            main.className = 'bookmark-main';
            const titleA = document.createElement('a');
            titleA.className = 'bookmark-title';
            titleA.href = bm.url;
            titleA.target = '_blank';
            titleA.rel = 'noopener noreferrer';
            titleA.textContent = bm.title;
            const urlDiv = document.createElement('div');
            urlDiv.className = 'bookmark-url';
            urlDiv.textContent = domainFor(bm.url);
            main.appendChild(titleA);
            main.appendChild(urlDiv);
            if (bm.notes) {
                const n = document.createElement('div');
                n.className = 'bookmark-notes';
                n.textContent = bm.notes;
                main.appendChild(n);
            }

            const actions = document.createElement('div');
            actions.className = 'bookmark-actions';
            actions.innerHTML = `
                <button data-action="edit" title="Edit">✎</button>
                <button data-action="delete" title="Delete">🗑</button>
            `;
            actions.querySelector('[data-action=edit]').addEventListener('click', () => editBookmark(bm));
            actions.querySelector('[data-action=delete]').addEventListener('click', () => deleteBookmark(bm));

            li.appendChild(icon);
            li.appendChild(main);
            li.appendChild(actions);

            li.addEventListener('dragstart', (e) => {
                window._draggingBookmarkId = bm.id;
                e.dataTransfer.effectAllowed = 'move';
            });
            li.addEventListener('dragend', () => { window._draggingBookmarkId = null; });

            ul.appendChild(li);
        }

        new Sortable(ul, {
            animation: 150,
            draggable: '.bookmark',
            onEnd: async () => {
                const ids = Array.from(ul.children).map(li => Number(li.dataset.id));
                await api('reorder_bookmarks', { category_id: state.selectedCategoryId, ids });
                await load();
            },
        });

    };

    /* ---------- Category actions ---------- */
    const addCategory = async (parentId) => {
        const name = prompt('Category name:');
        if (!name || !name.trim()) return;
        await api('add_category', { name: name.trim(), parent_id: parentId });
        if (parentId) state.expanded.add(parentId);
        saveExpanded();
        await load();
    };

    const renameCategory = async (cat) => {
        const name = prompt('New name:', cat.name);
        if (!name || !name.trim() || name === cat.name) return;
        await api('rename_category', { id: cat.id, name: name.trim() });
        await load();
    };

    const deleteCategory = async (cat) => {
        const desc = countDescendants(cat.id);
        const childCats = state.categories.filter(c => c.parent_id === cat.id).length;
        const msg = desc > 0 || childCats > 0
            ? `Delete "${cat.name}" and ${desc} bookmark(s) inside it? This cannot be undone.`
            : `Delete "${cat.name}"?`;
        if (!confirm(msg)) return;
        await api('delete_category', { id: cat.id });
        if (state.selectedCategoryId === cat.id) state.selectedCategoryId = null;
        await load();
    };

    $('#add-root-cat').addEventListener('click', () => addCategory(null));

    /* ---------- Bookmark actions ---------- */
    const dialog = $('#bookmark-dialog');
    const form = $('#bookmark-form');

    const openBookmarkDialog = (mode, bm = null) => {
        $('#bookmark-dialog-title').textContent = mode === 'add' ? 'Add bookmark' : 'Edit bookmark';
        form.title.value = bm?.title || '';
        form.url.value = bm?.url || '';
        form.notes.value = bm?.notes || '';
        form.dataset.mode = mode;
        form.dataset.id = bm?.id || '';
        dialog.showModal();
        setTimeout(() => form.url.focus(), 50);
    };

    form.addEventListener('submit', async (e) => {
        // Dialog form returnValue handling
        const submitter = e.submitter;
        if (submitter && submitter.value === 'cancel') {
            return;
        }
        e.preventDefault();
        const data = {
            title: form.title.value.trim(),
            url: form.url.value.trim(),
            notes: form.notes.value.trim(),
        };
        if (!data.url) return;
        if (form.dataset.mode === 'add') {
            await api('add_bookmark', { ...data, category_id: state.selectedCategoryId });
        } else {
            await api('update_bookmark', { ...data, id: Number(form.dataset.id) });
        }
        dialog.close();
        await load();
    });

    $('#add-bookmark').addEventListener('click', () => {
        if (!state.selectedCategoryId) return;
        openBookmarkDialog('add');
    });

    const editBookmark = (bm) => openBookmarkDialog('edit', bm);

    const deleteBookmark = async (bm) => {
        if (!confirm(`Delete "${bm.title}"?`)) return;
        await api('delete_bookmark', { id: bm.id });
        await load();
    };

    /* ---------- Import dialog ---------- */
    const importDialog = $('#import-dialog');
    $('#import-btn').addEventListener('click', () => importDialog.showModal());
    importDialog.querySelector('[data-close]').addEventListener('click', () => importDialog.close());

    const bookmarkletDialog = $('#bookmarklet-dialog');
    $('#bookmarklet-btn').addEventListener('click', () => bookmarkletDialog.showModal());
    bookmarkletDialog.querySelector('[data-close]').addEventListener('click', () => bookmarkletDialog.close());

    /* ---------- Search ---------- */
    const searchInput = $('#search');
    const searchResults = $('#search-results');
    let searchTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = searchInput.value.trim();
        if (!q) {
            searchResults.classList.add('hidden');
            return;
        }
        searchTimer = setTimeout(async () => {
            const data = await api('search', { q });
            renderSearchResults(data.results);
        }, 200);
    });

    searchInput.addEventListener('blur', () => setTimeout(() => searchResults.classList.add('hidden'), 200));
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() && searchResults.children.length) {
            searchResults.classList.remove('hidden');
        }
    });

    const renderSearchResults = (results) => {
        searchResults.innerHTML = '';
        if (results.length === 0) {
            const d = document.createElement('div');
            d.className = 'search-empty';
            d.textContent = 'No matches.';
            searchResults.appendChild(d);
        } else {
            for (const r of results) {
                const div = document.createElement('div');
                div.className = 'search-result';
                const icon = document.createElement('div');
                icon.className = 'bookmark-icon';
                icon.style.background = colorFor(domainFor(r.url));
                icon.textContent = initialFor(r.url);
                const main = document.createElement('div');
                main.className = 'bookmark-main';
                const t = document.createElement('div');
                t.className = 'bookmark-title';
                t.textContent = r.title;
                const u = document.createElement('div');
                u.className = 'bookmark-url';
                u.textContent = domainFor(r.url);
                const p = document.createElement('div');
                p.className = 'path';
                p.textContent = categoryPath(r.category_id);
                main.appendChild(t);
                main.appendChild(u);
                main.appendChild(p);
                div.appendChild(icon);
                div.appendChild(main);
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    window.open(r.url, '_blank', 'noopener');
                });
                searchResults.appendChild(div);
            }
        }
        searchResults.classList.remove('hidden');
    };

    /* ---------- Dashboard view ---------- */
    state.viewMode = localStorage.getItem('viewMode') || 'list';
    state.views = [];
    state.currentViewId = null;
    state.showHidden = localStorage.getItem('showHidden') === '1';
    state.dashboardDragging = false;

    // Masonry layout constants. COL_MIN matches the previous grid's minmax(320px).
    // COL_MAX (400px) is enforced via .dash-col CSS so single-card views don't
    // span the whole viewport.
    const COL_MIN = 320;
    const GAP = 16;
    let colSortables = [];

    const currentView = () => state.views.find(v => v.id === state.currentViewId) || state.views[0] || null;

    const colorForCard = (cat) => cat.color || colorFor('cat-' + cat.id);
    // The HSL fallback isn't a hex value; <input type=color> needs hex. Use a
    // neutral default for the picker if no custom color is set yet.
    const pickerInitial = (cat) => cat.color || '#5b6b7c';

    const setView = (mode) => {
        state.viewMode = mode;
        localStorage.setItem('viewMode', mode);
        document.body.classList.toggle('dashboard-mode', mode === 'dashboard');
        $('.content').classList.toggle('hidden', mode === 'dashboard');
        $('#dashboard').classList.toggle('hidden', mode !== 'dashboard');
        const toggle = $('#view-toggle');
        toggle.classList.toggle('active', mode === 'dashboard');
        toggle.title = mode === 'dashboard' ? 'Switch to list view' : 'Switch to dashboard view';
        if (mode === 'dashboard') renderDashboard();
        else closeContextMenu();
    };

    // Eligible cats = anything with at least one direct bookmark and (unless
    // showHidden is on) not in the current view's hidden set. Order them by
    // the current view's saved order, then append any new categories at the end.
    const dashboardCategories = () => {
        const view = currentView();
        if (!view) return [];
        let eligible = state.categories.filter(c => bookmarksOf(c.id).length > 0);
        const hiddenSet = new Set(view.hidden_ids || []);
        if (!state.showHidden) eligible = eligible.filter(c => !hiddenSet.has(c.id));
        const byId = new Map(eligible.map(c => [c.id, c]));
        const out = [];
        const seen = new Set();
        for (const id of (view.dashboard_order || [])) {
            if (byId.has(id)) { out.push(byId.get(id)); seen.add(id); }
        }
        for (const cat of eligible) if (!seen.has(cat.id)) out.push(cat);
        return out;
    };

    const hiddenEligibleCount = () => {
        const view = currentView();
        if (!view) return 0;
        const hiddenSet = new Set(view.hidden_ids || []);
        return state.categories.filter(c =>
            bookmarksOf(c.id).length > 0 && hiddenSet.has(c.id)
        ).length;
    };

    const setHidden = async (catId, hidden) => {
        const view = currentView();
        if (!view) return;
        const set = new Set(view.hidden_ids || []);
        if (hidden) set.add(catId); else set.delete(catId);
        view.hidden_ids = [...set];
        await api('set_view_hidden', { view_id: view.id, ids: view.hidden_ids });
        renderDashboard();
    };

    // Color picker: a real <dialog> with a visible <input type="color">.
    // Programmatic .click() on an offscreen color input is silently blocked by
    // Safari, so we open a modal instead. Save / Reset / Cancel are explicit.
    const colorDialog = $('#color-dialog');
    const colorInput = $('#color-input');
    const colorTargetLabel = $('#color-dialog-target');
    let pendingColorCat = null;

    const changeCategoryColor = (cat) => {
        pendingColorCat = cat;
        colorInput.value = pickerInitial(cat);
        colorTargetLabel.textContent = categoryPath(cat.id);
        colorDialog.showModal();
    };

    $('#color-save').addEventListener('click', async () => {
        if (!pendingColorCat) return;
        const id = pendingColorCat.id;
        const color = colorInput.value;
        pendingColorCat = null;
        colorDialog.close();
        await api('set_category_color', { id, color });
        await load();
    });
    $('#color-reset').addEventListener('click', async () => {
        if (!pendingColorCat) return;
        const id = pendingColorCat.id;
        pendingColorCat = null;
        colorDialog.close();
        await api('set_category_color', { id, color: null });
        await load();
    });
    colorDialog.querySelector('[data-close]').addEventListener('click', () => {
        pendingColorCat = null;
        colorDialog.close();
    });

    const persistDashboardOrder = (ids) => {
        const view = currentView();
        if (!view) return;
        view.dashboard_order = ids;
        api('set_view_order', { view_id: view.id, ids }).catch(err => console.error('save order:', err));
    };

    const renderDashboardMeta = (visibleCount, totalBms) => {
        const meta = $('#dashboard-meta');
        meta.replaceChildren();
        if (visibleCount > 0) {
            const txt = document.createElement('span');
            txt.textContent = `${visibleCount} categor${visibleCount === 1 ? 'y' : 'ies'} · ${totalBms} bookmark${totalBms === 1 ? '' : 's'}`;
            meta.appendChild(txt);
        }
        const hiddenN = hiddenEligibleCount();
        if (hiddenN > 0) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dash-show-hidden';
            btn.textContent = state.showHidden ? `Hide ${hiddenN} hidden` : `Show ${hiddenN} hidden`;
            btn.addEventListener('click', () => {
                state.showHidden = !state.showHidden;
                localStorage.setItem('showHidden', state.showHidden ? '1' : '0');
                renderDashboard();
            });
            meta.appendChild(btn);
        }
    };

    // After a drag, columns may contain cards in any order. Flatten to a single
    // flat ID list in zigzag (reading) order: col0[0], col1[0], …, colN[0],
    // col0[1], col1[1], …  This is the fallback flat order used when the saved
    // per-column layout can't be used (column count changed, e.g. via resize).
    const zigzagFlatten = (grid) => {
        const cols = Array.from(grid.children);
        const colCards = cols.map(col => Array.from(col.children));
        const maxRows = colCards.length ? Math.max(...colCards.map(a => a.length)) : 0;
        const ids = [];
        for (let row = 0; row < maxRows; row++) {
            for (const cards of colCards) {
                const card = cards[row];
                if (card) ids.push(Number(card.dataset.id));
            }
        }
        return ids;
    };

    // Read current column membership from DOM, save as view.dashboard_columns
    // and persist to server. This is the source of truth for "where the user
    // dropped each card." Greedy is only used as a fallback when there's no
    // saved layout or the column count doesn't match the viewport.
    const saveDashboardColumns = () => {
        const view = currentView();
        if (!view) return;
        const grid = $('#dashboard-grid');
        const columns = Array.from(grid.children).map(col =>
            Array.from(col.children).map(c => Number(c.dataset.id))
        );
        view.dashboard_columns = columns;
        api('set_view_columns', { view_id: view.id, columns })
            .catch(err => console.error('save columns:', err));
    };

    // Build the column DOM. Prefer view.dashboard_columns (the layout the user
    // actually arranged via drag); fall back to greedy shortest-column packing
    // when there's no saved layout, when the column count has changed (resize),
    // or when new categories exist that aren't in the saved layout yet.
    const layoutDashboard = (cards) => {
        const grid = $('#dashboard-grid');
        if (!cards) cards = Array.from(grid.querySelectorAll('.dash-card'));

        for (const s of colSortables) s.destroy();
        colSortables = [];
        for (const card of cards) card.remove();

        if (cards.length === 0) {
            grid.replaceChildren();
            return;
        }

        const containerW = grid.clientWidth;
        const colCount = Math.max(1, Math.floor((containerW + GAP) / (COL_MIN + GAP)));

        const cols = [];
        for (let i = 0; i < colCount; i++) {
            const col = document.createElement('div');
            col.className = 'dash-col';
            cols.push(col);
        }
        grid.replaceChildren(...cols);

        // Decide: saved-layout fast path, or greedy fallback?
        const view = currentView();
        const saved = view && Array.isArray(view.dashboard_columns)
            && view.dashboard_columns.length === colCount
            ? view.dashboard_columns
            : null;

        const cardById = new Map(cards.map(c => [Number(c.dataset.id), c]));
        const placed = new Set();

        if (saved) {
            // Place each card in the column it was saved in. Stale ids (deleted
            // or hidden cats) are silently skipped via the cardById lookup.
            saved.forEach((idsInCol, colIdx) => {
                for (const id of idsInCol) {
                    const card = cardById.get(id);
                    if (card && !placed.has(id)) {
                        cols[colIdx].appendChild(card);
                        placed.add(id);
                    }
                }
            });
        }

        // Cards not in saved layout (new categories, or no saved layout at all)
        // → greedy place into shortest column. Reading offsetHeight forces a
        // layout flush so each iteration sees live column heights.
        let extendedSaved = false;
        for (const card of cards) {
            const id = Number(card.dataset.id);
            if (placed.has(id)) continue;
            let shortest = 0;
            for (let j = 1; j < colCount; j++) {
                if (cols[j].offsetHeight < cols[shortest].offsetHeight) shortest = j;
            }
            cols[shortest].appendChild(card);
            extendedSaved = true;
        }

        // Persist fresh layout when we did greedy work (no saved, mismatched
        // column count, or new cards appended). Skip when saved was sufficient.
        if (!saved || extendedSaved) {
            saveDashboardColumns();
        }

        // Per-column Sortables sharing one group → cross-column drag works.
        // No post-drop repack: cards stay exactly where Sortable dropped them.
        for (const col of cols) {
            const s = new Sortable(col, {
                group: 'dashboard-cards',
                animation: 150,
                handle: '.dash-card-head',
                draggable: '.dash-card',
                onStart: () => { state.dashboardDragging = true; },
                onEnd: () => {
                    state.dashboardDragging = false;
                    saveDashboardColumns();
                    // Keep flat dashboard_order in sync so a later resize that
                    // changes column count has a sensible seed for greedy.
                    persistDashboardOrder(zigzagFlatten(grid));
                },
            });
            colSortables.push(s);
        }
    };

    const renderDashboard = () => {
        const grid = $('#dashboard-grid');
        const emptyEl = $('#dashboard-empty');

        const cats = dashboardCategories();
        const totalBms = cats.reduce((sum, c) => sum + bookmarksOf(c.id).length, 0);
        renderDashboardMeta(cats.length, totalBms);

        if (cats.length === 0) {
            emptyEl.classList.remove('hidden');
            emptyEl.textContent = hiddenEligibleCount() > 0
                ? 'All categories are hidden. Click "Show hidden" above to reveal them.'
                : 'No categories with bookmarks yet.';
            for (const s of colSortables) s.destroy();
            colSortables = [];
            grid.replaceChildren();
            return;
        }
        emptyEl.classList.add('hidden');

        const cards = cats.map(cat => renderDashCard(cat));
        layoutDashboard(cards);
    };

    // Resize → re-pack (column count may change). Skip mid-drag to avoid
    // re-layout racing with Sortable's own DOM manipulation.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.dashboardDragging) return;
            if (state.viewMode !== 'dashboard') return;
            layoutDashboard();
        }, 150);
    });

    const renderDashCard = (cat) => {
        const bms = bookmarksOf(cat.id);
        const view = currentView();
        const isHidden = view ? (view.hidden_ids || []).includes(cat.id) : false;
        const card = document.createElement('article');
        card.className = 'dash-card' + (isHidden ? ' is-hidden' : '');
        card.dataset.id = cat.id;

        const head = document.createElement('header');
        head.className = 'dash-card-head';
        head.style.background = colorForCard(cat);
        head.title = 'Drag to reorder · double-click to open · right-click for menu';
        const title = document.createElement('h3');
        title.className = 'dash-card-title';
        title.textContent = categoryPath(cat.id);
        const count = document.createElement('span');
        count.className = 'dash-card-count';
        count.textContent = String(bms.length);
        head.appendChild(title);
        head.appendChild(count);
        head.addEventListener('dblclick', () => {
            setView('list');
            selectCategory(cat.id);
        });
        head.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const items = [
                { label: 'Open in list view', action: () => { setView('list'); selectCategory(cat.id); } },
                { label: '+ Add bookmark',    action: () => { state.selectedCategoryId = cat.id; openBookmarkDialog('add'); } },
                { label: 'Change color…',     action: () => changeCategoryColor(cat) },
            ];
            items.push(
                isHidden
                    ? { label: 'Show on dashboard', action: () => setHidden(cat.id, false) }
                    : { label: 'Hide from dashboard', action: () => setHidden(cat.id, true) },
                { label: 'Rename category', action: () => renameCategory(cat) },
                { label: 'Delete category', action: () => deleteCategory(cat) },
            );
            showContextMenu(e, items);
        });
        card.appendChild(head);

        const list = document.createElement('ul');
        list.className = 'dash-card-list';
        list.dataset.catId = cat.id;
        for (const bm of bms) list.appendChild(renderDashBookmark(bm));
        card.appendChild(list);

        new Sortable(list, {
            group: 'dash-bookmarks',
            animation: 150,
            draggable: 'li',
            onEnd: async (evt) => {
                const targetCatId = Number(evt.to.dataset.catId);
                const ids = Array.from(evt.to.children).map(li => Number(li.dataset.id));
                await api('reorder_bookmarks', { category_id: targetCatId, ids });
                await load();
            },
        });

        return card;
    };

    const renderDashBookmark = (bm) => {
        const li = document.createElement('li');
        li.dataset.id = bm.id;
        const a = document.createElement('a');
        a.href = bm.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = bm.title + '\n' + bm.url;
        const fav = document.createElement('span');
        fav.className = 'dash-fav';
        fav.style.background = colorFor(domainFor(bm.url));
        fav.textContent = initialFor(bm.url);
        const t = document.createElement('span');
        t.className = 'dash-bm-title';
        t.textContent = bm.title;
        a.appendChild(fav);
        a.appendChild(t);
        li.appendChild(a);
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, [
                { label: 'Open in new tab', action: () => window.open(bm.url, '_blank', 'noopener') },
                { label: 'Edit',            action: () => editBookmark(bm) },
                { label: 'Delete',          action: () => deleteBookmark(bm) },
            ]);
        });
        return li;
    };

    $('#view-toggle').addEventListener('click', () => {
        setView(state.viewMode === 'dashboard' ? 'list' : 'dashboard');
    });

    /* ---------- Context menu ---------- */
    const buildContextMenu = (items) => {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.id = 'context-menu';
        for (const it of items) {
            if (it.separator) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                menu.appendChild(sep);
                continue;
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'context-menu-item';
            btn.textContent = it.label;
            btn.addEventListener('click', () => { closeContextMenu(); it.action(); });
            menu.appendChild(btn);
        }
        return menu;
    };
    const placeMenu = (menu, x, y) => {
        menu.style.left = '-9999px';
        menu.style.top = '0';
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        const cx = Math.min(x, window.innerWidth - rect.width - 4);
        const cy = Math.min(y, window.innerHeight - rect.height - 4);
        menu.style.left = Math.max(4, cx) + 'px';
        menu.style.top  = Math.max(4, cy) + 'px';
    };
    const showContextMenu = (event, items) => {
        closeContextMenu();
        const menu = buildContextMenu(items);
        placeMenu(menu, event.clientX, event.clientY);
    };
    const showContextMenuAt = (x, y, items) => {
        closeContextMenu();
        const menu = buildContextMenu(items);
        placeMenu(menu, x, y);
    };
    const closeContextMenu = () => {
        const m = document.getElementById('context-menu');
        if (m) m.remove();
    };
    document.addEventListener('click', closeContextMenu);
    document.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });

    /* ---------- View switcher (named views) ---------- */
    const renderViewPicker = () => {
        const btn = $('#view-picker');
        const view = currentView();
        btn.textContent = 'View: ' + (view?.name ?? '—') + ' ▾';
    };

    const openViewMenu = (anchorEl) => {
        closeContextMenu();
        const view = currentView();
        const items = [];
        for (const v of state.views) {
            const isCurrent = v.id === state.currentViewId;
            items.push({
                label: (isCurrent ? '✓  ' : '    ') + v.name,
                action: () => switchToView(v.id),
            });
        }
        items.push({ separator: true });
        items.push({ label: '+ New view (clones current)', action: createNewView });
        if (view) items.push({ label: 'Rename current view',     action: () => renameCurrentView(view) });
        if (state.views.length > 1 && view) {
            items.push({ label: 'Delete current view', action: () => deleteCurrentView(view) });
        }

        // Position below the anchor button.
        const rect = anchorEl.getBoundingClientRect();
        showContextMenuAt(rect.left, rect.bottom + 4, items);
    };

    const switchToView = async (id) => {
        if (id === state.currentViewId) {
            if (state.viewMode !== 'dashboard') setView('dashboard');
            return;
        }
        state.currentViewId = id;
        try { await api('set_current_view', { id }); }
        catch (err) { console.error('set_current_view:', err); }
        renderViewPicker();
        if (state.viewMode !== 'dashboard') setView('dashboard');
        else renderDashboard();
    };

    const createNewView = async () => {
        const name = prompt('Name for the new view (clones the current view):');
        if (!name || !name.trim()) return;
        const view = currentView();
        const body = { name: name.trim() };
        if (view) body.clone_from_id = view.id;
        const res = await api('add_view', body);
        if (res?.view) {
            state.views.push(res.view);
            state.currentViewId = res.current_view_id;
        }
        renderViewPicker();
        if (state.viewMode !== 'dashboard') setView('dashboard');
        else renderDashboard();
    };

    const renameCurrentView = async (view) => {
        const name = prompt('Rename view:', view.name);
        if (!name || !name.trim() || name === view.name) return;
        view.name = name.trim();
        await api('rename_view', { id: view.id, name: view.name });
        renderViewPicker();
    };

    const deleteCurrentView = async (view) => {
        if (!confirm(`Delete view "${view.name}"? Categories themselves stay; only this view's order/hidden choices are removed.`)) return;
        const res = await api('delete_view', { id: view.id });
        state.views = state.views.filter(v => v.id !== view.id);
        state.currentViewId = res.current_view_id ?? state.views[0]?.id ?? null;
        renderViewPicker();
        if (state.viewMode === 'dashboard') renderDashboard();
    };

    $('#view-picker').addEventListener('click', (e) => {
        e.stopPropagation();
        openViewMenu(e.currentTarget);
    });

    /* ---------- Boot ---------- */
    load()
        .then(() => {
            // Apply saved view mode after data is loaded so dashboard can render
            // with real categories instead of an empty grid.
            setView(state.viewMode);
        })
        .catch(err => {
            console.error(err);
            alert('Failed to load: ' + err.message);
        });
})();
