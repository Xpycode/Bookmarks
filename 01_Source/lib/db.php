<?php
declare(strict_types=1);

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $path = __DIR__ . '/../data/bookmarks.sqlite';
    $isNew = !file_exists($path);
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    if ($isNew) initSchema($pdo);
    migrate($pdo);
    return $pdo;
}

// Idempotent column adds. SQLite has no `IF NOT EXISTS` for ADD COLUMN;
// a duplicate-column error is swallowed so this is safe to run every request.
function migrate(PDO $pdo): void {
    $statements = [
        'ALTER TABLE categories ADD COLUMN color TEXT',
    ];
    foreach ($statements as $sql) {
        try { $pdo->query($sql); } catch (PDOException $e) { /* column already exists */ }
    }
}

function initSchema(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_cat_parent ON categories(parent_id, sort_order);
        CREATE TABLE bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bm_cat ON bookmarks(category_id, sort_order);
    ");
}

function setting(string $key, ?string $value = null): ?string {
    $pdo = db();
    if ($value === null) {
        $stmt = $pdo->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        return $row ? $row['value'] : null;
    }
    $pdo->prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        ->execute([$key, $value]);
    return $value;
}
