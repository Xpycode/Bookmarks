<?php
declare(strict_types=1);

function jsonOut($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonIn(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Reads the views config from settings, migrating from the legacy
 * `dashboard_order` / `hidden_ids` keys on first call. After migration the
 * single "All" view holds whatever order/hidden state was already saved.
 */
function ensureViewsData(PDO $pdo): array {
    $raw = setting('views_data');
    if ($raw !== null) {
        $data = json_decode($raw, true);
        if (is_array($data) && isset($data['views']) && is_array($data['views']) && count($data['views']) > 0) {
            $data['current_view_id'] = (int)($data['current_view_id'] ?? $data['views'][0]['id']);
            return $data;
        }
    }
    $orderRaw = setting('dashboard_order') ?? '[]';
    $order = json_decode($orderRaw, true);
    $order = is_array($order) ? array_values(array_map('intval', $order)) : [];
    $hiddenRaw = setting('hidden_ids') ?? '[]';
    $hidden = json_decode($hiddenRaw, true);
    $hidden = is_array($hidden) ? array_values(array_map('intval', $hidden)) : [];
    $data = [
        'views' => [[
            'id' => 1,
            'name' => 'All',
            'dashboard_order' => $order,
            'hidden_ids' => $hidden,
        ]],
        'current_view_id' => 1,
    ];
    setting('views_data', json_encode($data));
    return $data;
}

function saveViewsData(array $data): void {
    setting('views_data', json_encode($data));
}

function findViewIndex(array $data, int $id): int {
    foreach ($data['views'] as $i => $v) {
        if ((int)$v['id'] === $id) return $i;
    }
    return -1;
}

function apiHandle(string $action): void {
    if ($action !== 'list' && $action !== 'search') {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!checkCsrf($token)) jsonOut(['error' => 'csrf'], 403);
    }
    $in = jsonIn();
    $pdo = db();

    switch ($action) {
        case 'list': {
            $cats = $pdo->query('SELECT id, name, parent_id, sort_order, color FROM categories ORDER BY parent_id IS NOT NULL, parent_id, sort_order, id')->fetchAll();
            $bms = $pdo->query('SELECT id, category_id, title, url, notes, sort_order, created_at FROM bookmarks ORDER BY category_id, sort_order, id')->fetchAll();
            $vd = ensureViewsData($pdo);
            jsonOut([
                'categories' => $cats,
                'bookmarks' => $bms,
                'views' => $vd['views'],
                'current_view_id' => (int)$vd['current_view_id'],
            ]);
        }
        case 'add_category': {
            $name = trim((string)($in['name'] ?? ''));
            $parent = isset($in['parent_id']) && $in['parent_id'] !== null ? (int)$in['parent_id'] : null;
            if ($name === '') jsonOut(['error' => 'name required'], 400);
            $sql = 'SELECT COALESCE(MAX(sort_order),-1)+1 FROM categories WHERE parent_id '
                . ($parent === null ? 'IS NULL' : '= ' . $parent);
            $maxOrder = (int)$pdo->query($sql)->fetchColumn();
            $stmt = $pdo->prepare('INSERT INTO categories(name, parent_id, sort_order) VALUES(?,?,?)');
            $stmt->execute([$name, $parent, $maxOrder]);
            jsonOut(['id' => (int)$pdo->lastInsertId(), 'sort_order' => $maxOrder]);
        }
        case 'rename_category': {
            $id = (int)($in['id'] ?? 0);
            $name = trim((string)($in['name'] ?? ''));
            if (!$id || $name === '') jsonOut(['error' => 'bad input'], 400);
            $pdo->prepare('UPDATE categories SET name=? WHERE id=?')->execute([$name, $id]);
            jsonOut(['ok' => true]);
        }
        case 'delete_category': {
            $id = (int)($in['id'] ?? 0);
            $pdo->prepare('DELETE FROM categories WHERE id=?')->execute([$id]);
            jsonOut(['ok' => true]);
        }
        case 'reorder_categories': {
            $ids = $in['ids'] ?? [];
            $parent = isset($in['parent_id']) && $in['parent_id'] !== null ? (int)$in['parent_id'] : null;
            if (!is_array($ids)) jsonOut(['error' => 'bad input'], 400);
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE categories SET parent_id=?, sort_order=? WHERE id=?');
            foreach ($ids as $i => $cid) {
                $stmt->execute([$parent, $i, (int)$cid]);
            }
            $pdo->commit();
            jsonOut(['ok' => true]);
        }
        case 'add_bookmark': {
            $cat = (int)($in['category_id'] ?? 0);
            $title = trim((string)($in['title'] ?? ''));
            $url = trim((string)($in['url'] ?? ''));
            $notes = (string)($in['notes'] ?? '');
            if (!$cat || $url === '') jsonOut(['error' => 'category and url required'], 400);
            if ($title === '') $title = $url;
            $maxOrder = (int)$pdo->query("SELECT COALESCE(MAX(sort_order),-1)+1 FROM bookmarks WHERE category_id=$cat")->fetchColumn();
            $stmt = $pdo->prepare('INSERT INTO bookmarks(category_id,title,url,notes,sort_order,created_at) VALUES(?,?,?,?,?,?)');
            $stmt->execute([$cat, $title, $url, $notes, $maxOrder, time()]);
            jsonOut(['id' => (int)$pdo->lastInsertId(), 'sort_order' => $maxOrder]);
        }
        case 'update_bookmark': {
            $id = (int)($in['id'] ?? 0);
            $title = trim((string)($in['title'] ?? ''));
            $url = trim((string)($in['url'] ?? ''));
            $notes = (string)($in['notes'] ?? '');
            if (!$id || $url === '') jsonOut(['error' => 'bad input'], 400);
            if ($title === '') $title = $url;
            $pdo->prepare('UPDATE bookmarks SET title=?, url=?, notes=? WHERE id=?')->execute([$title, $url, $notes, $id]);
            jsonOut(['ok' => true]);
        }
        case 'delete_bookmark': {
            $id = (int)($in['id'] ?? 0);
            $pdo->prepare('DELETE FROM bookmarks WHERE id=?')->execute([$id]);
            jsonOut(['ok' => true]);
        }
        case 'reorder_bookmarks': {
            $ids = $in['ids'] ?? [];
            $cat = (int)($in['category_id'] ?? 0);
            if (!$cat || !is_array($ids)) jsonOut(['error' => 'bad input'], 400);
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE bookmarks SET category_id=?, sort_order=? WHERE id=?');
            foreach ($ids as $i => $bid) {
                $stmt->execute([$cat, $i, (int)$bid]);
            }
            $pdo->commit();
            jsonOut(['ok' => true]);
        }
        case 'set_category_color': {
            $id = (int)($in['id'] ?? 0);
            $color = $in['color'] ?? null;
            if (!$id) jsonOut(['error' => 'bad input'], 400);
            // null clears; otherwise must be a #RRGGBB hex string.
            if ($color !== null) {
                if (!is_string($color) || !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
                    jsonOut(['error' => 'bad color'], 400);
                }
            }
            $pdo->prepare('UPDATE categories SET color=? WHERE id=?')->execute([$color, $id]);
            jsonOut(['ok' => true]);
        }
        case 'set_view_hidden': {
            $vid = (int)($in['view_id'] ?? 0);
            $ids = $in['ids'] ?? [];
            if (!$vid || !is_array($ids)) jsonOut(['error' => 'bad input'], 400);
            $vd = ensureViewsData($pdo);
            $i = findViewIndex($vd, $vid);
            if ($i < 0) jsonOut(['error' => 'view not found'], 404);
            $vd['views'][$i]['hidden_ids'] = array_values(array_unique(array_map('intval', $ids)));
            saveViewsData($vd);
            jsonOut(['ok' => true]);
        }
        case 'set_view_order': {
            $vid = (int)($in['view_id'] ?? 0);
            $ids = $in['ids'] ?? [];
            if (!$vid || !is_array($ids)) jsonOut(['error' => 'bad input'], 400);
            $vd = ensureViewsData($pdo);
            $i = findViewIndex($vd, $vid);
            if ($i < 0) jsonOut(['error' => 'view not found'], 404);
            $vd['views'][$i]['dashboard_order'] = array_values(array_map('intval', $ids));
            saveViewsData($vd);
            jsonOut(['ok' => true]);
        }
        case 'set_view_columns': {
            // Per-column dashboard layout: array of arrays of category IDs.
            // Used by the masonry dashboard to preserve drop position across
            // reloads. The flat dashboard_order is also kept (set separately
            // via set_view_order) so a column-count change can fall back to
            // greedy packing.
            $vid = (int)($in['view_id'] ?? 0);
            $cols = $in['columns'] ?? null;
            if (!$vid || !is_array($cols)) jsonOut(['error' => 'bad input'], 400);
            $clean = [];
            foreach ($cols as $col) {
                if (!is_array($col)) jsonOut(['error' => 'bad input: columns must be array of arrays'], 400);
                $clean[] = array_values(array_map('intval', $col));
            }
            $vd = ensureViewsData($pdo);
            $i = findViewIndex($vd, $vid);
            if ($i < 0) jsonOut(['error' => 'view not found'], 404);
            $vd['views'][$i]['dashboard_columns'] = $clean;
            saveViewsData($vd);
            jsonOut(['ok' => true]);
        }
        case 'add_view': {
            $name = trim((string)($in['name'] ?? ''));
            $cloneFrom = isset($in['clone_from_id']) ? (int)$in['clone_from_id'] : 0;
            if ($name === '') jsonOut(['error' => 'name required'], 400);
            $vd = ensureViewsData($pdo);
            $maxId = 0;
            foreach ($vd['views'] as $v) $maxId = max($maxId, (int)$v['id']);
            $newId = $maxId + 1;
            $newView = [
                'id' => $newId,
                'name' => $name,
                'dashboard_order' => [],
                'hidden_ids' => [],
            ];
            if ($cloneFrom > 0) {
                $i = findViewIndex($vd, $cloneFrom);
                if ($i >= 0) {
                    $newView['dashboard_order'] = $vd['views'][$i]['dashboard_order'] ?? [];
                    $newView['hidden_ids'] = $vd['views'][$i]['hidden_ids'] ?? [];
                }
            }
            $vd['views'][] = $newView;
            $vd['current_view_id'] = $newId;
            saveViewsData($vd);
            jsonOut(['ok' => true, 'view' => $newView, 'current_view_id' => $newId]);
        }
        case 'rename_view': {
            $vid = (int)($in['id'] ?? 0);
            $name = trim((string)($in['name'] ?? ''));
            if (!$vid || $name === '') jsonOut(['error' => 'bad input'], 400);
            $vd = ensureViewsData($pdo);
            $i = findViewIndex($vd, $vid);
            if ($i < 0) jsonOut(['error' => 'view not found'], 404);
            $vd['views'][$i]['name'] = $name;
            saveViewsData($vd);
            jsonOut(['ok' => true]);
        }
        case 'delete_view': {
            $vid = (int)($in['id'] ?? 0);
            if (!$vid) jsonOut(['error' => 'bad input'], 400);
            $vd = ensureViewsData($pdo);
            if (count($vd['views']) <= 1) jsonOut(['error' => 'cannot delete the last view'], 400);
            $vd['views'] = array_values(array_filter(
                $vd['views'],
                fn($v) => (int)$v['id'] !== $vid
            ));
            if ((int)$vd['current_view_id'] === $vid) {
                $vd['current_view_id'] = (int)$vd['views'][0]['id'];
            }
            saveViewsData($vd);
            jsonOut(['ok' => true, 'current_view_id' => (int)$vd['current_view_id']]);
        }
        case 'set_current_view': {
            $vid = (int)($in['id'] ?? 0);
            if (!$vid) jsonOut(['error' => 'bad input'], 400);
            $vd = ensureViewsData($pdo);
            if (findViewIndex($vd, $vid) < 0) jsonOut(['error' => 'view not found'], 404);
            $vd['current_view_id'] = $vid;
            saveViewsData($vd);
            jsonOut(['ok' => true]);
        }
        case 'search': {
            $q = trim((string)($in['q'] ?? ''));
            if ($q === '') jsonOut(['results' => []]);
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $stmt = $pdo->prepare("SELECT id, category_id, title, url, notes FROM bookmarks WHERE title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' ORDER BY title LIMIT 200");
            $stmt->execute([$like, $like, $like]);
            jsonOut(['results' => $stmt->fetchAll()]);
        }
        default:
            jsonOut(['error' => 'unknown action'], 400);
    }
}
