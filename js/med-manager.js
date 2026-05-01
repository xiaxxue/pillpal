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

// ====== 删除药品 ======
async function handleDeleteMed(medId, medName) {
  if (!confirm('确定要删除「' + medName + '」吗？删除后无法恢复。')) return;

  await deleteMedication(medId);
  showToast(medName + ' 已从用药计划中删除');
  await refreshTimeline();
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

  // 检查重复：同名药品+完全相同的时间段才算重复
  var existingMeds = await getMedications();
  var duplicate = existingMeds.find(function(m) {
    if (m.name !== name) return false;
    // 检查时间是否完全重叠
    var overlap = times.filter(function(t) { return m.times && m.times.indexOf(t) !== -1; });
    return overlap.length > 0;
  });
  if (duplicate) {
    showToast(name + ' 在该时间段已存在，请选择其他时间');
    return;
  }

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
// dateStr: 要显示的日期（YYYY-MM-DD），不传默认今天
// dateRecords: 该日期的打卡记录对象，不传则用全局 medRecords
async function refreshTimeline(dateStr, dateRecords) {
  if (!dateStr) dateStr = todayStr;
  var isToday = (dateStr === todayStr);
  var meds = await getMedications();

  var emptyState = document.getElementById('emptyState');
  var realHome = document.getElementById('realDataHome');

  if (meds.length === 0) {
    if (emptyState) emptyState.style.display = '';
    if (realHome) realHome.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (realHome) realHome.style.display = '';

  // 按时间分组
  var timeSlots = {
    '晨起 7:00': { hour: 7, icon: '&#9728;', label: '晨起 · 07:00', meds: [] },
    '早餐后 8:00': { hour: 8, icon: '&#127860;', label: '早餐后 · 08:00', meds: [] },
    '午餐后 14:30': { hour: 14.5, icon: '&#9728;', label: '午餐后 · 14:30', meds: [] },
    '晚餐后 18:30': { hour: 18.5, icon: '&#127869;', label: '晚餐后 · 18:30', meds: [] },
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

  // 读取打卡记录（传入的或全局的）
  var dayRecords = dateRecords || medRecords;
  var doneCount = 0;

  // 生成时间轴 HTML（写入真实数据区域）
  var timeline = document.getElementById('realTimeline');
  if (!timeline) return;

  var html = '';
  var now = new Date();
  var currentHour = now.getHours() + now.getMinutes() / 60;
  var totalMeds = 0;
  var nextTime = null;
  var timeMap = { 7: '07:00', 8: '08:00', 14.5: '14:30', 18.5: '18:30', 21: '21:00' };

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
      // 检查此药此时段是否已打卡
      var medKey = med.name + '_' + slot.hour;
      var record = dayRecords[medKey];
      var isDone = record && record.startsWith('done_');
      var isSkipped = record && record.startsWith('skip_');

      if (isDone) doneCount++;

      if (isDone) {
        // 已服用状态
        var takenTime = record.replace('done_', '');
        html += '<div class="med-card done" data-med-id="' + (med.id || '') + '" style="flex-direction:row">';
        html += '<div class="mc-left">';
        html += '<div class="mc-name">' + escapeHtml(med.name) + '</div>';
        html += '<div class="mc-detail">' + escapeHtml(med.dosage) + ' · ' + escapeHtml(med.condition) + '</div>';
        html += '<div class="mc-disease">' + escapeHtml(med.disease) + '</div>';
        html += '</div>';
        html += '<div class="mc-right">';
        html += '<span class="mc-status-done">&#10003; ' + takenTime + '</span>';
        html += '<button class="btn-undo" onclick="undoMed(this)">撤回</button>';
        html += '</div>';
        html += '<button class="mc-delete" onclick="handleDeleteMed(\'' + med.id + '\', \'' + escapeHtml(med.name) + '\')">&times;</button>';
        html += '</div>';
      } else if (isSkipped) {
        // 已跳过状态
        var reason = record.replace('skip_', '');
        html += '<div class="med-card done" data-med-id="' + (med.id || '') + '" style="flex-direction:row;opacity:0.5">';
        html += '<div class="mc-left">';
        html += '<div class="mc-name">' + escapeHtml(med.name) + '</div>';
        html += '<div class="mc-detail">' + escapeHtml(med.dosage) + '</div>';
        html += '</div>';
        html += '<div class="mc-right"><span class="mc-status-done" style="color:var(--text-third)">已跳过 · ' + reason + '</span></div>';
        html += '<button class="mc-delete" onclick="handleDeleteMed(\'' + med.id + '\', \'' + escapeHtml(med.name) + '\')">&times;</button>';
        html += '</div>';
      } else {
        // 未打卡状态
        if (isToday) {
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
          html += '<button class="mc-delete" onclick="handleDeleteMed(\'' + med.id + '\', \'' + escapeHtml(med.name) + '\')">&times;</button>';
          html += '</div>';
        } else {
          // 非今天：只读，显示"未服用"
          html += '<div class="med-card" data-med-id="' + (med.id || '') + '" style="flex-direction:row;opacity:0.6">';
          html += '<div class="mc-left">';
          html += '<div class="mc-name">' + escapeHtml(med.name) + '</div>';
          html += '<div class="mc-detail">' + escapeHtml(med.dosage) + '</div>';
          html += '</div>';
          html += '<div class="mc-right"><span class="mc-status-done" style="color:var(--text-third)">未服用</span></div>';
          html += '</div>';
        }

        // 未打卡 + 时间未过 = 下一个提醒
        if (!nextTime && slot.hour > currentHour) {
          nextTime = timeMap[slot.hour];
        }
      }
    });

    html += '</div>';
  });

  timeline.innerHTML = html;

  // 更新下次提醒时间
  var realNextTime = document.getElementById('realNextTime');
  if (realNextTime) {
    if (doneCount >= totalMeds) {
      realNextTime.textContent = '全部完成';
    } else {
      realNextTime.textContent = nextTime || '待打卡';
    }
  }

  // 更新进度条
  var fill = document.getElementById('realProgFill');
  var text = document.getElementById('realProgText');
  var pct = totalMeds > 0 ? Math.round(doneCount / totalMeds * 100) : 0;
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = '已完成 ' + doneCount + '/' + totalMeds + ' 次服药';

  // 更新概览卡
  var realDone = document.getElementById('realDone');
  var realTotal = document.getElementById('realTotal');
  if (realDone) realDone.textContent = doneCount;
  if (realTotal) realTotal.textContent = totalMeds;

  // 更新库存、风险提醒、顶栏
  updateStockFromMeds(meds);
  generateRiskAlerts(meds);
  updateTopBarWithData(meds);
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
    html += '<div class="box-btn-row">';
    html += '<button class="box-edit-btn" style="flex:1" onclick="editStock(this, \'' + escapeHtml(med.name) + '\', ' + med.stock_count + ', ' + daily + ')">修正信息</button>';
    html += '<button class="box-edit-btn" style="color:var(--danger)" onclick="handleDeleteMed(\'' + med.id + '\', \'' + escapeHtml(med.name) + '\')">删除</button>';
    html += '</div>';
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

