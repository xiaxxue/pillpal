// ====== 药品管理 + 动态时间轴 ======

// 根据真实数据更新顶栏副标题和AI建议
function updateTopBarWithData(meds) {
  var homeSub = document.getElementById('homeSub');
  var aiText = document.getElementById('aiSuggestText');
  var homeScore = document.getElementById('homeScore');

  if (meds.length === 0) {
    // 没有药品
    if (homeSub) homeSub.textContent = '添加药品开始管理用药';
    if (aiText) aiText.innerHTML = '<p>&#128075; 还没有添加药品，点击下方按钮开始吧</p>';
    if (homeScore) homeScore.textContent = '-';
    return;
  }

  // 有药品：显示药品数和库存状态
  var urgentMeds = [];
  var totalDaily = 0;
  meds.forEach(function(med) {
    var daily = med.daily_usage || 1;
    totalDaily += daily;
    var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
    if (days <= 7) urgentMeds.push(med.name + '（剩' + days + '天）');
  });

  // 副标题：显示正在服用的药品数
  if (homeSub) {
    homeSub.textContent = '正在服用 ' + meds.length + ' 种药 · 每天 ' + totalDaily + ' 次';
  }

  // AI建议：根据实际情况动态生成
  if (aiText) {
    var tips = [];

    // 库存提醒
    if (urgentMeds.length > 0) {
      tips.push('&#9888; ' + urgentMeds.join('、') + ' 快吃完了，记得续方');
    }

    // 通用建议
    if (tips.length === 0) {
      tips.push('&#127793; 所有药品库存充足，继续保持按时服药');
    }
    tips.push('&#128138; 今天有 ' + totalDaily + ' 次服药，记得按时吃哦');

    aiText.innerHTML = tips.map(function(t) { return '<p>' + t + '</p>'; }).join('');
  }
}

// ====== 打卡扣减库存 ======
async function deductStock(card) {
  var medId = card.getAttribute('data-med-id');
  var medName = card.querySelector('.mc-name');
  if (!medName) return;
  var name = medName.textContent;

  // 从数据库获取当前库存
  var user = await getCurrentUser();
  if (user && sb) {
    var result = await sb.from('medications').select('id, stock_count').eq('user_id', user.id).eq('name', name).single();
    if (result.data && result.data.stock_count > 0) {
      var newCount = result.data.stock_count - 1;
      await sb.from('medications').update({ stock_count: newCount }).eq('id', result.data.id);
      // 刷新库存页
      var meds = await getMedications();
      updateStockFromMeds(meds);
      updateTopBarWithData(meds);
      generateRiskAlerts(meds);
    }
  }
}

async function restoreStock(card) {
  var medName = card.querySelector('.mc-name');
  if (!medName) return;
  var name = medName.textContent;

  var user = await getCurrentUser();
  if (user && sb) {
    var result = await sb.from('medications').select('id, stock_count').eq('user_id', user.id).eq('name', name).single();
    if (result.data) {
      var newCount = result.data.stock_count + 1;
      await sb.from('medications').update({ stock_count: newCount }).eq('id', result.data.id);
      var meds = await getMedications();
      updateStockFromMeds(meds);
      updateTopBarWithData(meds);
      generateRiskAlerts(meds);
    }
  }
}

// 打开添加药品弹窗
function openAddMedModal() {
  document.getElementById('addMedName').value = '';
  document.getElementById('addMedDosage').value = '';
  document.getElementById('addMedDisease').value = '';
  document.getElementById('addMedStock').value = '30';
  document.getElementById('addMedNote').value = '';
  // 重置选择
  document.querySelectorAll('#addMedFreqPicker .relation-opt').forEach(function(b, i) {
    b.classList.toggle('selected', i === 0);
  });
  document.querySelectorAll('#addMedTimePicker .relation-opt').forEach(function(b) {
    b.classList.remove('selected');
  });
  document.querySelectorAll('#addMedCondPicker .relation-opt').forEach(function(b, i) {
    b.classList.toggle('selected', i === 0);
  });
  document.getElementById('addMedModal').classList.add('show');
}

