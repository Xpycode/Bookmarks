<?php
$csrf = csrfToken();
$msg = $_GET['msg'] ?? '';
$importedCats = (int)($_GET['c'] ?? 0);
$importedBms = (int)($_GET['b'] ?? 0);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf-token" content="<?= htmlspecialchars($csrf) ?>">
<title>Bookmarks</title>
<link rel="stylesheet" href="public/app.css">
</head>
<body>
<header class="topbar">
    <div class="topbar-left">
        <strong class="brand">Bookmarks</strong>
    </div>
    <div class="topbar-search">
        <input id="search" type="search" placeholder="Search bookmarks…" autocomplete="off">
    </div>
    <div class="topbar-right">
        <button id="view-toggle" class="ghost" type="button" title="Toggle dashboard / list view">▦ Dashboard</button>
        <button id="import-btn" class="ghost" type="button" title="Import / bookmarklet">Import</button>
        <button id="theme-toggle" class="ghost" type="button" title="Toggle dark mode">🌓</button>
        <a class="ghost" href="index.php?r=logout">Sign out</a>
    </div>
</header>

<?php if ($msg === 'imported'): ?>
<div class="banner success">
    Imported <?= $importedCats ?> categories and <?= $importedBms ?> bookmarks.
    <button class="banner-close" type="button">×</button>
</div>
<?php elseif ($msg === 'import_failed'): ?>
<div class="banner error">Import failed. Make sure the file is a valid Netscape bookmark HTML file. <button class="banner-close" type="button">×</button></div>
<?php elseif ($msg === 'no_file'): ?>
<div class="banner error">No file selected. <button class="banner-close" type="button">×</button></div>
<?php endif; ?>

<main class="layout">
    <aside class="sidebar">
        <div class="sidebar-head">
            <span>Categories</span>
            <button id="add-root-cat" class="icon-btn" title="Add top-level category">+</button>
        </div>
        <ul id="category-tree" class="tree" data-parent=""></ul>
    </aside>
    <section class="content">
        <div class="content-head">
            <h2 id="current-cat-name">Select a category</h2>
            <div class="content-actions">
                <button id="add-bookmark" class="primary" type="button" disabled>+ Bookmark</button>
            </div>
        </div>
        <ul id="bookmark-list" class="bookmark-list"></ul>
        <div id="empty-state" class="empty">No bookmarks yet — pick a category or click <em>+ Bookmark</em>.</div>
    </section>
    <section class="dashboard hidden" id="dashboard">
        <div class="dashboard-head">
            <h2>All categories</h2>
            <span class="dashboard-meta" id="dashboard-meta"></span>
        </div>
        <div class="dashboard-grid" id="dashboard-grid"></div>
        <div class="dashboard-empty hidden" id="dashboard-empty">No categories with bookmarks yet.</div>
    </section>
</main>

<div id="search-results" class="search-results hidden"></div>

<dialog id="bookmark-dialog">
    <form method="dialog" id="bookmark-form">
        <h3 id="bookmark-dialog-title">Add bookmark</h3>
        <label>Title<input type="text" name="title" maxlength="500"></label>
        <label>URL<input type="url" name="url" required placeholder="https://…"></label>
        <label>Notes<textarea name="notes" rows="3" maxlength="2000"></textarea></label>
        <menu>
            <button value="cancel" class="ghost" formnovalidate>Cancel</button>
            <button value="ok" class="primary" id="bookmark-save">Save</button>
        </menu>
    </form>
</dialog>

<dialog id="import-dialog">
    <form method="post" action="index.php?r=import" enctype="multipart/form-data">
        <h3>Import bookmarks</h3>
        <p>Upload a Netscape-format HTML bookmark file (Chrome, Firefox, Safari, Bookmarkninja).
        Imported folders become categories; existing data is kept.</p>
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
        <input type="file" name="file" accept=".html,.htm,text/html" required>
        <menu>
            <button type="button" value="cancel" class="ghost" data-close>Cancel</button>
            <button type="submit" class="primary">Import</button>
        </menu>
    </form>

    <hr class="dialog-sep">

    <h3>Quick-add bookmarklet</h3>
    <p>Drag the link below to your browser's bookmarks bar. Clicking it on any page opens a small popup that saves that page here.</p>
    <p>
    <?php
    $scheme = (
        (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    ) ? 'https' : 'http';
    $origin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $bookmarklet = "javascript:(function(){var u=encodeURIComponent(location.href);var t=encodeURIComponent(document.title);window.open('" . $origin . "/?r=quickadd&url='+u+'&title='+t,'BookmarkAdd','width=520,height=640');})();";
    ?>
        <a class="bookmarklet-link" href="<?= htmlspecialchars($bookmarklet) ?>" draggable="true" onclick="event.preventDefault();return false;">+ Bookmarks</a>
    </p>
    <p class="dialog-hint">Tip: if your bookmarks bar is hidden, show it first (⌘⇧B in Safari/Chrome).</p>
</dialog>

<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
<script src="public/app.js"></script>
</body>
</html>
