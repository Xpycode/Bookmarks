<?php
declare(strict_types=1);

// Cache-busting URL helper. Appends ?v=<filemtime> so browsers refetch on each
// deploy without manual hard-refresh. Falls back to the request time if the
// file can't be stat'd (defensive — would only happen if the asset is missing,
// which a cache-bust query string can't fix anyway).
function asset(string $name): string {
    static $cache = [];
    if (!isset($cache[$name])) {
        $mtime = @filemtime(__DIR__ . '/../public/' . $name) ?: time();
        $cache[$name] = "public/{$name}?v={$mtime}";
    }
    return $cache[$name];
}