function pickAddMedFreq(btn) {
  document.querySelectorAll('#addMedFreqPicker .relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

function pickAddMedCond(btn) {
  document.querySelectorAll('#addMedCondPicker .relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

// 提交添加药品
async function handleAddMed() {
  var name = document.getElementById('addMedName').value.trim();
  var dosage = document.getElementById('addMedDosage').value.trim();
  var disease = document.getElementById('addMedDisease').value.trim();
  var stock = parseInt(document.getElementById('addMedStock').value) || 0;
  var note = document.getElementById('addMedNote').value.trim();

  if (!name) { showToast('请输入药品名称'); return; }
  if (!dosage) { showToast('请输入剂量'); return; }

  // 频次
  var freqBtn = document.querySelector('#addMedFreqPicker .relation-opt.selected');
  var frequency = freqBtn ? parseInt(freqBtn.textContent) : 1;

  // 时间
  var times = [];
  document.querySelectorAll('#addMedTimePicker .relation-opt.selected').forEach(function(b) {
    times.push(b.textContent.trim());
  });
  if (times.length === 0) { showToast('请选择服用时间'); return; }

  // 条件
  var condBtn = document.querySelector('#addMedCondPicker .relation-opt.selected');
  var condition = condBtn ? condBtn.textContent.trim() : '';

  if (!disease) { showToast('请输入治什么病'); return; }

  showToast('正在添加...');

  var med = {
    name: name,
    dosage: dosage,
    frequency: frequency,
    times: times,
    condition: condition,
    disease: disease,
    stock_count: stock,
    daily_usage: frequency,
    note: note
  };

  var result = await addMedication(med);

  if (result) {
    document.getElementById('addMedModal').classList.remove('show');
    showToast(name + ' 已添加到用药计划');
    // 刷新时间轴
    await refreshTimeline();
  } else {
    showToast('添加失败，请重试');
  }
}

// 从数据库加载药品并生成时间轴
async function refreshTimeline() {
  var meds = await getMedications();

  var emptyState = document.getElementById('emptyState');
  var realHome = document.getElementById('realDataHome');

  if (meds.length === 0) {
    if (emptyState) emptyState.style.display = '';
    if (realHome) realHome.style.display = 'none';
    return;
  }

  // 有药品，显示真实数据区域，隐藏空状态
  if (emptyState) emptyState.style.display = 'none';
  if (realHome) realHome.style.display = '';

  // 按时间分组
  var timeSlots = {
    '晨起 7:00': { hour: 7, icon: '&#9728;', label: '晨起 · 07:00', meds: [] },
    '早餐后 8:00': { hour: 8, icon: '&#127860;', label: '早餐后 · 08:00', meds: [] },
    '午餐后 14:30': { hour: 14.5, icon: '&#9728;', label: '午餐后 · 14:30', meds: [] },
    '晚间 21:00': { hour: 21, icon: '&#127769;', label: '晚间 · 21:00', meds: [] }
  };

  meds.forEach(function(med) {
    if (med.times && med.times.length > 0) {
      med.times.forEach(function(t) {
        if (timeSlots[t]) {
          timeSlots[t].meds.push(med);
        }
      });
    }
  });

  // 生成时间轴 HTML（写入真实数据区域）
  var timeline = document.getElementById('realTimeline');
  if (!timeline) return;

  var html = '';
  var now = new Date();
  var currentHour = now.getHours() + now.getMinutes() / 60;
  var totalMeds = 0;

  Object.keys(timeSlots).forEach(function(key) {
    var slot = timeSlots[key];
    if (slot.meds.length === 0) return;

    var isCurrent = Math.abs(currentHour - slot.hour) < 1.5;
    var isPast = currentHour > slot.hour + 1;

    html += '<div class="mt-section" data-time="' + slot.hour + '">';
    html += '<div class="mt-period' + (isCurrent ? ' current-period' : '') + '">';
    html += '<span class="mt-period-icon">' + slot.icon + '</span> ' + slot.label;
    if (isCurrent) html += ' <span class="mt-now">当前</span>';
    html += '</div>';

    slot.meds.forEach(function(med) {
      totalMeds++;
      var cardClass = isCurrent ? 'active-card' : (isPast ? 'past-card' : 'upcoming-card');
      html += '<div class="med-card ' + cardClass + '" data-med-id="' + (med.id || '') + '">';
      html += '<div class="mc-left">';
      html += '<div class="mc-name">' + escapeHtml(med.name) + '</div>';
      html += '<div class="mc-detail">' + escapeHtml(med.dosage) + ' · ' + escapeHtml(med.condition) + '</div>';
      html += '<div class="mc-disease">' + escapeHtml(med.disease) + '</div>';
      if (med.note) html += '<div class="mc-note">&#9432; ' + escapeHtml(med.note) + '</div>';
      html += '</div>';
      html += '<div class="mc-actions">';
      html += '<button class="btn-take-full" onclick="takeMedCard(this)">&#10003; 已服用</button>';
      html += '<button class="btn-later-sm" onclick="laterMedCard(this)">30分钟后提醒</button>';
      html += '<button class="btn-skip" onclick="skipMedCard(this)">跳过</button>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
  });

  timeline.innerHTML = html;

  // 更新进度条（真实数据区域）
  var fill = document.getElementById('realProgFill');
  var text = document.getElementById('realProgText');
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = '已完成 0/' + totalMeds + ' 次服药';

  // 更新概览卡（真实数据区域）
  var realDone = document.getElementById('realDone');
  var realTotal = document.getElementById('realTotal');
  if (realDone) realDone.textContent = '0';
  if (realTotal) realTotal.textContent = totalMeds;

  // 更新库存
  updateStockFromMeds(meds);
}

// 更新库存页面（写入真实数据区域）
function updateStockFromMeds(meds) {
  var boxList = document.getElementById('realBoxList');
  if (!boxList) return;

  var urgentCount = 0;
  var totalWeekly = 0;
  var html = '';

  meds.forEach(function(med) {
    var daily = med.daily_usage || 1;
    var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
    var isUrgent = days <= 7;
    if (isUrgent) urgentCount++;
    totalWeekly += daily * 7;

    var pct = Math.min(100, Math.round((days / 60) * 100));
    var futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    var dateStr = (futureDate.getMonth() + 1) + '月' + futureDate.getDate() + '日';

    html += '<div class="box-card ' + (isUrgent ? 'urgent' : 'normal') + '">';
    html += '<div class="box-header-row">';
    html += '<div class="box-drug-name">' + escapeHtml(med.name) + '</div>';
    html += '<span class="box-tag ' + (isUrgent ? 'tag-urgent' : 'tag-ok') + '">' + (isUrgent ? '快吃完了' : '药量充足') + '</span>';
    html += '</div>';
    html += '<div class="box-spec">' + escapeHtml(med.dosage) + '</div>';
    html += '<div class="box-meter"><div class="meter-bar"><div class="meter-fill ' + (isUrgent ? 'urgent-fill' : 'ok-fill') + '" style="width:' + pct + '%"></div></div>';
    html += '<div class="meter-text">剩余 ' + med.stock_count + ' 片</div></div>';
    html += '<div class="box-info-row">';
    html += '<div class="box-info"><span class="box-info-label">日均用量</span><span>' + daily + '片/天</span></div>';
    html += '<div class="box-info"><span class="box-info-label">可服天数</span><span' + (isUrgent ? ' class="warn-text"' : '') + '>' + days + '天</span></div>';
    html += '<div class="box-info"><span class="box-info-label">预计用完</span><span' + (isUrgent ? ' class="warn-text"' : '') + '>' + dateStr + '</span></div>';
    html += '</div>';
    html += '<button class="box-edit-btn full-w" onclick="editStock(this, \'' + escapeHtml(med.name) + '\', ' + med.stock_count + ', ' + daily + ')">修正信息</button>';
    html += '</div>';
  });

  boxList.innerHTML = html;

  // 更新总览（真实数据区域）
  var realMedCount = document.getElementById('realMedCount');
  var realUrgentCount = document.getElementById('realUrgentCount');
  var realWeeklyCount = document.getElementById('realWeeklyCount');
  if (realMedCount) realMedCount.textContent = meds.length;
  if (realUrgentCount) {
    realUrgentCount.textContent = urgentCount;
    realUrgentCount.classList.toggle('warn-text', urgentCount > 0);
  }
  if (realWeeklyCount) realWeeklyCount.textContent = totalWeekly;
}

// 页面加载后：登录用户隐藏假数据，显示真实数据
async function initMedData() {
  var user = null;
  try {
    user = await getCurrentUser();
  } catch(e) {
    console.log('获取用户失败:', e);
  }
  if (!user) return; // 未登录保留假数据作为演示

  console.log('initMedData: 登录用户，清除假数据');

  // 隐藏假数据，显示真实数据容器
  var mockHome = document.getElementById('mockDataHome');
  var realHome = document.getElementById('realDataHome');
  var mockBox = document.getElementById('mockDataBox');
  var realBox = document.getElementById('realDataBox');

  if (mockHome) { mockHome.style.display = 'none'; console.log('mockDataHome 已隐藏'); }
  if (realHome) { realHome.style.display = ''; console.log('realDataHome 已显示'); }
  if (mockBox) { mockBox.style.display = 'none'; console.log('mockDataBox 已隐藏'); }
  if (realBox) { realBox.style.display = ''; console.log('realDataBox 已显示'); }

  // 从数据库加载药品
  var meds = await getMedications();

  // 更新顶栏副标题和AI建议
  updateTopBarWithData(meds);

  if (meds.length > 0) {
    await refreshTimeline();
    generateRiskAlerts(meds);
  } else {
    // 没有药品，显示空状态
    if (realHome) realHome.style.display = 'none';
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = '';

    // 库存页空状态
    var realBoxList = document.getElementById('realBoxList');
    if (realBoxList) realBoxList.innerHTML = '<div class="empty-state" style="padding:40px 0"><div class="empty-icon">📦</div><div class="empty-title">还没有药品</div><div class="empty-desc">添加药品后这里会显示库存信息</div></div>';
  }
}

// 根据药品库存生成风险提醒
function generateRiskAlerts(meds) {
  var riskAlerts = document.getElementById('realRiskAlerts');
  if (!riskAlerts) return;

  var html = '';
  meds.forEach(function(med) {
    var daily = med.daily_usage || 1;
    var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;

    if (days <= 7) {
      html += '<div class="alert-card risk-orange">' +
        '<div class="alert-icon">&#9888;</div>' +
        '<div class="alert-body">' +
          '<div class="alert-title">' + escapeHtml(med.name) + '快吃完了</div>' +
          '<div class="alert-desc">剩余 ' + med.stock_count + ' 片，预计 ' + days + ' 天后用完，建议续方</div>' +
        '</div>' +
        '<button class="alert-action" onclick="switchTab(\'tab-renew\')">去续方</button>' +
      '</div>';
    }
  });

  riskAlerts.innerHTML = html;

  // 更新概览卡的"最近断药"
  var warnCard = document.getElementById('realMinDays');
  if (warnCard) {
    var minDays = 999;
    meds.forEach(function(med) {
      var daily = med.daily_usage || 1;
      var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
      if (days < minDays) minDays = days;
    });
    warnCard.textContent = minDays < 999 ? minDays + '天' : '-天';
  }
}
