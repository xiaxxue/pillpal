// ====== 家属模式：加载真实患者数据 ======

var boundPatientId = null;
var boundPatientName = '';

// 入口：进入家属模式时调用
async function initFamilyMode() {
  var user = await getCurrentUser();
  if (!user) return;

  // 查询绑定的患者
  var patients = await getMyPatients();

  if (patients.length === 0) {
    // 没有绑定任何患者，显示引导
    showFmEmptyState();
    return;
  }

  // 取第一个绑定的患者
  var link = patients[0];
  boundPatientId = link.patient_id;

  // 获取患者的 profile
  var patientProfile = null;
  if (sb) {
    var res = await sb.from('profiles').select('display_name').eq('id', boundPatientId).single();
    if (res.data) patientProfile = res.data;
  }
  boundPatientName = (patientProfile && patientProfile.display_name) || '患者';
  var relation = link.relation || '家人';

  // 更新顶栏
  var topBar = document.querySelector('#page-fm-home .fm-top-bar');
  if (topBar) {
    topBar.style.display = '';
    var avatar = topBar.querySelector('.fm-avatar');
    if (avatar) avatar.textContent = boundPatientName.charAt(0);
    var topName = topBar.querySelector('.fm-top-name');
    if (topName) topName.textContent = relation + ' · ' + boundPatientName;
    var topSub = topBar.querySelector('.fm-top-sub');
    if (topSub) topSub.textContent = '正在为' + boundPatientName + '管理用药';
  }

  // 隐藏假数据，加载真实数据
  hideFmMockData();
  await loadPatientHome(boundPatientId, boundPatientName, relation);
  await loadPatientStock(boundPatientId);
  loadBoundPatients(patients);
}

// 隐藏所有家属页面的假数据
function hideFmMockData() {
  var mocks = document.querySelectorAll('.fm-mock-data');
  mocks.forEach(function(el) { el.style.display = 'none'; });
  var reals = document.querySelectorAll('.fm-real-data');
  reals.forEach(function(el) { el.style.display = ''; });
}

// 未绑定状态
function showFmEmptyState() {
  var mocks = document.querySelectorAll('.fm-mock-data');
  mocks.forEach(function(el) { el.style.display = 'none'; });

  // 隐藏顶栏假数据
  var topBar = document.querySelector('#page-fm-home .fm-top-bar');
  if (topBar) topBar.style.display = 'none';

  // 清空设置页假数据
  var settingsContent = document.querySelector('#page-fm-settings .content');
  if (settingsContent) {
    settingsContent.innerHTML =
      '<div class="empty-state" style="padding:60px 24px">' +
        '<div class="empty-icon">&#128101;</div>' +
        '<div class="empty-title">还没有绑定家人</div>' +
        '<div class="empty-desc">请先在监护首页绑定家人</div>' +
      '</div>' +
      '<button class="fm-exit-btn" onclick="backToRoleSelect()">切换角色</button>';
  }

  // 清空药量页假数据
  var stockContent = document.querySelector('#page-fm-stock .content');
  if (stockContent) {
    stockContent.innerHTML =
      '<div class="empty-state" style="padding:60px 24px">' +
        '<div class="empty-icon">📦</div>' +
        '<div class="empty-title">还没有绑定家人</div>' +
        '<div class="empty-desc">绑定后可查看家人的药品库存</div>' +
      '</div>';
  }

  // 在监护首页显示引导
  var homeContent = document.querySelector('#page-fm-home .content');
  if (homeContent) {
    homeContent.innerHTML =
      '<div class="empty-state" style="padding:60px 24px">' +
        '<div class="empty-icon">&#128101;</div>' +
        '<div class="empty-title">还没有绑定家人</div>' +
        '<div class="empty-desc">请让家人在 PillPal 患者端生成邀请码，然后在下方输入绑定</div>' +
        '<div class="form-group" style="margin-top:20px">' +
          '<input type="text" class="form-input" id="fmBindCodeInput" placeholder="输入邀请码" style="text-align:center;font-size:18px;letter-spacing:4px;text-transform:uppercase">' +
        '</div>' +
        '<div class="form-group">' +
          '<div class="relation-picker">' +
            '<button class="relation-opt" onclick="pickFmRelation(this)">配偶</button>' +
            '<button class="relation-opt" onclick="pickFmRelation(this)">儿子</button>' +
            '<button class="relation-opt" onclick="pickFmRelation(this)">女儿</button>' +
            '<button class="relation-opt" onclick="pickFmRelation(this)">父母</button>' +
            '<button class="relation-opt" onclick="pickFmRelation(this)">其他</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn-primary-lg" style="width:100%;margin-top:12px" onclick="handleFmBind()">绑定家人</button>' +
      '</div>';
  }
}

