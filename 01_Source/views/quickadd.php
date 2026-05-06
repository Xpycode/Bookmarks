<?php
// quickadd.php — Mini "save current page" popup for the bookmarklet.
//
// Self-contained: handles its own auth (preserves URL/title query params
// across login redirect, which the standard login.php flow would lose).
//
// Flow:
//   1. Bookmarklet opens this in a 520x640 popup with ?url=&title= query.
//   2. If not authed → render minimal login form posting back to same URL.
//   3. If authed → render quick-add form: pre-filled URL/title, category
//      dropdown (loaded via /api/list), notes textarea, Save / Cancel.
//   4. Save POSTs to existing add_bookmark API, then window.close().
//   5. Last-used category remembered in localStorage.
declare(strict_types=1);

$urlParam   = (string)($_GET['url']   ?? '');
$titleParam = (string)($_GET['title'] ?? '');

// Build a query string we can use to post back to ourselves preserving params.
$selfQs = http_build_query(['r' => 'quickadd', 'url' => $urlParam, 'title' => $titleParam]);

// Edge case: bookmarklet used before first-run setup.
if (!isSetup()) {
    header('Location: index.php');
    exit;
}

// Handle inline login POST (only fires when already on quickadd path).
$loginError = '';
if (!isAuthed() && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if (!login((string)$_POST['password'])) {
        $loginError = 'Wrong password.';
        usleep(500000);
    }
}

if (!isAuthed()):
?>
<!DOCTYPE html>
<html lang="en" class="quickadd-html">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Sign in — Quick add</title>
    <link rel="stylesheet" href="public/app.css">
    <script>
        (() => {
            const t = localStorage.getItem('theme');
            const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.toggle('dark', dark);
        })();
    </script>
</head>
<body class="auth-page">
    <form method="post" action="index.php?<?= htmlspecialchars($selfQs) ?>" class="auth-card">
        <h1>Sign in</h1>
        <p style="margin:0;color:var(--text-muted);font-size:13px;">Quick-add bookmarklet — sign in to save this page.</p>
        <?php if ($loginError !== ''): ?>
            <div class="auth-error"><?= htmlspecialchars($loginError) ?></div>
        <?php endif; ?>
        <label>Password<input type="password" name="password" autofocus required></label>
        <button type="submit">Sign in</button>
    </form>
</body>
</html>
<?php
exit;
endif;

// Authed — render quick-add form.
$csrf = csrfToken();
?>
<!DOCTYPE html>
<html lang="en" class="quickadd-html">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrf) ?>">
    <title>Quick add — Bookmarks</title>
    <link rel="stylesheet" href="public/app.css">
    <script>
        (() => {
            const t = localStorage.getItem('theme');
            const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.toggle('dark', dark);
        })();
    </script>
</head>
<body class="quickadd-body">
    <div class="quickadd">
        <h1>Quick add bookmark</h1>
        <form id="quickadd-form" autocomplete="off">
            <label>Title<input type="text" name="title" value="<?= htmlspecialchars($titleParam) ?>" maxlength="500"></label>
            <label>URL<input type="url" name="url" value="<?= htmlspecialchars($urlParam) ?>" required placeholder="https://…"></label>
            <label>Category<select name="category_id" required><option value="">Loading…</option></select></label>
            <label>Notes<textarea name="notes" rows="3" maxlength="2000"></textarea></label>
            <div class="quickadd-actions">
                <button type="button" class="ghost" id="cancel-btn">Cancel</button>
                <button type="submit" class="primary" id="save-btn">Save</button>
            </div>
        </form>
        <div class="quickadd-status" id="status" hidden></div>
    </div>
    <script>
    (async () => {
        const csrf = document.querySelector('meta[name=csrf-token]').content;
        const form = document.getElementById('quickadd-form');
        const select = form.elements.category_id;
        const status = document.getElementById('status');

        const showStatus = (msg, kind) => {
            status.textContent = msg;
            status.className = 'quickadd-status ' + kind;
            status.hidden = false;
        };

        // Load categories and build the dropdown sorted by full path.
        try {
            const res = await fetch('index.php?r=api&action=list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const cats = data.categories || [];
            const byId = new Map(cats.map(c => [c.id, c]));
            const pathOf = (cat) => {
                const parts = [];
                let cur = cat;
                while (cur) {
                    parts.unshift(cur.name);
                    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
                }
                return parts.join(' / ');
            };
            const sorted = cats.slice().sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
            select.replaceChildren();
            for (const cat of sorted) {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = pathOf(cat);
                select.appendChild(opt);
            }
            const last = localStorage.getItem('quickadd_last_category');
            if (last && sorted.find(c => String(c.id) === last)) {
                select.value = last;
            }
        } catch (err) {
            showStatus('Could not load categories: ' + err.message, 'error');
            return;
        }

        document.getElementById('cancel-btn').addEventListener('click', () => window.close());

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('save-btn');
            saveBtn.disabled = true;
            const data = {
                category_id: Number(select.value),
                title: form.elements.title.value.trim(),
                url: form.elements.url.value.trim(),
                notes: form.elements.notes.value.trim(),
            };
            if (!data.category_id || !data.url) {
                showStatus('Pick a category and enter a URL.', 'error');
                saveBtn.disabled = false;
                return;
            }
            try {
                const res = await fetch('index.php?r=api&action=add_bookmark', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                    body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()));
                localStorage.setItem('quickadd_last_category', String(data.category_id));
                showStatus('Saved. Closing…', 'success');
                setTimeout(() => window.close(), 600);
            } catch (err) {
                showStatus('Save failed: ' + err.message, 'error');
                saveBtn.disabled = false;
            }
        });

        // Focus URL field if title is already filled (typical bookmarklet case).
        if (form.elements.title.value.trim()) {
            form.elements.url.focus();
            form.elements.url.select();
        } else {
            form.elements.title.focus();
        }
    })();
    </script>
</body>
</html>
