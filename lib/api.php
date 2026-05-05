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

function apiHandle(string $action): void {
    if ($action !== 'list' && $action !== 'search') {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!checkCsrf($token)) jsonOut(['error' => 'csrf'], 403);
    }
    $in = jsonIn();
    $pdo = db();

    switch ($action) {
        case 'list': {
            $cats = $pdo->query('SELECT id, name, parent_id, sort_order FROM categories ORDER BY parent_id IS NOT NULL, parent_id, sort_order, id')->fetchAll();
            $bms = $pdo->query('SELECT id, category_id, title, url, notes, sort_order, created_at FROM bookmarks ORDER BY category_id, sort_order, id')->fetchAll();
            jsonOut(['categories' => $cats, 'bookmarks' => $bms]);
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
