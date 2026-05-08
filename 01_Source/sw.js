// Minimal service worker. Exists primarily to satisfy installability
// requirements for the PWA share-target manifest. The app needs auth + a live
// database, so a real offline mode would be misleading — we only cache the
// shell HTML so a flaky-network refresh still loads the app frame.

const CACHE = 'bookmarks-shell-v1';
const SHELL = ['/index.php'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Cross-origin (e.g. CDN-hosted Sortable.js): pass through.
    if (url.origin !== self.location.origin) return;

    // Share-target POSTs and API calls always go to the network — never cache.
    if (req.method !== 'GET') return;
    if (url.pathname === '/index.php' && url.searchParams.get('r') === 'api') return;

    // Navigations: network-first, fall back to cached shell when offline.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match('/index.php'))
        );
        return;
    }
    // Other GETs (CSS, JS): browser handles via standard HTTP cache (we already
    // cache-bust those with ?v=<filemtime>).
});
