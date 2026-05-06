<?php
declare(strict_types=1);

/**
 * Parses a Netscape bookmark file (Chrome/Firefox/Safari/Bookmarkninja export).
 * Returns a tree: ['name' => string, 'bookmarks' => [...], 'children' => [...]]
 * The root node has name = '' and is unwrapped on import.
 */
function parseNetscape(string $html): array {
    $root = ['name' => '', 'bookmarks' => [], 'children' => []];
    $stack = [&$root];

    $i = 0;
    $n = strlen($html);
    while ($i < $n) {
        $lt = strpos($html, '<', $i);
        if ($lt === false) break;
        $gt = strpos($html, '>', $lt);
        if ($gt === false) break;
        $tag = substr($html, $lt + 1, $gt - $lt - 1);
        $i = $gt + 1;

        if (preg_match('/^h3\b/i', $tag)) {
            $end = stripos($html, '</h3>', $i);
            if ($end === false) break;
            $name = trim(html_entity_decode(strip_tags(substr($html, $i, $end - $i)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            $i = $end + 5;
            $top = &$stack[count($stack) - 1];
            $top['children'][] = ['name' => $name, 'bookmarks' => [], 'children' => []];
            $newRef = &$top['children'][count($top['children']) - 1];
            $stack[] = &$newRef;
            unset($top, $newRef);
        } elseif (preg_match('/^a\s/i', $tag)) {
            $end = stripos($html, '</a>', $i);
            if ($end === false) break;
            $title = trim(html_entity_decode(strip_tags(substr($html, $i, $end - $i)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            $i = $end + 4;
            $url = '';
            if (preg_match('/href\s*=\s*"([^"]*)"/i', $tag, $m)) {
                $url = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } elseif (preg_match("/href\s*=\s*'([^']*)'/i", $tag, $m)) {
                $url = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
            if ($url !== '') {
                $top = &$stack[count($stack) - 1];
                $top['bookmarks'][] = [
                    'title' => $title !== '' ? $title : $url,
                    'url' => $url,
                    'notes' => '',
                ];
                unset($top);
            }
        } elseif (preg_match('#^/dl\b#i', $tag)) {
            if (count($stack) > 1) array_pop($stack);
        }
    }
    return $root;
}

/**
 * Inserts a parsed tree into the database under $parentId (null = top-level).
 * Returns counts ['categories' => int, 'bookmarks' => int].
 */
function importTree(array $node, ?int $parentId, array &$counts): void {
    $pdo = db();

    if ($node['name'] !== '') {
        $maxOrder = (int)$pdo->query(
            'SELECT COALESCE(MAX(sort_order),-1)+1 FROM categories WHERE parent_id '
            . ($parentId === null ? 'IS NULL' : '= ' . (int)$parentId)
        )->fetchColumn();
        $stmt = $pdo->prepare('INSERT INTO categories(name, parent_id, sort_order) VALUES(?,?,?)');
        $stmt->execute([$node['name'], $parentId, $maxOrder]);
        $newId = (int)$pdo->lastInsertId();
        $counts['categories']++;

        $bmStmt = $pdo->prepare('INSERT INTO bookmarks(category_id,title,url,notes,sort_order,created_at) VALUES(?,?,?,?,?,?)');
        foreach ($node['bookmarks'] as $idx => $bm) {
            $bmStmt->execute([$newId, $bm['title'], $bm['url'], $bm['notes'] ?? '', $idx, time()]);
            $counts['bookmarks']++;
        }
        foreach ($node['children'] as $child) {
            importTree($child, $newId, $counts);
        }
    } else {
        // Root node — children become top-level
        foreach ($node['children'] as $child) {
            importTree($child, $parentId, $counts);
        }
        // Top-level orphan bookmarks → "Imported"
        if (!empty($node['bookmarks'])) {
            $maxOrder = (int)$pdo->query(
                'SELECT COALESCE(MAX(sort_order),-1)+1 FROM categories WHERE parent_id '
                . ($parentId === null ? 'IS NULL' : '= ' . (int)$parentId)
            )->fetchColumn();
            $stmt = $pdo->prepare('INSERT INTO categories(name, parent_id, sort_order) VALUES(?,?,?)');
            $stmt->execute(['Imported', $parentId, $maxOrder]);
            $impId = (int)$pdo->lastInsertId();
            $counts['categories']++;
            $bmStmt = $pdo->prepare('INSERT INTO bookmarks(category_id,title,url,notes,sort_order,created_at) VALUES(?,?,?,?,?,?)');
            foreach ($node['bookmarks'] as $idx => $bm) {
                $bmStmt->execute([$impId, $bm['title'], $bm['url'], $bm['notes'] ?? '', $idx, time()]);
                $counts['bookmarks']++;
            }
        }
    }
}
