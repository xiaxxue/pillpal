// ====== 推送通知 ======
var VAPID_PUBLIC_KEY = 'BI-IuQd9JxiLdiukxIHtx1Lp-vQyqponzrUVwXfLwr7JVaoT3JRMz3fXhMGeTBmfyc3fRPDomPFu2UiKY5UJWN0';

// 请求通知权限并订阅推送
async function setupPushNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('浏览器不支持推送通知');
    return false;
  }

  // 请求权限
  var permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('用户拒绝了通知权限');
    return false;
  }

  // 获取 service worker
  var reg = await navigator.serviceWorker.ready;

  // 订阅推送
  var subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  // 保存订阅到 Supabase
  var user = await getCurrentUser();
  if (user && sb) {
    await sb.from('push_subscriptions').upsert({
      user_id: user.id,
      subscription: subscription.toJSON()
    }, { onConflict: 'user_id' });
  }

  return true;
}

// 辅助函数：Base64 转 Uint8Array
function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 本地定时提醒（不依赖服务器的备用方案）
var localReminders = [];

function setupLocalReminders() {
  // 清除旧的
  localReminders.forEach(function(id) { clearTimeout(id); });
  localReminders = [];

  // 获取用药时间点
  var times = [
    { hour: 7, min: 0, label: '晨起', drugs: '氨氯地平片、阿司匹林肠溶片' },
    { hour: 8, min: 0, label: '早餐后', drugs: '盐酸二甲双胍片' },
    { hour: 14, min: 30, label: '午餐后', drugs: '盐酸二甲双胍片' },
    { hour: 18, min: 30, label: '晚餐后', drugs: '请查看用药计划' },
    { hour: 21, min: 0, label: '晚间', drugs: '盐酸二甲双胍片、阿托伐他汀钙片' }
  ];

  var now = new Date();

  times.forEach(function(t) {
    var target = new Date();
    target.setHours(t.hour, t.min, 0, 0);

    // 如果时间已过，跳过
    if (target <= now) return;

    var delay = target - now;
    var id = setTimeout(function() {
      // 检查是否有通知权限
      if (Notification.permission === 'granted') {
        new Notification('PillPal 吃药提醒', {
          body: t.label + '该吃药了：' + t.drugs,
          icon: './icons/icon-192.png',
          tag: 'med-' + t.hour + '-' + t.min
        });
      }
      showToast(t.label + '该吃药了');
    }, delay);
    localReminders.push(id);
  });
}

// 初始化推送
async function initPush() {
  var user = await getCurrentUser();
  if (!user) return;

  // 尝试 Web Push
  var pushOk = await setupPushNotifications();

  // 无论是否成功，都设置本地定时提醒作为备用
  setupLocalReminders();

  if (pushOk) {
    showToast('吃药提醒已开启');
  }
}
