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
        renderTree();
        renderBookmarks();
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

        // Refresh dashboard if it's the active view (so cards stay in sync
        // when actions happen via the sidebar while dashboard is showing).
        if (state.viewMode === 'dashboard') renderDashboard();
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
    // View mode: 'list' (default) or 'dashboard'. Persisted in localStorage.
    state.viewMode = localStorage.getItem('viewMode') || 'list';

    const setView = (mode) => {
        state.viewMode = mode;
        localStorage.setItem('viewMode', mode);
        const dash = $('#dashboard');
        const content = $('.content');
        const toggle = $('#view-toggle');
        if (mode === 'dashboard') {
            content.classList.add('hidden');
            dash.classList.remove('hidden');
            toggle.classList.add('active');
            toggle.title = 'Switch to list view';
            renderDashboard();
        } else {
            dash.classList.add('hidden');
            content.classList.remove('hidden');
            toggle.classList.remove('active');
            toggle.title = 'Switch to dashboard view';
        }
    };

    // Tree-order traversal: top-level cats in sort_order, then their children
    // (recursive). Only includes categories that have direct bookmarks — pure
    // navigation parents (DW with sub-categories but no direct items) are
    // skipped because they'd render as empty cards.
    const dashboardCategories = () => {
        const result = [];
        const visit = (parentId) => {
            for (const cat of childrenOf(parentId)) {
                if (bookmarksOf(cat.id).length > 0) result.push(cat);
                visit(cat.id);
            }
        };
        visit(null);
        return result;
    };

    const DASH_PREVIEW = 7;  // max bookmarks shown per card before "+ N more"

    const renderDashboard = () => {
        const grid = $('#dashboard-grid');
        const emptyEl = $('#dashboard-empty');
        const meta = $('#dashboard-meta');
        grid.replaceChildren();

        const cats = dashboardCategories();
        if (cats.length === 0) {
            emptyEl.classList.remove('hidden');
            meta.textContent = '';
            return;
        }
        emptyEl.classList.add('hidden');
        const totalBms = cats.reduce((sum, c) => sum + bookmarksOf(c.id).length, 0);
        meta.textContent = `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} · ${totalBms} bookmark${totalBms === 1 ? '' : 's'}`;

        for (const cat of cats) {
            const bms = bookmarksOf(cat.id);
            const card = document.createElement('article');
            card.className = 'dash-card';
            card.dataset.id = cat.id;

            // Header (clickable → list view of that category)
            const head = document.createElement('header');
            head.className = 'dash-card-head';
            const title = document.createElement('h3');
            title.className = 'dash-card-title';
            title.textContent = categoryPath(cat.id);
            const count = document.createElement('span');
            count.className = 'dash-card-count';
            count.textContent = String(bms.length);
            head.appendChild(title);
            head.appendChild(count);
            head.addEventListener('click', () => {
                setView('list');
                selectCategory(cat.id);
            });
            card.appendChild(head);

            // Body: top N bookmarks as a list
            const list = document.createElement('ul');
            list.className = 'dash-card-list';
            const preview = bms.slice(0, DASH_PREVIEW);
            for (const bm of preview) {
                const li = document.createElement('li');
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
                list.appendChild(li);
            }
            card.appendChild(list);

            // Footer: "+ N more" if there are extras
            if (bms.length > DASH_PREVIEW) {
                const foot = document.createElement('footer');
                foot.className = 'dash-card-foot';
                const more = document.createElement('button');
                more.className = 'dash-card-more';
                more.type = 'button';
                more.textContent = `+ ${bms.length - DASH_PREVIEW} more`;
                more.addEventListener('click', () => {
                    setView('list');
                    selectCategory(cat.id);
                });
                foot.appendChild(more);
                card.appendChild(foot);
            }
            grid.appendChild(card);
        }
    };

    // Toggle button: cycles list ⇄ dashboard.
    $('#view-toggle').addEventListener('click', () => {
        setView(state.viewMode === 'dashboard' ? 'list' : 'dashboard');
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
