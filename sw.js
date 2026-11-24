self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith('voxelspase-')).map((key) => caches.delete(key))),
        ),
      self.clients.claim(),
    ]),
  ),
);
// A network failure during navigation can be retried without caching anyone's chats.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VoxelSpase · Нет связи</title><style>body{background:#0f172a;color:#f8fafc;font:17px/1.55 system-ui;max-width:450px;margin:18vh auto;padding:24px}a{color:#a78bfa}</style><h1>Нет подключения</h1><p>Когда интернет вернётся, открой VoxelSpase снова.</p><a href="/">Повторить</a></html>',
          { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } },
        ),
    ),
  );
});
