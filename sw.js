/* ===== 报关初稿生成器 v6.5 — Service Worker ===== */
const CACHE_NAME = 'customs-v6.5-v102-pink';

const PRECACHE_URLS = [
  './11.html',
  './template.xlsx',
  './manifest.json',
  './assets/粉色像素素龙主姿态.png',
  './assets/粉色像素素龙放大镜.png',
  './assets/粉色像素素龙耳麦.png',
  './assets/粉色像素素龙欢呼.png',
  './assets/粉色像素素龙文件卷.png',
  './assets/粉色像素素龙探头像.png',
  './assets/粉色像素港口横幅.png',
  './assets/粉色像素数字徽章.png',
  './assets/粉色像素状态点.png',
  './assets/粉色像素小装饰.png',
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
  // 兼容 Background Sync 的浏览器：激活时注册一次补传（有积压才需要）
  if (self.registration && self.registration.sync) {
    self.registration.sync.register('flush-uploads').catch(() => {});
  }
});

/* ----- Background Sync：连上家里 WiFi 时系统唤醒补传积压文件 ----- */
const IDB_NAME = 'bgz-uploads', IDB_STORE = 'pending';

function swIdbGet(key) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE, { keyPath: 'name' }); };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).get(key);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    };
    r.onerror = () => rej(r.error);
  });
}
function swIdbDel(key) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE, { keyPath: 'name' }); };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
}

async function swFlushPending() {
  const rec = await swIdbGet('__meta__');
  const base = rec && rec.pcUrl ? String(rec.pcUrl).replace(/\/+$/, '') : '';
  if (!base) return;
  const all = await new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE, { keyPath: 'name' }); };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).getAll();
      rq.onsuccess = () => { res({ items: rq.result || [], db }); };
      rq.onerror = () => rej(rq.error);
    };
    r.onerror = () => rej(r.error);
  });
  for (const item of all.items) {
    if (item.name === '__meta__') continue;
    try {
      const r = await fetch(base + '/upload?name=' + encodeURIComponent(item.name), { method: 'POST', body: item.blob });
      if (r.ok) {
        await swIdbDel(item.name);
        const cl = await self.clients.matchAll();
        cl.forEach(c => c.postMessage({ type: 'flushed', name: item.name }));
      }
    } catch (e) { /* 下一个网络可用时机再试 */ }
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'flush-uploads') {
    event.waitUntil(swFlushPending().catch(e => console.warn('[SW] 补传失败:', e)));
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'flush-uploads') {
    event.waitUntil(swFlushPending().catch(e => console.warn('[SW] 补传失败:', e)));
  }
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

  const url = new URL(event.request.url);

  // 同源核心资源（页面/模板/清单）：网络优先——在线时永远拿最新版，
  // 断网或超时才回退缓存。解决"上传后手机要开两次才更新"的问题。
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(c => c || caches.match('./11.html'))
      )
    );
    return;
  }

  // 跨域 CDN 库：缓存优先 + 后台更新（库内容基本不变，省流量）
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetched = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {});
        return cached || fetched;
      });
    })
  );
});
