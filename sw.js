// ====== Service Worker ======
var CACHE_NAME = 'pillpal-v10';
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
  './js/onboard.js',
  './js/family-mode.js',
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

// 激活：立即接管，清除所有旧缓存
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

// 请求拦截：网络优先，失败才用缓存
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Supabase API 和 CDN 直接走网络
  if (url.includes('supabase') || url.includes('cdn.jsdelivr')) {
    return;
  }

  // 网络优先策略：先尝试网络，失败才用缓存
  event.respondWith(
    fetch(event.request).then(function(response) {
      // 网络成功，更新缓存
      if (response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // 网络失败（离线），用缓存
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('./index.html');
      });
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
  event.waitUntil(clients.openWindow('./'));
});