var fmSelectedRelation = '';
function pickFmRelation(btn) {
  btn.parentElement.querySelectorAll('.relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  fmSelectedRelation = btn.textContent;
}

async function handleFmBind() {
  var code = document.getElementById('fmBindCodeInput').value.trim().toUpperCase();
  if (!code) { showToast('请输入邀请码'); return; }
  if (!fmSelectedRelation) { showToast('请选择关系'); return; }

  showToast('正在绑定...');
  var result = await bindFamily(code, fmSelectedRelation);
  if (result.error) {
    showToast(result.error);
  } else {
    showToast('绑定成功！正在加载数据...');
    await initFamilyMode();
  }
}

// ====== 加载监护首页 ======
async function loadPatientHome(patientId, patientName, relation) {
  // 更新顶栏
  var topName = document.querySelector('#page-fm-home .fm-top-name');
  if (topName) topName.textContent = relation + ' · ' + patientName;

  // 获取患者药品和今日打卡
  var meds = await getPatientMedications(patientId);
  var _now = new Date();
  var dateStr = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
  var records = await getPatientDailyRecords(patientId, dateStr);

  // 统计今日进度
  var totalMeds = 0;
  var doneCount = 0;
  var recordMap = {};
  if (records && records.length > 0) {
    records.forEach(function(r) {
      recordMap[r.medication_id + '_' + (r.time_slot || '')] = r.status;
      if (r.status === 'done') doneCount++;
    });
  }
  meds.forEach(function(med) {
    if (med.times) totalMeds += med.times.length;
  });

  // 更新服药进度圆点
  var dotsArea = document.querySelector('#page-fm-home .fm-dose-dots');
  if (dotsArea) {
    var dotsHtml = '';
    for (var i = 0; i < totalMeds; i++) {
      if (i < doneCount) {
        dotsHtml += '<span class="fm-dot done">&#9679;</span>';
      } else {
        dotsHtml += '<span class="fm-dot pending">&#9675;</span>';
      }
    }
    dotsHtml += '<span class="fm-dose-text">已完成 ' + doneCount + '/' + totalMeds + '</span>';
    dotsArea.innerHTML = dotsHtml;
  }

  // 生成异常提醒
  var alertsArea = document.querySelector('#page-fm-home .risk-alerts');
  if (alertsArea) {
    var alertHtml = '';
    meds.forEach(function(med) {
      var daily = med.daily_usage || 1;
      var days = med.stock_count > 0 ? Math.floor(med.stock_count / daily) : 0;
      if (days <= 7) {
        alertHtml += '<div class="alert-card risk-orange">' +
          '<div class="alert-icon">&#9888;</div>' +
          '<div class="alert-body">' +
            '<div class="alert-title">' + med.name + '快吃完了</div>' +
            '<div class="alert-desc">剩余 ' + med.stock_count + ' 片，预计 ' + days + ' 天后用完</div>' +
          '</div>' +
          '<button class="alert-action" onclick="showToast(\'已提醒' + patientName + '续方\')">提醒续方</button>' +
        '</div>';
      }
    });
    // 漏服提醒
    if (doneCount < totalMeds && _now.getHours() >= 12) {
      alertHtml += '<div class="alert-card risk-red">' +
        '<div class="alert-icon">&#9673;</div>' +
        '<div class="alert-body">' +
          '<div class="alert-title">今日有 ' + (totalMeds - doneCount) + ' 次未服药</div>' +
          '<div class="alert-desc">请提醒' + patientName + '按时服药</div>' +
        '</div>' +
        '<button class="alert-action" onclick="showToast(\'已发送提醒给' + patientName + '\')">提醒吃药</button>' +
      '</div>';
    }
    alertsArea.innerHTML = alertHtml;
  }

  // 生成只读时间轴
  var timelineArea = document.querySelector('#page-fm-home .fm-timeline');
  if (timelineArea) {
    var timeSlots = {
      '晨起 7:00': { hour: 7, icon: '&#9728;', label: '晨起 · 07:00', meds: [] },
      '早餐后 8:00': { hour: 8, icon: '&#127860;', label: '早餐后 · 08:00', meds: [] },
      '午餐后 14:30': { hour: 14.5, icon: '&#9728;', label: '午餐后 · 14:30', meds: [] },
      '晚餐后 18:30': { hour: 18.5, icon: '&#127869;', label: '晚餐后 · 18:30', meds: [] },
      '晚间 21:00': { hour: 21, icon: '&#127769;', label: '晚间 · 21:00', meds: [] }
    };

    meds.forEach(function(med) {
      if (med.created_at && dateStr < med.created_at.slice(0, 10)) return;
      if (med.times) {
        med.times.forEach(function(t) {
          if (timeSlots[t]) timeSlots[t].meds.push(med);
        });
      }
    });

    var tlHtml = '';
    Object.keys(timeSlots).forEach(function(key) {
      var slot = timeSlots[key];
      if (slot.meds.length === 0) return;

      tlHtml += '<div class="fm-tl-item">';
      tlHtml += '<div class="fm-tl-period"><span>' + slot.icon + '</span> ' + slot.label + '</div>';

      slot.meds.forEach(function(med) {
        // 检查是否已打卡
        var isDone = false;
        records.forEach(function(r) {
          if (r.medication_id === med.id && r.time_slot === String(slot.hour) && r.status === 'done') {
            isDone = true;
          }
        });

        if (isDone) {
          tlHtml += '<div class="fm-tl-status">&#10003; 已服用 · ' + med.name + '</div>';
        } else {
          tlHtml += '<div class="fm-tl-status waiting">等待中 · ' + med.name +
            ' <button class="fm-remind-btn" onclick="showToast(\'已提醒' + patientName + '吃' + med.name + '\')">提醒</button></div>';
        }
      });

      tlHtml += '</div>';
    });

    timelineArea.innerHTML = tlHtml;
  }
}

// ====== 加载患者药品库存 ======
async function loadPatientStock(patientId) {
  var meds = await getPatientMedications(patientId);

  // 更新库存总览
  var stockPage = document.getElementById('page-fm-stock');
  if (!stockPage) return;

  var urgentCount = 0;
  var totalWeekly = 0;

  var listHtml = '';
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

    listHtml += '<div class="box-card ' + (isUrgent ? 'urgent' : 'normal') + '">';
    listHtml += '<div class="box-header-row">';
    listHtml += '<div class="box-drug-name">' + med.name + '</div>';
    listHtml += '<span class="box-tag ' + (isUrgent ? 'tag-urgent' : 'tag-ok') + '">' + (isUrgent ? '快吃完了' : '药量充足') + '</span>';
    listHtml += '</div>';
    listHtml += '<div class="box-spec">' + (med.dosage || '') + '</div>';
    listHtml += '<div class="box-meter"><div class="meter-bar"><div class="meter-fill ' + (isUrgent ? 'urgent-fill' : 'ok-fill') + '" style="width:' + pct + '%"></div></div>';
    listHtml += '<div class="meter-text">剩余 ' + med.stock_count + ' 片</div></div>';
    listHtml += '<div class="box-info-row">';
    listHtml += '<div class="box-info"><span class="box-info-label">日均用量</span><span>' + daily + '片/天</span></div>';
    listHtml += '<div class="box-info"><span class="box-info-label">可服天数</span><span' + (isUrgent ? ' class="warn-text"' : '') + '>' + days + '天</span></div>';
    listHtml += '<div class="box-info"><span class="box-info-label">预计用完</span><span' + (isUrgent ? ' class="warn-text"' : '') + '>' + dateStr + '</span></div>';
    listHtml += '</div></div>';
  });

  // 更新总览数字
  var boItems = stockPage.querySelectorAll('.bo-item .bo-num');
  if (boItems[0]) boItems[0].textContent = meds.length;
  if (boItems[1]) {
    boItems[1].textContent = urgentCount;
    boItems[1].classList.toggle('warn-text', urgentCount > 0);
  }
  if (boItems[2]) boItems[2].textContent = totalWeekly;

  // 更新列表
  var boxList = stockPage.querySelector('.box-list');
  if (boxList) boxList.innerHTML = listHtml || '<div class="empty-state" style="padding:30px 0"><div class="empty-icon">📦</div><div class="empty-title">患者还没有添加药品</div></div>';

  // 更新页面标题
  var header = stockPage.querySelector('.page-header h2');
  if (header) header.textContent = boundPatientName + '的药品库存';
}

