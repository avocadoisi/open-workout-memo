// オフラインでも開けるようにする。データは端末の IndexedDB にあるので、本体さえ読めれば動く
// 版数を手で上げなくても更新が届くよう、手元のファイルは network-first（落ちたときだけキャッシュ）
const CACHE = 'owm-shell-1';

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
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CACHE)).addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // CDN (Chart.js / html2canvas / フォント) は URL が固定なのでキャッシュ優先
  const cacheFirst = new URL(request.url).origin !== self.location.origin;
  event.respondWith(cacheFirst ? fromCache(request) : fromNetwork(request));
});

async function fromNetwork(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // 画面遷移だけは index.html で受ける（#/record などを直接開いたとき）
    if (request.mode === 'navigate') return caches.match('./index.html');
    throw error;
  }
}

async function fromCache(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}
