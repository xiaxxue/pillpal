// ====== Service Worker ======
// 负责离线缓存和推送通知

var CACHE_NAME = 'pillpal-v3';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/supabase-client.js',
  './js/db.js',
  './js/auth-ui.js',
  './js/push.js',
  './js/med-manager.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安装：缓存所有静态资源
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活：清除旧缓存
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：静态资源走缓存，API 走网络
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Supabase API 和 CDN 请求走网络
  if (url.includes('supabase') || url.includes('cdn.jsdelivr')) {
    return;
  }

  // 静态资源：缓存优先，网络兜底
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        // 缓存新资源
        if (response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    }).catch(function() {
      // 离线且无缓存，返回首页
      return caches.match('./index.html');
    })
  );
});

// 推送通知
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || 'PillPal 用药提醒';
  var options = {
    body: data.body || '该吃药了',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'med-reminder',
    actions: [
      { action: 'take', title: '已服用' },
      { action: 'later', title: '稍后提醒' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 点击通知
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});
