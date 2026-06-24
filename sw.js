/* ===== 报关初稿生成器 v6.4 — Service Worker ===== */
const CACHE_NAME = 'customs-v6.4-v6';

const PRECACHE_URLS = [
  './11.html',
  './manifest.json',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
];

/* ----- install: 预缓存核心文件 ----- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 预缓存核心文件...');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // 单个文件失败不阻塞安装
        console.warn('[SW] 部分预缓存失败（可忽略）:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ----- activate: 清理旧版本缓存 ----- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => {
        console.log('[SW] 清理旧缓存:', key);
        return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

/* ----- fetch: Stale-While-Revalidate + Share Target ----- */
self.addEventListener('fetch', event => {
  // 处理分享目标 POST 请求（文件管理器 → 分享到 PWA）
  if (event.request.method === 'POST' && event.request.url.includes('/11.html')) {
    event.respondWith(
      (async () => {
        // 将 POST 重定向到 GET，文件由 LaunchQueue 传递
        const url = new URL(event.request.url);
        return Response.redirect(url.pathname, 303);
      })()
    );
    return;
  }

  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        // 后台更新：发起网络请求更新缓存
        const fetched = fetch(event.request).then(response => {
          // 只缓存成功的响应
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // 网络失败，如果已有缓存则忽略（会返回下方的 cached）
        });

        // 优先返回缓存，缓存不存在时等待网络
        return cached || fetched;
      });
    })
  );
});
