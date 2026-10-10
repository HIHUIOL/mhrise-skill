// mhrise-skill / sw.js
// 简单的离线缓存 Service Worker：优先使用缓存，后台更新

const CACHE_NAME = 'mhrise-skill-v1';

// 需要预缓存的资源（相对路径，便于部署到 GitHub Pages 子目录）
const PRECACHE_URLS = [
  './',
  './index.html',
  './render.js',
  './skillData.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 仅处理同源 GET 请求
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          // 只缓存有效响应
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached); // 离线时回退到缓存

      // 有缓存则立即返回，同时后台更新
      return cached || networkFetch;
    })
  );
});