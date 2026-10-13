// mhrise-skill / sw.js
// 简单的离线缓存 Service Worker：优先使用缓存，后台更新

const CACHE_NAME = 'mhrise-skill-v110';

// 需要预缓存的资源（相对路径，便于部署到 GitHub Pages 子目录）
const PRECACHE_URLS = [
  './',
  './index.html',
  './js/render.js',
  './js/skillData.js',
  './js/skill_data.js',
  './js/decoration.js',
  './js/rampage_decorations.js',
  './js/items.js',
  './js/item_effects.js',
  './js/item_categories.js',
  './js/anomaly_materials.js',
  './js/anomaly_icons.js',
  './js/monsters.js',
  './js/monster_icons.js',
  './js/quests.js',
  './js/quest_maps.js',
  './js/game_data.js',
  './js/data.js',
  './js/core/dom.js',
  './js/core/registry.js',
  './js/core/bridge.js',
  './js/core/modal.js',
  './js/core/renderer.js',
  './js/core/ui.js',
  './js/sections/deco.js',
  './js/sections/skill.js',
  './js/sections/ramdeco.js',
  './js/sections/ram.js',
  './js/sections/monster.js',
  './js/sections/material.js',
  './js/sections/quest.js',
    './ui-icons/crown_mini.png',
    './ui-icons/crown_king.png',
    './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // 肉质表图标（Kiranico 官方小图标）
  './hit-icons/hit_slash.png',
  './hit-icons/hit_strike.png',
  './hit-icons/hit_shell.png',
  './hit-icons/element_fire.png',
  './hit-icons/element_water.png',
  './hit-icons/element_ice.png',
  './hit-icons/element_thunder.png',
  './hit-icons/element_dragon.png',
  './hit-icons/element_stun.png'
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

// 接收页面消息：跳过等待（用于"点击版本号更新"）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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