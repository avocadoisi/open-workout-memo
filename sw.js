// オフラインでも開けるようにする。データは端末の IndexedDB にあるので、本体さえ読めれば動く
// シェルは版数付きキャッシュに一式まとめて install し、全ファイルが揃ってから activate する。
// 途中のファイルだけ新しくなる混在を避けるため、配信中のファイルはキャッシュからだけ返す。
const CACHE = 'owm-shell-2';
// CDN (Chart.js / html2canvas / フォント) はシェルとは別にキャッシュする
const RUNTIME = 'owm-runtime-1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dom.js',
  './db.js',
  './icons.js',
  './prefs.js',
  './training.js',
  './views/record.js',
  './views/history.js',
  './views/chart.js',
  './views/data.js',
  './views/about.js',
  './views/settings.js',
  './views/order.js',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // HTTP キャッシュではなくネットワークから揃える。1本でも失敗したら install ごと失敗させる
    const requests = SHELL.map((url) => new Request(url, { cache: 'reload' }));
    const existed = await caches.has(CACHE);
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(requests);
    } catch (error) {
      // 新しく作った版の空キャッシュだけ片付ける（配信中の版は消さない）
      if (!existed) await caches.delete(CACHE);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE && key !== RUNTIME).map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const sameOrigin = new URL(request.url).origin === self.location.origin;
  // 同一オリジンのシェルは、install で揃えた版数のキャッシュだけを見る
  event.respondWith(sameOrigin ? fromShell(request) : fromRuntime(request));
});

async function fromShell(request) {
  const cached = await caches.match(request, { cacheName: CACHE, ignoreSearch: true });
  if (cached) return cached;
  // 画面遷移だけは index.html で受ける（#/record などを直接開いたとき）
  if (request.mode === 'navigate') {
    const index = await caches.match('./index.html', { cacheName: CACHE, ignoreSearch: true });
    if (index) return index;
  }
  // シェルに無いものはキャッシュへ書き足さない（版数の混在を防ぐ）
  return fetch(request);
}

async function fromRuntime(request) {
  const cached = await caches.match(request, { cacheName: RUNTIME });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await (await caches.open(RUNTIME)).put(request, response.clone());
  }
  return response;
}