// 日期选择器：以 centerDate 为中心显示 7 天
var datePickerCenter = new Date(); // 当前显示的中心日期
var currentViewDate = todayStr;

function buildRealDatePicker(centerDate) {
  var picker = document.getElementById('realDatePicker');
  if (!picker) return;
  if (centerDate) datePickerCenter = new Date(centerDate);
  var today = new Date();
  today.setHours(0,0,0,0);
  var weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  var html = '';
  for (var i = -3; i <= 3; i++) {
    var d = new Date(datePickerCenter);
    d.setDate(datePickerCenter.getDate() + i);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var day = d.getDate();

    // 跨月显示月份
    var month = d.getMonth() + 1;
    var dayLabel = (i === -3 || day === 1) ? month + '/' + day : '' + day;

    // 判断标签
    var diff = Math.round((d - today) / 86400000);
    var label = '';
    if (diff === -1) label = '昨天';
    else if (diff === 0) label = '今天';
    else if (diff === 1) label = '明天';
    else label = weekNames[d.getDay()];

    var activeClass = (dateStr === currentViewDate) ? ' active' : '';
    // 未来日期标灰（严格大于今天才标灰）
    var futureStyle = (diff > 0) ? ' opacity:.5' : '';

    html += '<div class="real-date-item' + activeClass + '" data-date="' + dateStr + '" onclick="switchRealDate(this)" style="' + futureStyle + '">';
    html += '<div class="real-date-week">' + label + '</div>';
    html += '<div class="real-date-day">' + dayLabel + '</div>';
    html += '</div>';
  }
  picker.innerHTML = html;

  // 设置日期跳转输入框
  var jumpInput = document.getElementById('dateJumpInput');
  if (jumpInput) jumpInput.value = currentViewDate;
}

// 左右翻页
function shiftDateRange(days) {
  datePickerCenter.setDate(datePickerCenter.getDate() + days);
  buildRealDatePicker();
}

// 跳转到指定日期
async function jumpToDate(dateStr) {
  if (!dateStr) return;
  currentViewDate = dateStr;
  datePickerCenter = new Date(dateStr);
  buildRealDatePicker();
  var title = document.getElementById('realTimelineTitle');
  if (title) title.textContent = (dateStr === todayStr) ? '今日用药' : dateStr + ' 用药记录';

  var timeline = document.getElementById('realTimeline');
  if (timeline) timeline.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-sec)">加载中...</div>';

  var records = await loadFromCloud(dateStr);
  await refreshTimeline(dateStr, records);
}

async function switchRealDate(el) {
  document.querySelectorAll('.real-date-item').forEach(function(d) { d.classList.remove('active'); });
  el.classList.add('active');
  var dateStr = el.getAttribute('data-date');
  currentViewDate = dateStr;

  var title = document.getElementById('realTimelineTitle');
  if (title) title.textContent = (dateStr === todayStr) ? '今日用药' : dateStr + ' 用药记录';

  var jumpInput = document.getElementById('dateJumpInput');
  if (jumpInput) jumpInput.value = dateStr;

  // 显示加载中
  var timeline = document.getElementById('realTimeline');
  if (timeline) timeline.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-sec)">加载中...</div>';

  var records = await loadFromCloud(dateStr);
  await refreshTimeline(dateStr, records);
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

  // 先从云端拉取今日打卡记录（确保 medRecords 有数据）
  await loadFromCloud(todayStr);

  // 生成日期选择器
  buildRealDatePicker();

  // 再加载药品并渲染
  var meds = await getMedications();
  updateTopBarWithData(meds);

  if (meds.length > 0) {
    await refreshTimeline(todayStr, medRecords);
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
  var warnLabel = document.getElementById('realMinDaysLabel');
  if (warnCard) {
    var minDays = 999;
    var minDrugName = '';
    meds.forEach(function(med) {
      var daily = med.daily_usage || 1;
      var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
      if (days < minDays) { minDays = days; minDrugName = med.name; }
    });
    if (minDays < 999) {
      warnCard.textContent = minDays + '天';
      if (warnLabel) warnLabel.textContent = minDrugName;
    } else {
      warnCard.textContent = '-';
      if (warnLabel) warnLabel.textContent = '库存充足';
    }
  }
}
