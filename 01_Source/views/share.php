<?php
// share.php — PWA Web Share Target endpoint. Receives POST from the OS share
// sheet (Android Chrome, iOS Safari "Add to Home Screen", Windows Edge) with
// the shared title/text/url. Renders the same category-picker form as
// quickadd.php so the user can choose where the bookmark lands.
//
// Design parity with quickadd.php (see comments there):
//   - Self-handled auth: inline login form preserves shared payload via hidden
//     POST fields rather than redirecting to login.php (which would lose them).
//   - On save, hits the existing add_bookmark API with CSRF.
//   - Last-used category remembered in localStorage (shared key with quickadd).
declare(strict_types=1);

// Web Share Target may put the URL into 'text' instead of 'url' on some
// platforms (Android Chrome historically shoves the entire share text into
// `text` even when it's just a link). Fall back to GET so direct testing
// works (e.g. opening /index.php?r=share&url=… in a browser).
$shareTitle = (string)($_POST['title'] ?? $_GET['title'] ?? '');
$shareText  = (string)($_POST['text']  ?? $_GET['text']  ?? '');
$shareUrl   = (string)($_POST['url']   ?? $_GET['url']   ?? '');

if (!$shareUrl && filter_var($shareText, FILTER_VALIDATE_URL)) {
    $shareUrl = $shareText;
    $shareText = '';
}

if (!isSetup()) {
    header('Location: index.php');
    exit;
}

// Inline login. Re-POSTs to /index.php?r=share with hidden share fields.
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
    <meta name="theme-color" content="#0f1115">
    <link rel="manifest" href="manifest.webmanifest">
    <title>Sign in — Share to Bookmarks</title>
    <link rel="stylesheet" href="<?= asset('app.css') ?>">
    <script>
        (() => {
            const t = localStorage.getItem('theme');
            const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.toggle('dark', dark);
        })();
    </script>
</head>
<body class="auth-page">
    <form method="post" action="index.php?r=share" class="auth-card">
        <h1>Sign in</h1>
        <p style="margin:0;color:var(--text-muted);font-size:13px;">Share to Bookmarks — sign in to save this page.</p>
        <?php if ($loginError !== ''): ?>
            <div class="auth-error"><?= htmlspecialchars($loginError) ?></div>
        <?php endif; ?>
        <label>Password<input type="password" name="password" autofocus required></label>
        <input type="hidden" name="title" value="<?= htmlspecialchars($shareTitle) ?>">
        <input type="hidden" name="text"  value="<?= htmlspecialchars($shareText) ?>">
        <input type="hidden" name="url"   value="<?= htmlspecialchars($shareUrl) ?>">
        <button type="submit">Sign in</button>
    </form>
</body>
</html>
<?php
exit;
endif;

// Authed — render the category-picker form.
$csrf = csrfToken();
$prefilledNotes = $shareText && $shareText !== $shareUrl ? $shareText : '';
?>
<!DOCTYPE html>
<html lang="en" class="quickadd-html">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#0f1115">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrf) ?>">
    <link rel="manifest" href="manifest.webmanifest">
    <title>Save to Bookmarks</title>
    <link rel="stylesheet" href="<?= asset('app.css') ?>">
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
        <h1>Save to Bookmarks</h1>
        <form id="share-form" autocomplete="off">
            <label>Title<input type="text" name="title" value="<?= htmlspecialchars($shareTitle) ?>" maxlength="500"></label>
            <label>URL<input type="url" name="url" value="<?= htmlspecialchars($shareUrl) ?>" required placeholder="https://…"></label>
            <label>Category<select name="category_id" required><option value="">Loading…</option></select></label>
            <label>Notes<textarea name="notes" rows="3" maxlength="2000"><?= htmlspecialchars($prefilledNotes) ?></textarea></label>
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
        const form = document.getElementById('share-form');
        const select = form.elements.category_id;
        const status = document.getElementById('status');

        const showStatus = (msg, kind) => {
            status.textContent = msg;
            status.className = 'quickadd-status ' + kind;
            status.hidden = false;
        };

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

        document.getElementById('cancel-btn').addEventListener('click', () => {
            window.location.href = 'index.php';
        });

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
                showStatus('Saved. Opening Bookmarks…', 'success');
                setTimeout(() => { window.location.href = 'index.php'; }, 600);
            } catch (err) {
                showStatus('Save failed: ' + err.message, 'error');
                saveBtn.disabled = false;
            }
        });

        // Focus the field most likely to need editing. URL is usually correct
        // from the share intent; the user normally just picks a category.
        if (form.elements.url.value.trim()) {
            select.focus();
        } else {
            form.elements.url.focus();
        }
    })();
    </script>
</body>
</html>
