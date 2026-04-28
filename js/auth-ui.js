// ====== 登录注册 UI 交互 ======

var selectedAuthRole = 'patient';

// 初始化 Supabase 并检查登录状态
(function() {
  // 等 Supabase CDN 加载完
  var checkInterval = setInterval(function() {
    if (initSupabase()) {
      clearInterval(checkInterval);
      checkAuthState();
    }
  }, 100);

  // 5秒超时
  setTimeout(function() {
    clearInterval(checkInterval);
  }, 5000);
})();

async function checkAuthState() {
  var user = await getCurrentUser();
  if (user) {
    hideAuthModal();
    updateUserDisplay(user);
    await migrateLocalData();
    if (typeof loadFromCloud === 'function') await loadFromCloud();
    if (typeof initPush === 'function') initPush();
    if (typeof initMedData === 'function') await initMedData();
  }
  // 未登录，显示登录弹窗（默认已显示）

  // 监听状态变化
  onAuthChange(function(event, session) {
    if (event === 'SIGNED_IN') {
      hideAuthModal();
    } else if (event === 'SIGNED_OUT') {
      showAuthModal();
    }
  });
}

function hideAuthModal() {
  document.getElementById('authModal').classList.remove('show');
}

function showAuthModal() {
  document.getElementById('authModal').classList.add('show');
  switchAuthMode('login');
}

// 切换登录/注册
function switchAuthMode(mode) {
  document.getElementById('authLoginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authSignupForm').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('authLoading').style.display = 'none';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authTitle').textContent = mode === 'login' ? '登录' : '注册';
}

// 选择角色
function pickAuthRole(btn, role) {
  document.querySelectorAll('#authSignupForm .relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  selectedAuthRole = role;
}

// 显示错误
function showAuthError(msg) {
  var el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

// 显示加载
function showAuthLoading() {
  document.getElementById('authLoginForm').style.display = 'none';
  document.getElementById('authSignupForm').style.display = 'none';
  document.getElementById('authLoading').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

// 登录
async function handleLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;

  if (!email) { showAuthError('请输入邮箱'); return; }
  if (!password) { showAuthError('请输入密码'); return; }

  showAuthLoading();
  try {
    var result = await signIn(email, password);

    if (result.error) {
      switchAuthMode('login');
      var msg = result.error.message;
      if (msg.includes('Invalid login')) msg = '邮箱或密码错误';
      if (msg.includes('Email not confirmed')) msg = '请先去邮箱点击验证链接';
      showAuthError(msg);
    } else {
      hideAuthModal();
      showToast('登录成功，正在同步数据...');
      await migrateLocalData();
      if (typeof loadFromCloud === 'function') await loadFromCloud();
      if (typeof initPush === 'function') initPush();
      if (typeof initMedData === 'function') await initMedData();
      updateUserDisplay(result.data.user);
      showToast('数据同步完成');
    }
  } catch(e) {
    switchAuthMode('login');
    showAuthError('登录失败：' + (e.message || '网络错误'));
  }
}

// 注册
async function handleSignup() {
  var name = document.getElementById('signupName').value.trim();
  var email = document.getElementById('signupEmail').value.trim();
  var password = document.getElementById('signupPassword').value;

  if (!name) { showAuthError('请输入昵称'); return; }
  if (!email) { showAuthError('请输入邮箱'); return; }
  if (!password || password.length < 6) { showAuthError('密码至少6位'); return; }

  showAuthLoading();
  console.log('开始注册, supabase=', !!supabase, 'email=', email);
  try {
    var result = await signUp(email, password, name);
    console.log('注册结果:', JSON.stringify(result));

    if (result.error) {
      switchAuthMode('signup');
      var msg = result.error.message;
      if (msg.includes('already registered') || msg.includes('already been registered')) msg = '该邮箱已注册，请直接登录';
      if (msg.includes('rate limit')) msg = '操作太频繁，请稍后再试';
      showAuthError(msg);
    } else {
      // 注册成功，切回登录
      switchAuthMode('login');
      showToast('注册成功！请查收验证邮件后登录');
    }
  } catch(e) {
    switchAuthMode('signup');
    showAuthError('注册失败：' + (e.message || '网络错误'));
  }
}

// 跳过登录（体验模式）
function skipAuth() {
  hideAuthModal();
  showToast('体验模式：数据仅保存在本地');
}

// 更新页面上的用户信息
function updateUserDisplay(user) {
  if (!user) return;
  var name = (user.user_metadata && user.user_metadata.display_name) || user.email.split('@')[0];
  var initial = name.charAt(0);
  var hour = new Date().getHours();
  var timeStr = hour < 6 ? '凌晨好' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';

  // 首页顶栏
  var homeAvatar = document.getElementById('homeAvatar');
  if (homeAvatar) homeAvatar.textContent = initial;
  var homeGreeting = document.getElementById('homeGreeting');
  if (homeGreeting) homeGreeting.textContent = timeStr + '，' + name;
  var homeSub = document.getElementById('homeSub');
  if (homeSub) homeSub.textContent = '欢迎使用 PillPal';
  var miniText = document.getElementById('miniText');
  if (miniText) miniText.textContent = name + ' · PillPal';

  // 显示 AI 建议区
  var topBarAi = document.getElementById('topBarAi');
  if (topBarAi) topBarAi.style.display = '';

  // 个人中心
  var profileName = document.querySelector('.profile-name');
  if (profileName) profileName.textContent = name;
  var profileAvatar = document.querySelector('.profile-avatar');
  if (profileAvatar) profileAvatar.textContent = initial;
}

// 退出登录（在个人中心调用）
async function handleLogout() {
  await signOut();
  showAuthModal();
  showToast('已退出登录');
}
