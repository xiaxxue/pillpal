// ====== 药品管理 + 动态时间轴 ======

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

  // 如果没有药品，显示空状态
  var emptyState = document.getElementById('emptyState');
  var homeContent = document.querySelectorAll('#page-home .section-block, #page-home .today-summary, #page-home .risk-alerts, #page-home .med-progress, #page-home .date-month-label, #page-home .date-picker');

  if (meds.length === 0) {
    if (emptyState) emptyState.style.display = '';
    homeContent.forEach(function(el) { el.style.display = 'none'; });
    return;
  }

  // 有药品，隐藏空状态
  if (emptyState) emptyState.style.display = 'none';
  homeContent.forEach(function(el) { el.style.display = ''; });

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

  // 生成时间轴 HTML
  var timeline = document.querySelector('.med-timeline');
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

  // 更新进度条
  var fill = document.querySelector('.prog-fill');
  var text = document.querySelector('.prog-text');
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = '已完成 0/' + totalMeds + ' 次服药';

  // 更新概览卡
  var doneEl = document.querySelector('.s-card-num .done');
  if (doneEl) doneEl.textContent = '0';
  var totalEl = doneEl ? doneEl.nextElementSibling : null;
  if (totalEl) totalEl.textContent = totalMeds;

  // 更新库存概览
  updateStockFromMeds(meds);
}

// 更新库存页面
function updateStockFromMeds(meds) {
  var boxList = document.querySelector('#page-box .box-list');
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
    html += '<button class="box-edit-btn full-w" onclick="editStock(this, \'' + escapeHtml(med.name) + '\', ' + med.stock_count + ')">修正数量</button>';
    html += '</div>';
  });

  boxList.innerHTML = html;

  // 更新总览
  var boItems = document.querySelectorAll('#page-box .bo-item');
  if (boItems[0]) boItems[0].querySelector('.bo-num').textContent = meds.length;
  if (boItems[1]) {
    var numEl = boItems[1].querySelector('.bo-num');
    numEl.textContent = urgentCount;
    numEl.classList.toggle('warn-text', urgentCount > 0);
  }
  if (boItems[2]) boItems[2].querySelector('.bo-num').textContent = totalWeekly;
}

// 页面加载后：登录用户清除所有假数据，显示真实数据
async function initMedData() {
  var user = await getCurrentUser();
  if (!user) return; // 未登录保留假数据作为演示

  // === 清除所有页面的写死假数据 ===

  // 首页：时间轴、风险提醒、AI建议
  var timeline = document.querySelector('.med-timeline');
  if (timeline) timeline.innerHTML = '';
  var riskAlerts = document.querySelector('#page-home .risk-alerts');
  if (riskAlerts) riskAlerts.innerHTML = '';
  var aiSuggest = document.querySelector('.ai-suggest-block');
  if (aiSuggest) aiSuggest.style.display = 'none';
  // 最近问诊卡
  var visitCard = document.querySelector('#page-home .visit-card');
  if (visitCard) visitCard.closest('.section-block').style.display = 'none';

  // 库存页：清空药品列表和重复购药提醒
  var boxList = document.querySelector('#page-box .box-list');
  if (boxList) boxList.innerHTML = '';
  var dupAlert = document.querySelector('#page-box .dup-alert');
  if (dupAlert) dupAlert.style.display = 'none';

  // 问诊页：续方进度、准备清单（这些依赖具体药品，清掉）
  var renewSteps = document.querySelector('.renew-steps');
  if (renewSteps) renewSteps.closest('.section-block').style.display = 'none';
  var renewChecklist = document.querySelectorAll('#page-renew .checklist');
  renewChecklist.forEach(function(el) { el.closest('.section-block').style.display = 'none'; });

  // 重置概览卡数据
  var doneEl = document.querySelector('.s-card-num .done');
  if (doneEl) doneEl.textContent = '0';
  var warnCard = document.querySelector('.s-card.warn .s-card-num');
  if (warnCard) warnCard.textContent = '-';

  // === 从数据库加载真实数据 ===
  var meds = await getMedications();

  if (meds.length > 0) {
    await refreshTimeline();
    // 生成风险提醒
    generateRiskAlerts(meds);
  } else {
    // 没有药品，显示空状态
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = '';
    // 隐藏概览和进度条
    var sections = document.querySelectorAll('#page-home .today-summary, #page-home .med-progress, #page-home .date-month-label, #page-home .date-picker');
    sections.forEach(function(el) { el.style.display = 'none'; });

    // 库存页也显示空状态
    if (boxList) boxList.innerHTML = '<div class="empty-state" style="padding:40px 0"><div class="empty-icon">📦</div><div class="empty-title">还没有药品</div><div class="empty-desc">添加药品后这里会显示库存信息</div></div>';
  }
}

// 根据药品库存生成风险提醒
function generateRiskAlerts(meds) {
  var riskAlerts = document.querySelector('#page-home .risk-alerts');
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
  var warnCard = document.querySelector('.s-card.warn .s-card-num');
  if (warnCard) {
    var minDays = 999;
    meds.forEach(function(med) {
      var daily = med.daily_usage || 1;
      var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
      if (days < minDays) minDays = days;
    });
    warnCard.textContent = minDays < 999 ? minDays + '天' : '-';
  }
}
