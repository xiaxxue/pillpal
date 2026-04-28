// ====== 数据层 ======
// 登录后用 Supabase 云端存储，未登录用 localStorage 本地存储
// 对 app.js 来说调用方式一样，不用关心数据存哪里

// ====== 判断是否在线（已登录） ======
async function isOnline() {
  if (!sb) return false;
  var result = await sb.auth.getUser();
  return !!(result.data && result.data.user);
}

function getUserId() {
  if (!sb) return null;
  var session = sb.auth.session ? sb.auth.session() : null;
  // v2 API
  return null; // 会在调用时传入
}

// ====== 药品管理 ======

// 获取用户的所有药品
async function getMedications() {
  var user = await getCurrentUser();
  if (user) {
    var result = await sb.from('medications').select('*').eq('user_id', user.id).order('created_at');
    return result.data || [];
  }
  // 离线模式
  return loadData('medications', []);
}

// 添加药品
async function addMedication(med) {
  var user = await getCurrentUser();
  if (user) {
    med.user_id = user.id;
    console.log('添加药品到数据库:', JSON.stringify(med));
    var result = await sb.from('medications').insert(med).select().single();
    console.log('添加结果:', JSON.stringify(result));
    if (result.error) {
      console.error('添加失败:', result.error.message);
      showToast('添加失败：' + result.error.message);
      return null;
    }
    return result.data;
  }
  // 离线模式
  var meds = loadData('medications', []);
  med.id = 'local_' + Date.now();
  meds.push(med);
  saveData('medications', meds);
  return med;
}

// 更新药品（比如修改库存）
async function updateMedication(medId, updates) {
  var user = await getCurrentUser();
  if (user) {
    var result = await sb.from('medications').update(updates).eq('id', medId).select().single();
    return result.data;
  }
  // 离线模式
  var meds = loadData('medications', []);
  meds = meds.map(function(m) { return m.id === medId ? Object.assign(m, updates) : m; });
  saveData('medications', meds);
  return meds.find(function(m) { return m.id === medId; });
}

// 删除药品
async function deleteMedication(medId) {
  var user = await getCurrentUser();
  if (user) {
    await sb.from('medications').delete().eq('id', medId);
    return;
  }
  var meds = loadData('medications', []);
  meds = meds.filter(function(m) { return m.id !== medId; });
  saveData('medications', meds);
}

// 更新库存数量
async function updateStock(medId, newCount) {
  return await updateMedication(medId, { stock_count: newCount });
}

// ====== 每日服药记录 ======

// 获取某天的服药记录
async function getDailyRecords(dateStr) {
  var user = await getCurrentUser();
  if (user) {
    var result = await sb.from('daily_records')
      .select('*, medications(name, dosage)')
      .eq('user_id', user.id)
      .eq('record_date', dateStr);
    return result.data || [];
  }
  return loadData('med_' + dateStr, {});
}

// 记录服药（打卡）
async function recordMedTaken(medicationId, dateStr, takenAt) {
  var user = await getCurrentUser();
  if (user) {
    var result = await sb.from('daily_records').upsert({
      user_id: user.id,
      medication_id: medicationId,
      record_date: dateStr,
      status: 'done',
      taken_at: takenAt
    }, { onConflict: 'user_id, medication_id, record_date' });
    return result;
  }
  // 离线模式
  var records = loadData('med_' + dateStr, {});
  records[medicationId] = 'done_' + takenAt;
  saveData('med_' + dateStr, records);
  return records;
}

// 记录跳过
async function recordMedSkipped(medicationId, dateStr, reason) {
  var user = await getCurrentUser();
  if (user) {
    var result = await sb.from('daily_records').upsert({
      user_id: user.id,
      medication_id: medicationId,
      record_date: dateStr,
      status: 'skip',
      skip_reason: reason
    }, { onConflict: 'user_id, medication_id, record_date' });
    return result;
  }
  var records = loadData('med_' + dateStr, {});
  records[medicationId] = 'skip_' + reason;
  saveData('med_' + dateStr, records);
  return records;
}

// 撤回记录
async function undoMedRecord(medicationId, dateStr) {
  var user = await getCurrentUser();
  if (user) {
    await sb.from('daily_records')
      .delete()
      .eq('user_id', user.id)
      .eq('medication_id', medicationId)
      .eq('record_date', dateStr);
    return;
  }
  var records = loadData('med_' + dateStr, {});
  delete records[medicationId];
  saveData('med_' + dateStr, records);
}

// ====== 家属绑定 ======

// 生成邀请码（患者端）
async function generateInviteCode() {
  var user = await getCurrentUser();
  if (!user) return null;
  var code = Math.random().toString(36).substring(2, 8).toUpperCase();
  // 存到 family_links 里等待家属输入
  await sb.from('family_links').insert({
    patient_id: user.id,
    invite_code: code,
    status: 'pending'
  });
  return code;
}

// 绑定家属（家属端输入邀请码）
async function bindFamily(code, relation) {
  var user = await getCurrentUser();
  if (!user) return { error: '请先登录' };

  // 查找邀请码
  var result = await sb.from('family_links')
    .select('*')
    .eq('invite_code', code)
    .eq('status', 'pending')
    .single();

  if (!result.data) return { error: '邀请码无效或已过期' };

  // 更新绑定
  var updateResult = await sb.from('family_links')
    .update({
      caregiver_id: user.id,
      relation: relation,
      status: 'accepted'
    })
    .eq('id', result.data.id);

  return updateResult.error ? { error: updateResult.error.message } : { success: true };
}

// 获取我绑定的家人（家属视角）
async function getMyPatients() {
  var user = await getCurrentUser();
  if (!user) return [];
  var result = await sb.from('family_links')
    .select('*, patient:patient_id(id, display_name, email)')
    .eq('caregiver_id', user.id)
    .eq('status', 'accepted');
  return result.data || [];
}

// 获取绑定我的家属（患者视角）
async function getMyCaregivers() {
  var user = await getCurrentUser();
  if (!user) return [];
  var result = await sb.from('family_links')
    .select('*, caregiver:caregiver_id(id, display_name, email)')
    .eq('patient_id', user.id)
    .eq('status', 'accepted');
  return result.data || [];
}

// ====== 家属查看患者数据 ======

// 家属获取患者的药品列表
async function getPatientMedications(patientId) {
  if (!sb) return [];
  var result = await sb.from('medications').select('*').eq('user_id', patientId).order('created_at');
  return result.data || [];
}

// 家属获取患者某天的服药记录
async function getPatientDailyRecords(patientId, dateStr) {
  if (!sb) return [];
  var result = await sb.from('daily_records')
    .select('*, medications(name, dosage)')
    .eq('user_id', patientId)
    .eq('record_date', dateStr);
  return result.data || [];
}

// ====== 数据迁移：localStorage → Supabase ======

// 首次登录时把本地数据同步到云端
async function migrateLocalData() {
  var user = await getCurrentUser();
  if (!user) return;

  // 检查是否已迁移
  if (localStorage.getItem('yygh_migrated_' + user.id)) return;

  // 迁移药品数据
  var localMeds = loadData('medications', []);
  if (localMeds.length > 0) {
    for (var i = 0; i < localMeds.length; i++) {
      var med = localMeds[i];
      delete med.id; // 让数据库自动生成
      med.user_id = user.id;
      await sb.from('medications').insert(med);
    }
  }

  // 迁移家属数据
  var localFamily = loadData('family', []);
  // 家属数据暂时跳过，需要双方都注册才能绑定

  // 标记已迁移
  localStorage.setItem('yygh_migrated_' + user.id, 'true');
}