// ====== 加载设置页 ======
function loadBoundPatients(patients) {
  var settingsContent = document.querySelector('#page-fm-settings .content');
  if (!settingsContent) return;

  var name = boundPatientName;
  var relation = (patients[0] && patients[0].relation) || '家人';

  settingsContent.innerHTML =
    // 管理对象卡片
    '<div class="fm-person-card" style="margin-top:16px">' +
      '<div class="fm-person-avatar">' + name.charAt(0) + '</div>' +
      '<div class="fm-person-info">' +
        '<div class="fm-person-name">' + relation + ' · ' + name + '</div>' +
        '<div class="fm-person-bind">正在管理中</div>' +
      '</div>' +
    '</div>' +
    // 管理对象列表
    '<div class="panel-section">' +
      '<div class="panel-section-title">&#128106; 管理对象</div>' +
      '<div class="family-list">' +
        '<div class="family-card" style="border:2px solid var(--primary)">' +
          '<div class="family-avatar">' + name.charAt(0) + '</div>' +
          '<div class="family-info">' +
            '<div class="family-name">' + name + ' <span class="family-role">' + relation + '</span></div>' +
            '<div class="family-phone">当前管理</div>' +
          '</div>' +
          '<div class="family-status bound">管理中</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    // 切换角色按钮
    '<button class="fm-exit-btn" onclick="backToRoleSelect()">切换角色</button>';
}
