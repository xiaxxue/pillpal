// ====== Supabase 初始化 ======
var SUPABASE_URL = 'https://tjipfsyiqlbmaehabmvp.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaXBmc3lpcWxibWFlaGFibXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODQwMjAsImV4cCI6MjA5Mjg2MDAyMH0.4LLS4SrNhxgwWIQllP6QiEuOq7J-FXL_aRJOaAN9Dlc';

// 用 sb 而不是 supabase，避免和 CDN 全局变量冲突
var sb = null;

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  }
  return false;
}

// ====== 登录注册 ======

async function signUp(email, password, displayName) {
  if (!sb) return { error: { message: '系统初始化中，请稍后' } };
  return await sb.auth.signUp({
    email: email,
    password: password,
    options: { data: { display_name: displayName } }
  });
}

async function signIn(email, password) {
  if (!sb) return { error: { message: '系统初始化中，请稍后' } };
  return await sb.auth.signInWithPassword({
    email: email,
    password: password
  });
}

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

async function getCurrentUser() {
  if (!sb) return null;
  var result = await sb.auth.getUser();
  return result.data ? result.data.user : null;
}

function onAuthChange(callback) {
  if (!sb) return;
  sb.auth.onAuthStateChange(function(event, session) {
    callback(event, session);
  });
}

async function getProfile(userId) {
  if (!sb) return null;
  var result = await sb.from('profiles').select('*').eq('id', userId).single();
  return result.data;
}
