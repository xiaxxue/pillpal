// ====== 本地存储 ======
// localStorage 就是浏览器自带的一个小仓库，刷新页面数据不会丢
function saveData(key, value) {
  try { localStorage.setItem('yygh_' + key, JSON.stringify(value)); } catch(e) {}
}
function loadData(key, fallback) {
  try {
    var v = localStorage.getItem('yygh_' + key);
    return v ? JSON.parse(v) : fallback;
  } catch(e) { return fallback; }
}

// 保存今日打卡记录：{ "氨氯地平片_7": "done_07:12", "二甲双胍_14.5": "skip_忘记携带" }
var todayStr = new Date().toISOString().slice(0, 10);
var medRecords = loadData('med_' + todayStr, {});
var stockData = loadData('stock', {}); // { "氨氯地平片": 12, ... }
var familyData = loadData('family', []); // [{ name, relation, phone }]
var reminderData = loadData('reminder', {}); // { "应用通知": true, ... }

// ====== 顶栏自动收起 ======
let topBarTimer = null;

function collapseTopBar() {
  const topBar = document.getElementById('topBar');
  if (topBar) topBar.classList.add('collapsed');
}

function expandTopBar() {
  const topBar = document.getElementById('topBar');
  if (topBar) topBar.classList.remove('collapsed');
  clearTimeout(topBarTimer);
  topBarTimer = setTimeout(collapseTopBar, 5000);
}

// 页面加载后 3 秒自动收起
topBarTimer = setTimeout(collapseTopBar, 3000);

// ====== 用药时间轴动态状态 ======

// 重置时间轴到默认状态
function resetTimeline() {
  var sections = document.querySelectorAll('.med-timeline .mt-section');
  sections.forEach(function(sec) {
    var period = sec.querySelector('.mt-period');
    period.classList.remove('current-period');
    // 移除动态标签
    var tags = period.querySelectorAll('.mt-now, .mt-missed-tag, .mt-upcoming-tag, .mt-past-tag');
    tags.forEach(function(t) { t.remove(); });
    // 重置卡片
    var cards = sec.querySelectorAll('.med-card');
    cards.forEach(function(card) {
      card.classList.remove('done', 'active-card', 'upcoming-card', 'past-card', 'just-done');
      card.style.flexDirection = '';
      card.style.alignItems = '';
      card.style.opacity = '';
      // 如果卡片被改成了mc-right（已打卡状态），恢复成按钮
      var right = card.querySelector('.mc-right');
      if (right) {
        right.outerHTML =
          '<div class="mc-actions">' +
            '<button class="btn-take-full" onclick="takeMedCard(this)">&#10003; 已服用</button>' +
            '<button class="btn-later-sm" onclick="laterMedCard(this)">30分钟后提醒</button>' +
            '<button class="btn-skip" onclick="skipMedCard(this)">跳过</button>' +
          '</div>';
      }
      // 恢复按钮文字
      var takeBtn = card.querySelector('.btn-take-full');
      if (takeBtn) takeBtn.innerHTML = '&#10003; 已服用';
    });
  });
}

// offset: 0=今天, -1=昨天, 1=明天, ...
function initTimeline(offset) {
  if (offset === undefined) offset = 0;

  var sections = document.querySelectorAll('.med-timeline .mt-section');
  var times = [];
  sections.forEach(function(sec) {
    times.push(parseFloat(sec.getAttribute('data-time')));
  });

  if (offset > 0) {
    // 未来日期：只显示"待服用"文字，不显示任何按钮
    sections.forEach(function(sec) {
      var cards = sec.querySelectorAll('.med-card');
      cards.forEach(function(card) {
        card.classList.add('upcoming-card');
        var actions = card.querySelector('.mc-actions');
        if (actions) {
          actions.outerHTML =
            '<div class="mc-right">' +
              '<span class="mc-status-wait">待服用</span>' +
            '</div>';
        }
      });
    });
    updateAllProgress();
    return;
  }

  if (offset < 0) {
    // 过去日期：全部模拟为已服用
    sections.forEach(function(sec, idx) {
      var cards = sec.querySelectorAll('.med-card');
      var timeVal = times[idx];
      cards.forEach(function(card) {
        card.classList.add('done');
        var baseHour = Math.floor(timeVal);
        var baseMin = (timeVal % 1) * 60;
        var randomExtra = Math.floor(Math.random() * 21) + 5;
        var totalMin = baseMin + randomExtra;
        var displayMin = totalMin % 60;
        var timeStr = String(baseHour + Math.floor(totalMin / 60)).padStart(2,'0') + ':' + String(displayMin).padStart(2,'0');
        var actions = card.querySelector('.mc-actions');
        if (actions) {
          actions.outerHTML =
            '<div class="mc-right">' +
              '<span class="mc-status-done">&#10003; ' + timeStr + '</span>' +
            '</div>';
        }
      });
    });
    updateAllProgress();
    return;
  }

  // 今天：根据真实时间判断
  var now = new Date();
  var currentHour = now.getHours() + now.getMinutes() / 60;

  var currentIndex = -1;
  for (var i = times.length - 1; i >= 0; i--) {
    if (currentHour >= times[i]) {
      currentIndex = i;
      break;
    }
  }

  sections.forEach(function(sec, idx) {
    var period = sec.querySelector('.mt-period');
    var cards = sec.querySelectorAll('.med-card');

    if (idx === currentIndex && currentIndex !== -1) {
      // 当前时段：高亮
      period.classList.add('current-period');
      var nowTag = document.createElement('span');
      nowTag.className = 'mt-now';
      nowTag.textContent = '当前';
      period.appendChild(nowTag);
    }
    // 今天所有时段统一显示三个按钮，样式都一样
    cards.forEach(function(card) {
      card.classList.add('active-card');
    });
  });

  updateAllProgress();
}

function updateAllProgress() {
  const doneCount = document.querySelectorAll('#page-home .med-card.done').length;
  const totalCount = document.querySelectorAll('#page-home .med-card').length;

  // 更新进度条
  const fill = document.querySelector('.prog-fill');
  const text = document.querySelector('.prog-text');
  if (fill) fill.style.width = Math.round(doneCount / totalCount * 100) + '%';
  if (text) text.textContent = '已完成 ' + doneCount + '/' + totalCount + ' 次服药';

  // 更新今日概览的已服数
  const summaryEl = document.querySelector('.s-card-num .done');
  if (summaryEl) summaryEl.textContent = doneCount;
}

// ====== 动态生成日期选择器 ======
function buildDatePicker() {
  var picker = document.getElementById('datePicker');
  if (!picker) return;
  var today = new Date();
  var weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  var html = '';
  for (var i = -7; i <= 7; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var label = '';
    if (i === -1) label = '昨天';
    else if (i === 0) label = '今天';
    else if (i === 1) label = '明天';
    else label = weekNames[d.getDay()];
    var activeClass = (i === 0) ? ' active' : '';
    html += '<div class="date-item' + activeClass + '" data-offset="' + i + '" data-month="' + month + '" onclick="selectDate(this)">' +
      '<div class="d-week">' + label + '</div>' +
      '<div class="d-day">' + day + '</div>' +
    '</div>';
  }
  picker.innerHTML = html;
  // 滚动到"今天"居中
  setTimeout(function() {
    var active = picker.querySelector('.date-item.active');
    if (active) {
      picker.scrollLeft = active.offsetLeft - picker.offsetWidth / 2 + active.offsetWidth / 2;
    }
    updateMonthLabel();
  }, 50);
  // 滑动时更新月份
  picker.addEventListener('scroll', updateMonthLabel);
}

function updateMonthLabel() {
  var picker = document.getElementById('datePicker');
  var label = document.getElementById('dateMonthLabel');
  if (!picker || !label) return;
  // 找到当前可视区域中间的日期项
  var centerX = picker.scrollLeft + picker.offsetWidth / 2;
  var items = picker.querySelectorAll('.date-item');
  var closestItem = items[0];
  var minDist = Infinity;
  items.forEach(function(item) {
    var itemCenter = item.offsetLeft + item.offsetWidth / 2;
    var dist = Math.abs(itemCenter - centerX);
    if (dist < minDist) { minDist = dist; closestItem = item; }
  });
  var month = closestItem.getAttribute('data-month');
  label.textContent = month + '月';
}

buildDatePicker();

// 页面加载时初始化时间轴（今天）
initTimeline(0);

// ====== 页面切换 ======
const tabMap = {
  'tab-home': 'page-home',
  'tab-box': 'page-box',
  'tab-renew': 'page-renew',
  'tab-ai': 'page-ai',
  'tab-profile': 'page-profile'
};

function switchTab(tabId) {
  document.querySelectorAll('#tab-bar-main .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.getElementById(tabMap[tabId]).classList.add('active');
  // 滚动到顶部
  document.getElementById(tabMap[tabId]).scrollTop = 0;
}

// ====== 日期选择 ======
function selectDate(el) {
  document.querySelectorAll('.date-item').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  var offset = parseInt(el.getAttribute('data-offset')) || 0;
  resetTimeline();
  initTimeline(offset);
}

// ====== 首页时间轴 - 服药操作 ======
function takeMed(btn) {
  const card = btn.closest('.tl-card');
  const item = btn.closest('.tl-item');
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');
  card.querySelector('.tl-actions').outerHTML =
    '<div class="tl-status"><span class="badge-done">&#10003; ' + timeStr + ' 已服</span></div>';
  item.classList.remove('current');
  item.classList.add('done');
  item.querySelector('.tl-dot').classList.remove('pulse');
  updateHomeProgress();
  showToast('服药已记录');
}

function laterMed(btn) {
  showToast('将在 30 分钟后再次提醒');
  btn.textContent = '已设提醒';
  btn.disabled = true;
  btn.style.opacity = '0.5';
}

// ====== 用药计划页 - 服药操作 ======
function getMedKey(card) {
  var name = card.querySelector('.mc-name').textContent;
  var sec = card.closest('.mt-section');
  var time = sec ? sec.getAttribute('data-time') : '0';
  return name + '_' + time;
}

function takeMedCard(btn) {
  const card = btn.closest('.med-card');
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');
  card.classList.remove('active-card', 'upcoming-card', 'past-card');
  card.classList.add('done', 'just-done');
  var actions = card.querySelector('.mc-actions');
  if (actions) {
    actions.outerHTML =
      '<div class="mc-right">' +
        '<span class="mc-status-done">&#10003; ' + timeStr + '</span>' +
        '<button class="btn-undo" onclick="undoMed(this)">撤回</button>' +
      '</div>';
  }
  card.style.flexDirection = 'row';
  // 保存打卡记录
  medRecords[getMedKey(card)] = 'done_' + timeStr;
  saveData('med_' + todayStr, medRecords);
  updateAllProgress();
  // 震动反馈 + 大对勾动画
  if (navigator.vibrate) navigator.vibrate(100);
  showDoneCheck();
  showToast('服药已记录');
}

function laterMedCard(btn) {
  showToast('将在 30 分钟后再次提醒');
  btn.textContent = '已设提醒';
  btn.disabled = true;
  btn.style.opacity = '0.5';
}

let skipTarget = null;
function skipMedCard(btn) {
  skipTarget = btn.closest('.med-card');
  document.getElementById('skipModal').classList.add('show');
}

function confirmSkip(reason) {
  if (skipTarget) {
    skipTarget.classList.remove('active-card');
    skipTarget.classList.add('done');
    skipTarget.querySelector('.mc-actions').outerHTML =
      '<div class="mc-right"><span class="mc-status-done" style="color:var(--text-third)">已跳过 · ' + reason + '</span></div>';
    skipTarget.style.flexDirection = 'row';
    skipTarget.style.opacity = '0.5';
    // 保存跳过记录
    medRecords[getMedKey(skipTarget)] = 'skip_' + reason;
    saveData('med_' + todayStr, medRecords);
  }
  document.getElementById('skipModal').classList.remove('show');
  showToast('已记录跳过原因');
}

// ====== 进度更新 ======
function updateHomeProgress() {
  const done = document.querySelectorAll('#page-home .tl-item.done').length;
  const total = document.querySelectorAll('#page-home .tl-item').length;
  const summaryEl = document.querySelector('.s-card-num .done');
  if (summaryEl) summaryEl.textContent = done;
}

function updateMedProgress() {
  const done = document.querySelectorAll('#page-home .med-card.done').length;
  const total = document.querySelectorAll('#page-home .med-card').length;
  const fill = document.querySelector('.prog-fill');
  const text = document.querySelector('.prog-text');
  if (fill) fill.style.width = Math.round(done / total * 100) + '%';
  if (text) text.textContent = '已完成 ' + done + '/' + total + ' 次服药';
}

// ====== 依从性弹窗 ======
document.getElementById('scoreBtn').addEventListener('click', function() {
  document.getElementById('scoreModal').classList.add('show');
});

function closeScoreModal(e) {
  if (e.target === e.currentTarget) {
    document.getElementById('scoreModal').classList.remove('show');
  }
}

// ====== Toast ======
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ====== 智能体客服系统 ======

// --- 记忆模块 ---
var shortMemory = { history: [], currentTopic: null, mentionedDrug: null };
var longMemory = {
  name: '张叔叔',
  lastTopic: '血压偏高',
  allergies: ['青霉素'],
  bpTrend: '近期偏高'
};

// --- 工具层（模拟数据） ---
var tools = {
  stockAPI: {
    checkAll: function() {
      return [
        { name: '氨氯地平片', remain: 12, daily: 1, days: 6, status: 'warn', date: '5月1日' },
        { name: '盐酸二甲双胍片', remain: 58, daily: 3, days: 19, status: 'ok', date: '5月14日' },
        { name: '阿司匹林肠溶片', remain: 45, daily: 1, days: 45, status: 'ok', date: '6月9日' },
        { name: '阿托伐他汀钙片', remain: 22, daily: 1, days: 22, status: 'ok', date: '5月17日' }
      ];
    }
  },
  medAPI: {
    checkRecords: function() {
      return { rate: '92%', total: 35, done: 33, missed: 2, delayed: 3, streak: 4 };
    },
    todayStatus: function() {
      return [
        { name: '氨氯地平片', time: '07:00', status: 'done', actual: '07:12' },
        { name: '阿司匹林肠溶片', time: '07:00', status: 'done', actual: '07:12' },
        { name: '盐酸二甲双胍片', time: '08:00', status: 'done', actual: '08:23' },
        { name: '盐酸二甲双胍片', time: '14:30', status: 'pending' },
        { name: '阿托伐他汀钙片', time: '21:00', status: 'pending' }
      ];
    }
  },
  bookingAPI: {
    getDoctorSlots: function() {
      return [
        { doctor: '李建华', dept: '心内科', slots: ['明天 10:00', '明天 14:00', '后天 09:00'] },
        { doctor: '王明芳', dept: '内分泌科', slots: ['后天 10:00', '后天 15:00'] }
      ];
    },
    getLastVisit: function() {
      return {
        doctor: '李建华', dept: '心内科', date: '2026.03.28', type: '图文问诊',
        summary: '血压控制尚可，继续当前方案，注意低盐饮食，下次复诊带近期血压记录',
        rx: '氨氯地平 5mg x 30片、阿司匹林 100mg x 30片'
      };
    }
  },
  healthAPI: {
    checkBP: function() {
      return { recent: '135/85', trend: '近期偏高', lastDate: '4月24日' };
    },
    recordBP: function(sys, dia) {
      return {
        value: sys + '/' + dia,
        level: parseInt(sys) >= 140 || parseInt(dia) >= 90 ? 'high' : (parseInt(sys) >= 130 ? 'borderline' : 'normal'),
        suggestion: parseInt(sys) >= 140 ? '偏高，建议近期复诊' : (parseInt(sys) >= 130 ? '临界值，请注意监测' : '正常范围')
      };
    }
  },
  renewAPI: {
    checkConditions: function() {
      return {
        drug: '氨氯地平片 5mg',
        remain: 12,
        days: 6,
        rxValid: true,
        rxDoctor: '李建华',
        rxDate: '2026.03.28',
        noConsecutiveMiss: true,
        bpRecord: bpRecordCount >= 1,
        medRecord: true,
        allReady: bpRecordCount >= 1
      };
    }
  }
};

// --- 快捷问题分组 ---
var skillQuestions = {
  medMgmt: [
    { text: '今天还有哪些药没吃？', icon: '&#128138;' },
    { text: '昨晚漏服二甲双胍怎么办？', icon: '&#128336;' },
    { text: '帮我修改用药计划', icon: '&#9998;' }
  ],
  stockQuery: [
    { text: '帮我查一下库存', icon: '&#128230;' },
    { text: '哪些药快没了？', icon: '&#9888;' }
  ],
  renew: [
    { text: '帮我续方氨氯地平', icon: '&#128203;' },
    { text: '续方需要什么条件？', icon: '&#10067;' }
  ],
  booking: [
    { text: '帮我约李医生', icon: '&#128197;' },
    { text: '上次问诊医生说了什么？', icon: '&#128172;' }
  ],
  health: [
    { text: '血压135/85帮我记一下', icon: '&#10084;' },
    { text: '看看我的服药报告', icon: '&#128202;' },
    { text: '吃二甲双胍能喝酒吗？', icon: '&#127866;' }
  ]
};

// 初始化快捷问题
function renderQuickQuestions(skill) {
  var container = document.getElementById('quickQuestions');
  var questions = skillQuestions[skill] || [];
  var html = '';
  questions.forEach(function(q) {
    html += '<button class="qq-btn" onclick="askQuick(this)">' +
      '<span class="qq-icon">' + q.icon + '</span> ' + q.text + '</button>';
  });
  container.innerHTML = html;
}

function switchSkill(btn) {
  document.querySelectorAll('.skill-tag').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  renderQuickQuestions(btn.getAttribute('data-skill'));
}

// 初始化默认分组
renderQuickQuestions('medMgmt');

// --- "+"菜单 ---
function togglePlusMenu() {
  var overlay = document.getElementById('plusMenuOverlay');
  overlay.classList.toggle('show');
}
function closePlusMenu() {
  document.getElementById('plusMenuOverlay').classList.remove('show');
}
function plusMenuAction(skill) {
  closePlusMenu();
  // 激活对应标签
  document.querySelectorAll('.skill-tag').forEach(function(t) { t.classList.remove('active'); });
  var tag = document.querySelector('.skill-tag[data-skill="' + skill + '"]');
  if (tag) tag.classList.add('active');
  renderQuickQuestions(skill);
  // 自动发消息
  var msgs = {
    medMgmt: '今天还有哪些药没吃？',
    stockQuery: '帮我查一下库存',
    renew: '帮我续方',
    booking: '帮我约医生',
    health: '看看我的服药报告'
  };
  if (msgs[skill]) {
    addUserMsg(msgs[skill]);
    document.getElementById('quickQuestions').style.display = 'none';
    orchestrate(detectIntent(msgs[skill]), msgs[skill]);
  }
}

// --- 意图识别 ---
function detectIntent(input) {
  // 先检查短期记忆上下文
  if (shortMemory.currentTopic && /^(好的|确认|发起|可以|行|没问题|对)/.test(input)) {
    return 'confirm';
  }
  // 血压+数字
  if (/血压\s*\d+\s*[\/\\]\s*\d+/.test(input)) return 'recordBP';
  // 关键词匹配
  if (/续方|帮我续/.test(input)) return 'renew';
  if (/库存|还剩|快没了|够吃/.test(input)) return 'stock';
  if (/约医生|预约|挂号/.test(input)) return 'booking';
  if (/没吃|今天|漏服|今日用药/.test(input)) return 'todayMeds';
  if (/一起吃|冲突|相互作用/.test(input)) return 'drugInteraction';
  if (/上次问诊|医嘱|医生说/.test(input)) return 'doctorNotes';
  if (/服药情况|报告|数据|服药率/.test(input)) return 'weekReport';
  if (/修改计划|编辑/.test(input)) return 'editPlan';
  if (/喝酒|饮酒/.test(input)) return 'alcohol';
  if (/那个药|这个药/.test(input) && shortMemory.mentionedDrug) return 'stock';
  return 'unknown';
}

// --- 执行计划 ---
var intentPlans = {
  renew: [
    { tool: 'renewAPI.checkConditions', label: '正在检查续方条件...' },
    { tool: 'medAPI.checkRecords', label: '正在核查服药记录...' },
    { tool: 'stockAPI.checkAll', label: '正在确认库存状态...' },
    { tool: 'healthAPI.checkBP', label: '正在检查血压记录...' }
  ],
  stock: [
    { tool: 'stockAPI.checkAll', label: '正在查询药品库存...' },
    { tool: null, label: '正在分析用量趋势...' }
  ],
  booking: [
    { tool: 'bookingAPI.getDoctorSlots', label: '正在查询医生排班...' },
    { tool: 'bookingAPI.getLastVisit', label: '正在获取历史问诊信息...' }
  ],
  todayMeds: [
    { tool: 'medAPI.todayStatus', label: '正在查询今日用药状态...' }
  ],
  recordBP: [
    { tool: null, label: '正在解析血压数值...' },
    { tool: 'healthAPI.checkBP', label: '正在对比历史记录...' },
    { tool: null, label: '正在生成健康评估...' }
  ],
  doctorNotes: [
    { tool: 'bookingAPI.getLastVisit', label: '正在检索问诊记录...' },
    { tool: null, label: '正在提取医嘱摘要...' }
  ],
  weekReport: [
    { tool: 'medAPI.checkRecords', label: '正在汇总服药数据...' },
    { tool: null, label: '正在生成分析报告...' }
  ]
};

// --- 调度中心 ---
function orchestrate(intent, input) {
  var plan = intentPlans[intent] || [];

  // 收集工具结果
  var results = {};
  plan.forEach(function(step) {
    if (step.tool) {
      var parts = step.tool.split('.');
      var api = tools[parts[0]];
      if (api && api[parts[1]]) {
        results[step.tool] = api[parts[1]]();
      }
    }
  });

  // 生成思考过程标签
  var thinkSteps = plan.map(function(s) { return s.label; });

  // 根据意图生成回复
  var reply = generateReply(intent, input, results);

  // 更新记忆
  updateMemory(intent, input, reply);

  // 显示思考过程，然后显示正式回复
  if (thinkSteps.length > 0) {
    showThinkingThenReply(thinkSteps, reply);
  } else {
    addAgentReply(reply);
  }
}

// --- 思考过程动画 ---
function showThinkingThenReply(steps, reply) {
  var area = document.getElementById('chatMessages');
  var thinkDiv = document.createElement('div');
  thinkDiv.className = 'chat-msg ai';
  thinkDiv.innerHTML = '<div class="chat-msg-avatar">&#129432;</div>' +
    '<div class="ai-thinking" id="thinkBubble"></div>';
  area.appendChild(thinkDiv);
  scrollChat();

  var bubble = document.getElementById('thinkBubble');
  var i = 0;

  function showStep() {
    if (i < steps.length) {
      var step = document.createElement('div');
      step.className = 'think-step';
      step.innerHTML = '<span class="think-icon">&#9881;</span> ' + steps[i];
      step.style.opacity = '0';
      bubble.appendChild(step);
      // 用 requestAnimationFrame 确保动画触发
      requestAnimationFrame(function() {
        step.style.transition = 'opacity 0.3s';
        step.style.opacity = '1';
      });
      scrollChat();
      i++;
      setTimeout(showStep, 500);
    } else {
      // 全部出现后1秒消失
      setTimeout(function() {
        thinkDiv.style.transition = 'opacity 0.4s';
        thinkDiv.style.opacity = '0';
        setTimeout(function() {
          thinkDiv.remove();
          addAgentReply(reply);
        }, 400);
      }, 1000);
    }
  }
  showStep();
}

// --- 回复生成 ---
function generateReply(intent, input, results) {
  switch (intent) {
    case 'renew': {
      var cond = results['renewAPI.checkConditions'] || {};
      shortMemory.currentTopic = 'renew';
      shortMemory.mentionedDrug = '氨氯地平';
      var rows = '';
      rows += '<div class="ac-row"><span>&#128203; 历史处方</span><span class="ac-status-ok">有效 (' + (cond.rxDoctor || '李建华') + ')</span></div>';
      rows += '<div class="ac-row"><span>&#128138; 服药记录</span><span class="ac-status-ok">33/35 按时</span></div>';
      rows += '<div class="ac-row"><span>&#10003; 无连续漏服</span><span class="ac-status-ok">符合条件</span></div>';
      rows += '<div class="ac-row"><span>&#10084; 血压记录</span><span class="' +
        (cond.bpRecord ? 'ac-status-ok' : 'ac-status-warn') + '">' +
        (cond.bpRecord ? '已上传' : '需补充') + '</span></div>';
      var btnHtml = cond.allReady
        ? '<button class="ac-btn" onclick="doRenew()">发起续方</button>'
        : '<button class="ac-btn" onclick="switchTab(\'tab-renew\')">去补充血压记录</button>';
      return {
        text: longMemory.name + '，我帮您检查了' + (cond.drug || '氨氯地平片 5mg') + '的续方条件：',
        thinking: true,
        actionCard: '<div class="ai-action-card">' + rows + btnHtml + '</div>',
        warn: cond.allReady ? null : '还需补充血压记录才能发起续方，您也可以直接告诉我血压值，如"血压135/85"。'
      };
    }
    case 'stock': {
      var stocks = results['stockAPI.checkAll'] || [];
      shortMemory.currentTopic = 'stock';
      var rows = '';
      stocks.forEach(function(s) {
        var statusCls = s.status === 'warn' ? 'ac-status-warn' : 'ac-status-ok';
        var statusTxt = s.status === 'warn' ? '&#9888; ' + s.days + '天' : s.days + '天';
        rows += '<div class="ac-row"><span>' + s.name + '</span><span>剩' + s.remain + '片</span><span class="' + statusCls + '">' + statusTxt + '</span></div>';
        if (s.status === 'warn') shortMemory.mentionedDrug = s.name;
      });
      return {
        text: longMemory.name + '，以下是您的药品库存情况：',
        actionCard: '<div class="ai-action-card">' + rows +
          '<button class="ac-btn" onclick="switchTab(\'tab-box\')">查看库存</button></div>',
        warn: null
      };
    }
    case 'booking': {
      var slots = results['bookingAPI.getDoctorSlots'] || [];
      shortMemory.currentTopic = 'booking';
      var rows = '';
      slots.forEach(function(doc) {
        rows += '<div class="ac-row ac-row-title"><span>&#128105;&#8205;&#9877; ' + doc.doctor + ' · ' + doc.dept + '</span></div>';
        doc.slots.forEach(function(s) {
          rows += '<div class="ac-row ac-slot" onclick="bookSlot(\'' + doc.doctor + '\',\'' + s + '\')">' +
            '<span>&#128197; ' + s + '</span><span class="ac-status-ok">可预约</span></div>';
        });
      });
      return {
        text: longMemory.name + '，以下是可预约的医生和时段，点击即可预约：',
        actionCard: '<div class="ai-action-card">' + rows + '</div>',
        warn: null
      };
    }
    case 'todayMeds': {
      var meds = results['medAPI.todayStatus'] || [];
      shortMemory.currentTopic = 'todayMeds';
      var pending = meds.filter(function(m) { return m.status === 'pending'; });
      var done = meds.filter(function(m) { return m.status === 'done'; });
      var rows = '';
      done.forEach(function(m) {
        rows += '<div class="ac-row"><span>&#128138; ' + m.name + ' ' + m.time + '</span><span class="ac-status-ok">&#10003; ' + m.actual + '</span></div>';
      });
      pending.forEach(function(m) {
        rows += '<div class="ac-row"><span>&#128138; ' + m.name + ' ' + m.time + '</span><span class="ac-status-warn">待服用</span></div>';
      });
      return {
        text: longMemory.name + '，今天您已完成 ' + done.length + '/' + meds.length + ' 次服药' +
          (pending.length > 0 ? '，还有 ' + pending.length + ' 次待完成：' : '，全部完成！'),
        actionCard: '<div class="ai-action-card">' + rows +
          '<button class="ac-btn" onclick="switchTab(\'tab-home\')">回到首页</button></div>',
        warn: null
      };
    }
    case 'recordBP': {
      var match = input.match(/(\d+)\s*[\/\\]\s*(\d+)/);
      if (match) {
        var sys = match[1], dia = match[2];
        var bpResult = tools.healthAPI.recordBP(sys, dia);
        shortMemory.currentTopic = 'recordBP';
        var levelCls = bpResult.level === 'high' ? 'ac-status-bad' : (bpResult.level === 'borderline' ? 'ac-status-warn' : 'ac-status-ok');
        var levelTxt = bpResult.level === 'high' ? '偏高' : (bpResult.level === 'borderline' ? '临界' : '正常');
        return {
          text: longMemory.name + '，血压已记录！',
          actionCard: '<div class="ai-action-card">' +
            '<div class="ac-row"><span>&#10084; 本次测量</span><span class="' + levelCls + '">' + bpResult.value + ' mmHg</span></div>' +
            '<div class="ac-row"><span>&#128200; 评估结果</span><span class="' + levelCls + '">' + levelTxt + '</span></div>' +
            '<div class="ac-row"><span>&#128172; 建议</span><span>' + bpResult.suggestion + '</span></div>' +
            '</div>',
          warn: bpResult.level === 'high' ? '血压偏高，建议近期预约复诊，让医生评估是否需要调整用药方案。' : null
        };
      }
      return { text: '请告诉我您的血压值，格式如"血压135/85"。', warn: null };
    }
    case 'drugInteraction': {
      shortMemory.currentTopic = null;
      return {
        text: '<p><strong>关于您当前用药的相互作用分析：</strong></p>' +
          '<p>&#10003; 氨氯地平 + 阿司匹林：<strong>安全</strong>，临床常见联合用药</p>' +
          '<p>&#10003; 氨氯地平 + 二甲双胍：<strong>安全</strong>，无明显相互作用</p>' +
          '<p>&#9888; 阿托伐他汀 + 葡萄柚汁：<strong>避免</strong>，会影响药物代谢</p>' +
          '<p>&#10003; 阿司匹林 + 二甲双胍：<strong>安全</strong>，但注意胃肠道反应</p>',
        warn: '以上为常见药物相互作用参考，具体请遵医嘱。您正在服用的4种药物整体方案是安全的。',
        actionCard: null
      };
    }
    case 'doctorNotes': {
      var visit = results['bookingAPI.getLastVisit'] || {};
      shortMemory.currentTopic = 'doctorNotes';
      return {
        text: longMemory.name + '，以下是您最近一次问诊记录：',
        actionCard: '<div class="ai-action-card">' +
          '<div class="ac-row"><span>&#128105;&#8205;&#9877; 医生</span><span>' + visit.doctor + ' · ' + visit.dept + '</span></div>' +
          '<div class="ac-row"><span>&#128197; 时间</span><span>' + visit.date + '</span></div>' +
          '<div class="ac-row"><span>&#128172; 方式</span><span>' + visit.type + '</span></div>' +
          '<div class="ac-row ac-row-full"><span>&#128221; 医嘱</span></div>' +
          '<div class="ac-row-detail">' + visit.summary + '</div>' +
          '<div class="ac-row ac-row-full"><span>&#128138; 处方</span></div>' +
          '<div class="ac-row-detail">' + visit.rx + '</div>' +
          '</div>',
        warn: null
      };
    }
    case 'weekReport': {
      var rec = results['medAPI.checkRecords'] || {};
      shortMemory.currentTopic = 'weekReport';
      return {
        text: longMemory.name + '，以下是您近7日的服药数据：',
        actionCard: '<div class="ai-action-card">' +
          '<div class="ac-row"><span>&#128200; 按时服药率</span><span class="ac-status-ok">' + rec.rate + '</span></div>' +
          '<div class="ac-row"><span>&#128138; 总计/完成</span><span>' + rec.done + '/' + rec.total + ' 次</span></div>' +
          '<div class="ac-row"><span>&#9888; 漏服</span><span class="ac-status-warn">' + rec.missed + ' 次</span></div>' +
          '<div class="ac-row"><span>&#128336; 延迟</span><span>' + rec.delayed + ' 次</span></div>' +
          '<div class="ac-row"><span>&#128293; 连续按时</span><span class="ac-status-ok">' + rec.streak + ' 天</span></div>' +
          '<button class="ac-btn" onclick="openMedData()">查看报告</button>' +
          '</div>',
        warn: null
      };
    }
    case 'editPlan': {
      shortMemory.currentTopic = null;
      return {
        text: longMemory.name + '，您可以在用药计划编辑器中修改服药时间、剂量等信息。',
        actionCard: '<div class="ai-action-card">' +
          '<div class="ac-row"><span>&#128138; 当前方案</span><span>4种药品 · 5次/日</span></div>' +
          '<button class="ac-btn" onclick="openMedPlanModal()">打开编辑</button>' +
          '</div>',
        warn: '修改用药计划前请先咨询医生，切勿自行调整剂量。'
      };
    }
    case 'alcohol': {
      shortMemory.currentTopic = null;
      return {
        text: '<p><strong>' + longMemory.name + '，强烈不建议饮酒！</strong></p>' +
          '<p>您目前服用的<strong>盐酸二甲双胍</strong>与酒精同时使用会增加<strong>乳酸酸中毒</strong>的风险，这是一种严重的不良反应。</p>' +
          '<p>此外，酒精还会：</p>' +
          '<p>&#8226; 影响血糖水平，导致低血糖<br>&#8226; 升高血压，影响氨氯地平的降压效果<br>&#8226; 加重肝脏负担，影响阿托伐他汀代谢</p>',
        warn: '&#9888; 服药期间请严格避免饮酒。如果饮酒后出现恶心、呕吐、腹痛、呼吸急促等症状，请立即就医。',
        actionCard: null
      };
    }
    case 'confirm': {
      var topic = shortMemory.currentTopic;
      if (topic === 'renew') {
        doRenew();
        return { text: '好的，正在为您发起续方申请...', warn: null };
      } else if (topic === 'booking') {
        return { text: '好的，请点击上方的时段卡片选择具体预约时间。', warn: null };
      } else if (topic === 'recordBP') {
        return { text: '血压已记录成功！如需续方可随时告诉我。', warn: null };
      }
      return { text: '好的，请问还有什么我可以帮您的吗？', warn: null };
    }
    case 'unknown':
    default: {
      return {
        text: longMemory.name + '，我可以帮您做以下这些事：',
        actionCard: '<div class="ai-action-card">' +
          '<button class="ac-btn ac-btn-outline" onclick="plusMenuAction(\'medMgmt\')">&#128138; 用药管理</button>' +
          '<button class="ac-btn ac-btn-outline" onclick="plusMenuAction(\'stockQuery\')">&#128230; 库存查询</button>' +
          '<button class="ac-btn ac-btn-outline" onclick="plusMenuAction(\'renew\')">&#128203; 续方购药</button>' +
          '<button class="ac-btn ac-btn-outline" onclick="plusMenuAction(\'booking\')">&#128197; 预约问诊</button>' +
          '<button class="ac-btn ac-btn-outline" onclick="plusMenuAction(\'health\')">&#10084; 健康记录</button>' +
          '</div>',
        warn: null
      };
    }
  }
}

// --- 记忆更新 ---
function updateMemory(intent, input, reply) {
  shortMemory.history.push({ role: 'user', text: input });
  shortMemory.history.push({ role: 'ai', intent: intent });
  // 保留最近10轮
  if (shortMemory.history.length > 20) {
    shortMemory.history = shortMemory.history.slice(-20);
  }
}

// --- 渲染回复 ---
function addAgentReply(reply) {
  var area = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg ai';
  var html = '<div class="chat-msg-avatar">&#129432;</div><div class="chat-msg-bubble">';
  html += reply.text;
  if (reply.actionCard) {
    html += reply.actionCard;
  }
  if (reply.warn) {
    html += '<div class="ai-warn">' + reply.warn + '</div>';
  }
  html += '</div>';
  div.innerHTML = html;
  area.appendChild(div);
  scrollChat();
}

// --- 操作函数 ---
function doRenew() {
  switchTab('tab-renew');
  setTimeout(function() { quickRenew(); }, 300);
}

function bookSlot(doctor, slot) {
  showToast('已预约 ' + doctor + ' ' + slot);
  shortMemory.currentTopic = null;
}

function openMedPlanModal() {
  showToast('用药计划编辑功能开发中');
}

// --- 入口函数 ---
function askQuick(btn) {
  var question = btn.textContent.replace(/^[\s\S]?\s/, '').trim();
  // 去掉可能的图标字符
  question = question.replace(/^[^\u4e00-\u9fa5a-zA-Z]*/, '').trim();
  addUserMsg(question);
  document.getElementById('quickQuestions').style.display = 'none';
  var intent = detectIntent(question);
  orchestrate(intent, question);
}

function sendChat() {
  var input = document.getElementById('chatInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  addUserMsg(text);
  document.getElementById('quickQuestions').style.display = 'none';

  var intent = detectIntent(text);
  orchestrate(intent, text);
}

function addUserMsg(text) {
  var area = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = '<div class="chat-msg-avatar">我</div>' +
    '<div class="chat-msg-bubble">' + escapeHtml(text) + '</div>';
  area.appendChild(div);
  scrollChat();
}

function scrollChat() {
  var chatScroll = document.getElementById('chatScroll');
  setTimeout(function() { chatScroll.scrollTop = chatScroll.scrollHeight; }, 50);
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ====== 撤回打卡 ======
function undoMed(btn) {
  const card = btn.closest('.med-card');
  card.classList.remove('done');
  card.classList.add('active-card');
  card.style.flexDirection = 'column';
  card.style.alignItems = 'stretch';
  const right = card.querySelector('.mc-right');
  right.outerHTML =
    '<div class="mc-actions">' +
      '<button class="btn-take-full" onclick="takeMedCard(this)">&#10003; 已服用</button>' +
      '<button class="btn-later-sm" onclick="laterMedCard(this)">30分钟后提醒</button>' +
      '<button class="btn-skip" onclick="skipMedCard(this)">跳过</button>' +
    '</div>';
  // 删除记录
  delete medRecords[getMedKey(card)];
  saveData('med_' + todayStr, medRecords);
  updateAllProgress();
  showToast('已撤回，请重新确认服药');
}

// ====== 库存修正 ======
let stockTarget = null;
function editStock(btn, drugName, currentQty) {
  stockTarget = btn.closest('.box-card');
  document.getElementById('stockDrugName').textContent = drugName;
  document.getElementById('stockInput').value = currentQty;
  document.getElementById('stockModal').classList.add('show');
}

function stepStock(delta) {
  const input = document.getElementById('stockInput');
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = val;
}

function confirmStock() {
  const qty = parseInt(document.getElementById('stockInput').value) || 0;
  const drugName = document.getElementById('stockDrugName').textContent;
  if (stockTarget) {
    const meterText = stockTarget.querySelector('.meter-text');
    if (meterText) meterText.textContent = '剩余 ' + qty + ' 片';
  }
  // 保存库存
  stockData[drugName] = qty;
  saveData('stock', stockData);
  document.getElementById('stockModal').classList.remove('show');
  showToast(drugName + ' 库存已修正为 ' + qty + ' 片');
}

// ====== 一键续方安全校验 ======
let bpRecordCount = 0;

let renewSubmitted = false;

function quickRenew() {
  const hasConsecutiveMiss = false;

  if (hasConsecutiveMiss) {
    showToast('检测到近期连续漏服，建议先复诊评估后再续方');
    return;
  }
  if (bpRecordCount < 1) {
    showToast('请先补充血压记录再续方');
    document.getElementById('clBloodPressure').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (renewSubmitted) {
    showToast('续方已提交，请等待审核');
    return;
  }
  renewSubmitted = true;

  // 第一步：推进到"已提交，等待审核"
  advanceRenewStep2();
  showToast('续方申请已提交，等待医师审核');

  // 滚动到进度条
  document.getElementById('renewSteps').scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 模拟：3秒后医师审核通过
  setTimeout(() => {
    advanceRenewStep3();
    showToast('李建华医生已审核通过处方');
  }, 3000);

  // 模拟：再1.5秒后可以下单
  setTimeout(() => {
    advanceRenewStep4();
  }, 4500);
}

function advanceRenewStep2() {
  // step2 从"当前"变为"已完成"
  var s2 = document.getElementById('rsStep2');
  s2.classList.remove('current-step');
  s2.classList.add('active-step');
  s2.querySelector('.rs-dot').classList.remove('current-dot');
  s2.querySelector('.rs-dot').classList.add('filled');
  s2.querySelector('.rs-line').classList.add('filled-line');
  s2.querySelector('.rs-desc').textContent = '4月25日 · 资料已提交';

  // step3 变为"当前-审核中"
  var s3 = document.getElementById('rsStep3');
  s3.classList.add('current-step');
  s3.querySelector('.rs-dot').classList.add('reviewing');
  s3.querySelector('.rs-desc').textContent = '审核中，请耐心等待...';
}

function advanceRenewStep3() {
  // step3 审核通过
  var s3 = document.getElementById('rsStep3');
  s3.classList.remove('current-step');
  s3.classList.add('active-step');
  var dot3 = s3.querySelector('.rs-dot');
  dot3.classList.remove('reviewing');
  dot3.classList.add('filled', 'approved');
  s3.querySelector('.rs-line').classList.add('filled-line');
  s3.querySelector('.rs-desc').textContent = '4月25日 · 李建华医生已审核通过';
}

function advanceRenewStep4() {
  // step4 变为当前，显示下单按钮
  var s4 = document.getElementById('rsStep4');
  s4.classList.add('current-step');
  s4.querySelector('.rs-dot').classList.add('current-dot');
  s4.querySelector('.rs-desc').textContent = '处方已生效，可立即下单';
  document.getElementById('rsOrderBtn').style.display = 'block';

  // 滚动到下单按钮
  document.getElementById('rsOrderBtn').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openRenewOrder() {
  // 更新下单弹窗的来源信息
  document.getElementById('orderSource').style.display = 'block';
  document.getElementById('orderSource').innerHTML =
    '<span class="order-source-icon">&#128203;</span>' +
    '<span>来源：一键续方 · 李建华医生审核通过</span>';
  document.getElementById('orderModalTitle').textContent = '处方购药';
  document.getElementById('orderModal').classList.add('show');
}

// ====== 续方准备清单 ======
function switchUploadTab(btn, type) {
  document.querySelectorAll('.cl-upload-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('uploadManual').style.display = type === 'manual' ? 'block' : 'none';
  document.getElementById('uploadPhoto').style.display = type === 'photo' ? 'block' : 'none';
}

function submitBpRecord() {
  const sys = document.getElementById('bpSystolic').value.trim();
  const dia = document.getElementById('bpDiastolic').value.trim();
  const time = document.getElementById('bpTime').value;

  if (!sys || !dia) { showToast('请输入血压值'); return; }
  if (parseInt(sys) < 60 || parseInt(sys) > 250) { showToast('收缩压数值异常，请检查'); return; }
  if (parseInt(dia) < 30 || parseInt(dia) > 150) { showToast('舒张压数值异常，请检查'); return; }

  addBpRecord(sys + '/' + dia + ' mmHg', time);
  document.getElementById('bpSystolic').value = '';
  document.getElementById('bpDiastolic').value = '';
}

function simulatePhotoUpload() {
  showToast('正在识别血压计读数...');
  setTimeout(() => {
    addBpRecord('132/84 mmHg', '今天早上');
    showToast('识别成功，已自动填入读数');
  }, 1200);
}

function addBpRecord(value, time) {
  bpRecordCount++;
  const list = document.getElementById('uploadedRecords');
  const item = document.createElement('div');
  item.className = 'cl-uploaded-item';
  item.innerHTML =
    '<span class="cl-uploaded-icon">&#10003;</span>' +
    '<div class="cl-uploaded-info">' +
      '<div class="cl-uploaded-value">' + escapeHtml(value) + '</div>' +
      '<div class="cl-uploaded-time">' + escapeHtml(time) + '</div>' +
    '</div>' +
    '<button class="cl-uploaded-del" onclick="removeBpRecord(this)">&times;</button>';
  list.appendChild(item);
  checkBpComplete();
}

function removeBpRecord(btn) {
  bpRecordCount--;
  btn.closest('.cl-uploaded-item').remove();
  checkBpComplete();
  showToast('已删除该条记录');
}

function checkBpComplete() {
  const clItem = document.getElementById('clBloodPressure');
  const icon = document.getElementById('clBpIcon');
  const verdict = document.getElementById('clVerdict');
  const tag = document.getElementById('clProgressTag');
  const uploadArea = document.getElementById('bpUploadArea');
  const requireHint = clItem.querySelector('.cl-require');

  if (bpRecordCount >= 1) {
    // 有记录 → 该项完成，整体 4/4
    clItem.classList.remove('unchecked');
    clItem.classList.add('checked');
    icon.innerHTML = '&#10003;';
    icon.className = 'cl-check';
    var reqTag = clItem.querySelector('.cl-required');
    if (reqTag) reqTag.remove();
    if (requireHint) requireHint.style.display = 'none';
    uploadArea.style.display = 'none';
    clItem.querySelector('.cl-title').textContent = '近期血压/血糖记录';
    clItem.querySelector('.cl-desc').textContent = '已上传 ' + bpRecordCount + ' 条血压记录';
    verdict.className = 'renew-verdict verdict-ok';
    verdict.innerHTML =
      '<div class="verdict-icon">&#10003;</div>' +
      '<div class="verdict-text">' +
        '<div class="verdict-title">所有资料已就绪，可以续方</div>' +
        '<div class="verdict-desc">4/4 项已满足，点击「一键续方」即可提交</div>' +
      '</div>';
    tag.textContent = '4/4 项已就绪';
    tag.classList.add('all-done');
    showToast('血压记录已提交，资料已就绪');
  } else {
    // 删光了 → 恢复未完成
    clItem.classList.remove('checked');
    clItem.classList.add('unchecked');
    icon.innerHTML = '&#9675;';
    icon.className = 'cl-uncheck';
    if (requireHint) requireHint.style.display = '';
    uploadArea.style.display = '';
    var title = clItem.querySelector('.cl-title');
    if (!title.querySelector('.cl-required')) {
      title.innerHTML = '近期血压/血糖记录 <span class="cl-required">需补充</span>';
    }
    clItem.querySelector('.cl-desc').textContent = '需要最近 3 天内的测量数据，医生审核处方时需参考';
    verdict.className = 'renew-verdict verdict-warn';
    verdict.innerHTML =
      '<div class="verdict-icon">&#9888;</div>' +
      '<div class="verdict-text">' +
        '<div class="verdict-title">还需补充 1 项资料才能续方</div>' +
        '<div class="verdict-desc">缺少近期血压记录，上传后即可一键续方</div>' +
      '</div>';
    tag.textContent = '3/4 项已就绪';
    tag.classList.remove('all-done');
  }
}

// ====== 用药数据 ======
function openMedData() {
  document.getElementById('medDataModal').classList.add('show');
}

function pickRange(btn) {
  document.querySelectorAll('.range-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  showToast('已切换到' + btn.textContent + '数据');
}

function exportData(type) {
  const labels = { pdf: 'PDF 报告', excel: 'Excel 表格', share: '分享链接' };
  showToast(labels[type] + ' 正在生成，请稍候...');
  setTimeout(() => {
    showToast(labels[type] + ' 已生成');
  }, 1500);
}

// ====== 预约问诊 ======
function openBooking(type) {
  // 重置选择状态
  document.querySelectorAll('.bt-opt').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('bt-' + type);
  if (btn) btn.classList.add('selected');
  document.getElementById('bookingModal').classList.add('show');
}

function pickBookingType(btn) {
  document.querySelectorAll('.bt-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function pickDoctor(card) {
  document.querySelectorAll('.bd-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
}

function pickBDate(btn) {
  document.querySelectorAll('.bdate-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function pickBTime(btn) {
  if (btn.classList.contains('disabled')) return;
  document.querySelectorAll('.btime-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function confirmBooking() {
  const type = document.querySelector('.bt-opt.selected');
  const doctor = document.querySelector('.bd-card.selected .bd-name');
  const date = document.querySelector('.bdate-opt.selected .bdate-num');
  const time = document.querySelector('.btime-opt.selected');

  if (!type) { showToast('请选择问诊方式'); return; }
  if (!doctor) { showToast('请选择医生'); return; }
  if (!time) { showToast('请选择时段'); return; }

  // 记录预约信息
  const typeText = type.textContent.trim();
  const doctorName = doctor.textContent;
  const dateText = date.textContent;
  const timeText = time.textContent;

  document.getElementById('bookingModal').classList.remove('show');

  // 显示待问诊卡片（患者版）
  var pv = document.getElementById('pendingVisit');
  if (pv) {
    document.getElementById('pvDoctorName').textContent = doctorName + ' · 心内科';
    document.getElementById('pvTime').textContent = typeText + ' · ' + dateText + ' ' + timeText;
    document.getElementById('pvAvatar').textContent = doctorName.charAt(0);
    pv.style.display = 'block';
    pv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // 显示待问诊卡片（家属版）
  var fmPv = document.getElementById('fmPendingVisit');
  if (fmPv) {
    var fmDocName = document.getElementById('fmPvDoctorName');
    var fmTime = document.getElementById('fmPvTime');
    var fmAvatar = document.getElementById('fmPvAvatar');
    if (fmDocName) fmDocName.textContent = doctorName + ' · 心内科';
    if (fmTime) fmTime.textContent = typeText + ' · ' + dateText + ' ' + timeText;
    if (fmAvatar) fmAvatar.textContent = doctorName.charAt(0);
    fmPv.style.display = 'block';
    fmPv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // 保存到问诊界面
  var consultDoc = document.getElementById('consultDoctorName');
  var consultType = document.getElementById('consultType');
  if (consultDoc) consultDoc.textContent = doctorName + ' · 心内科';
  if (consultType) consultType.textContent = typeText;

  showToast('预约成功，可点击「进入问诊」开始');

  // 如果在家属模式下，自动跳到问诊页
  if (document.getElementById('familyTabBar').style.display !== 'none') {
    switchFamilyTab('fm-tab-visit');
  }
}

// ====== 患者问诊界面 ======
function enterConsultation() {
  document.getElementById('consultOverlay').classList.add('show');
}
function exitConsultation() {
  document.getElementById('consultOverlay').classList.remove('show');
}
function endConsultation() {
  document.getElementById('consultOverlay').classList.remove('show');
  document.getElementById('consultSummaryModal').classList.add('show');
}

const consultDoctorReplies = {
  '最近血压基本在 135/85 左右': '135/85 稍微偏高一点，但还在可接受范围内。目前氨氯地平 5mg 的剂量先维持不变。\n\n建议您每天早上起床后、晚上睡前各测一次血压，连续记录一周，下次复诊时带过来，我好判断是否需要调整剂量。\n\n这次我给您继续开氨氯地平和阿司匹林的处方，各 30 天的量。',
  '偶尔头晕，不确定是不是血压高': '头晕要关注一下。可能跟血压波动有关，也可能是其他原因。\n\n建议近几天密切监测血压，特别是头晕发作时。如果收缩压经常超过 140，可能需要调整用药。\n\n这次先继续当前方案，如果头晕加重或频繁发作，随时联系我。处方我先开 30 天的量。',
  '没什么不舒服，想继续开药': '那挺好的，说明目前方案控制得不错。\n\n我给您续开氨氯地平 5mg 和阿司匹林 100mg，各 30 天的量。继续保持低盐饮食和适量运动。\n\n下次复诊大概 4 周后，届时带一下近期的血压记录。'
};

function consultQuickReply(btn) {
  var text = btn.textContent;
  addConsultMsg(text, 'patient', 'consultChatArea', 'consultChatScroll', '张');
  document.getElementById('consultQuickReplies').style.display = 'none';
  setTimeout(function() {
    var reply = consultDoctorReplies[text] || '好的，我了解了。我给您继续开处方，请注意按时服药。';
    addConsultMsg(reply, 'doctor', 'consultChatArea', 'consultChatScroll', '张');
  }, 1200);
}

function sendConsultMsg() {
  var input = document.getElementById('consultInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  addConsultMsg(text, 'patient', 'consultChatArea', 'consultChatScroll', '张');
  document.getElementById('consultQuickReplies').style.display = 'none';
  setTimeout(function() {
    addConsultMsg('好的，我了解了。根据您的情况，我建议继续当前用药方案。处方我这边开好，您确认后就可以购药了。', 'doctor', 'consultChatArea', 'consultChatScroll', '张');
  }, 1200);
}

// ====== 家属代问诊界面 ======
function enterFmConsultation() {
  document.getElementById('fmConsultOverlay').classList.add('show');
}
function exitFmConsultation() {
  document.getElementById('fmConsultOverlay').classList.remove('show');
}
function endFmConsultation() {
  document.getElementById('fmConsultOverlay').classList.remove('show');
  document.getElementById('consultSummaryModal').classList.add('show');
}

const fmDoctorReplies = {
  '我是他儿子，他说最近血压还行，大概 135/85': '好的，谢谢您。135/85 稍微偏高一点点，但还在可控范围。\n\n麻烦您回去帮张叔叔量几天血压，早晚各一次，记录下来。如果收缩压经常超过 140 就需要调药了。\n\n这次我先给他续开氨氯地平和阿司匹林，各 30 天的量。药到了提醒他按时吃。',
  '我是他儿子，他最近老说头晕，我有点担心': '头晕的话需要关注。可能跟血压波动有关，也可能是低血糖或者颈椎的问题。\n\n建议这样：头晕的时候帮他量一下血压，记录当时的数值。如果收缩压超过 150 或者低于 100，要及时来复诊。\n\n这次处方我先开 30 天的量，如果头晕频繁或加重，带他来面诊一次比较放心。',
  '我是他儿子，他没什么不舒服，帮他续个药': '那就好，说明目前方案效果不错。\n\n我给张叔叔续开氨氯地平 5mg 和阿司匹林 100mg，各 30 天。提醒他继续保持低盐饮食，适量活动。\n\n另外麻烦您帮他记录一下每天的血压，下次复诊带过来，大概 4 周后。'
};

function fmConsultQuickReply(btn) {
  var text = btn.textContent;
  addConsultMsg(text, 'patient', 'fmConsultChatArea', 'fmConsultChatScroll', '小');
  document.getElementById('fmConsultQuickReplies').style.display = 'none';
  setTimeout(function() {
    var reply = fmDoctorReplies[text] || '好的，我了解了。我给张叔叔继续开处方，药到了麻烦您提醒他按时吃。';
    addConsultMsg(reply, 'doctor', 'fmConsultChatArea', 'fmConsultChatScroll', '小');
  }, 1200);
}

function fmSendConsultMsg() {
  var input = document.getElementById('fmConsultInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  addConsultMsg(text, 'patient', 'fmConsultChatArea', 'fmConsultChatScroll', '小');
  document.getElementById('fmConsultQuickReplies').style.display = 'none';
  setTimeout(function() {
    addConsultMsg('好的，我了解了。我给张叔叔继续当前方案，处方开好后您确认就可以购药了。药到了提醒他按时吃。', 'doctor', 'fmConsultChatArea', 'fmConsultChatScroll', '小');
  }, 1200);
}

// ====== 通用聊天消息 ======
function addConsultMsg(text, role, areaId, scrollId, userAvatar) {
  var area = document.getElementById(areaId);
  var div = document.createElement('div');
  div.className = 'consult-msg ' + role;
  var avatar = role === 'doctor' ? '李' : userAvatar;
  div.innerHTML =
    '<div class="consult-msg-avatar">' + avatar + '</div>' +
    '<div class="consult-msg-bubble">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
  area.appendChild(div);
  var scroll = document.getElementById(scrollId);
  setTimeout(function() { scroll.scrollTop = scroll.scrollHeight; }, 50);
}

// 问诊小结 → 同步并购药
function syncAndOrder() {
  document.getElementById('consultSummaryModal').classList.remove('show');
  document.getElementById('pendingVisit').style.display = 'none';
  showToast('医嘱已同步到用药计划');
  // 打开购药下单弹窗
  setTimeout(() => {
    document.getElementById('orderSource').style.display = 'block';
    document.getElementById('orderSource').innerHTML =
      '<span class="order-source-icon">&#128203;</span>' +
      '<span>来源：李建华医生 · 图文问诊处方</span>';
    document.getElementById('orderModalTitle').textContent = '处方购药';
    document.getElementById('orderModal').classList.add('show');
  }, 500);
}

function syncConsultDataOnly() {
  document.getElementById('consultSummaryModal').classList.remove('show');
  document.getElementById('pendingVisit').style.display = 'none';
  showToast('医嘱和处方已同步到用药计划');
}

// 购药下单
var orderDrugPrices = { orderDrug1: 28.00 };
var orderDrugQtys = { orderDrug1: 1 };
var orderDrugCount = 1;
var currentDelivery = 'express';

function openOrderModal() {
  // 重置为库存页购药模式
  document.getElementById('orderSource').style.display = 'none';
  document.getElementById('orderModalTitle').textContent = '购药下单';
  // 重置数量
  orderDrugQtys = { orderDrug1: 1 };
  orderDrugPrices = { orderDrug1: 28.00 };
  var qtyEl = document.getElementById('orderDrug1Qty');
  if (qtyEl) qtyEl.textContent = '1';
  var priceEl = document.getElementById('orderDrug1Price');
  if (priceEl) priceEl.innerHTML = '&yen;28.00';
  updateOrderTotal();
  document.getElementById('orderModal').classList.add('show');
}

function changeOrderQty(drugId, delta) {
  var qty = (orderDrugQtys[drugId] || 1) + delta;
  if (qty < 1) qty = 1;
  if (qty > 10) qty = 10;
  orderDrugQtys[drugId] = qty;
  document.getElementById(drugId + 'Qty').textContent = qty;
  var unitPrice = orderDrugPrices[drugId] || 28.00;
  document.getElementById(drugId + 'Price').innerHTML = '&yen;' + (unitPrice * qty).toFixed(2);
  updateOrderTotal();
}

function updateOrderTotal() {
  var total = 0;
  for (var key in orderDrugQtys) {
    total += (orderDrugPrices[key] || 0) * (orderDrugQtys[key] || 1);
  }
  document.getElementById('orderDrugTotal').innerHTML = '&yen;' + total.toFixed(2);
  document.getElementById('orderPayTotal').innerHTML = '&yen;' + total.toFixed(2);
  document.getElementById('orderSubmitBtn').innerHTML = '确认下单 &yen;' + total.toFixed(2);
}

function addOrderDrug() {
  orderDrugCount++;
  var drugId = 'orderDrugExtra' + orderDrugCount;
  var extraDrugs = [
    { name: '阿司匹林肠溶片 100mg × 30片（1盒）', spec: '拜阿司匹灵', price: 18.90 },
    { name: '盐酸二甲双胍片 0.5g × 60片（1盒）', spec: '格华止', price: 35.00 },
    { name: '阿托伐他汀钙片 20mg × 28片（1盒）', spec: '立普妥', price: 68.00 }
  ];
  var drug = extraDrugs[(orderDrugCount - 2) % extraDrugs.length];
  orderDrugPrices[drugId] = drug.price;
  orderDrugQtys[drugId] = 1;

  var item = document.createElement('div');
  item.className = 'order-drug-item';
  item.id = drugId;
  item.innerHTML =
    '<div class="order-drug-info">' +
      '<div class="order-drug-name">' + drug.name + '</div>' +
      '<div class="order-drug-spec">' + drug.spec + '</div>' +
    '</div>' +
    '<div class="order-drug-qty">' +
      '<div class="order-stepper">' +
        '<button class="stepper-btn" onclick="changeOrderQty(\'' + drugId + '\', -1)">−</button>' +
        '<span class="stepper-val" id="' + drugId + 'Qty">1</span>' +
        '<button class="stepper-btn" onclick="changeOrderQty(\'' + drugId + '\', 1)">+</button>' +
      '</div>' +
      '<div class="order-drug-price" id="' + drugId + 'Price">&yen;' + drug.price.toFixed(2) + '</div>' +
    '</div>';
  document.getElementById('orderDrugList').appendChild(item);
  updateOrderTotal();
}

function pickDelivery(el, type) {
  document.querySelectorAll('.order-delivery-opt').forEach(function(o) {
    o.classList.remove('selected');
    o.querySelector('.od-radio').innerHTML = '&#9675;';
  });
  el.classList.add('selected');
  el.querySelector('.od-radio').innerHTML = '&#9679;';
  currentDelivery = type || 'express';
}

function submitOrder() {
  document.getElementById('orderModal').classList.remove('show');
  var msg = currentDelivery === 'express' ? '订单已提交，预计30分钟送达' : '订单已提交，预计明日送达';
  showToast(msg);

  // 模拟药品到货后更新库存（两个页面都更新）
  setTimeout(function() {
    updateStockAfterOrder();
    showToast('药品已到货，药量已自动更新');
  }, 2000);
}

function updateStockAfterOrder() {
  // 更新所有页面中氨氯地平的库存：12+30=42片
  var allBoxCards = document.querySelectorAll('.box-card');
  allBoxCards.forEach(function(card) {
    var name = card.querySelector('.box-drug-name');
    if (name && name.textContent === '氨氯地平片') {
      card.classList.remove('urgent');
      card.classList.add('normal');
      var tag = card.querySelector('.box-tag');
      if (tag) { tag.className = 'box-tag tag-ok'; tag.textContent = '药量充足'; }
      var fill = card.querySelector('.meter-fill');
      if (fill) { fill.className = 'meter-fill ok-fill'; fill.style.width = '70%'; }
      var mt = card.querySelector('.meter-text');
      if (mt) mt.textContent = '剩余 42 片';
      var infos = card.querySelectorAll('.box-info');
      if (infos[1]) infos[1].innerHTML = '<span class="box-info-label">可服天数</span><span>42天</span>';
      if (infos[2]) infos[2].innerHTML = '<span class="box-info-label">预计用完</span><span>6月6日</span>';
      // 隐藏续方按钮
      var btnRow = card.querySelector('.box-btn-row');
      if (btnRow) btnRow.style.display = 'none';
    }
    // 阿司匹林：45+30=75片
    if (name && name.textContent === '阿司匹林肠溶片') {
      var fill = card.querySelector('.meter-fill');
      if (fill) fill.style.width = '100%';
      var mt = card.querySelector('.meter-text');
      if (mt) mt.textContent = '剩余 75 片';
      var infos = card.querySelectorAll('.box-info');
      if (infos[1]) infos[1].innerHTML = '<span class="box-info-label">可服天数</span><span>75天</span>';
      if (infos[2]) infos[2].innerHTML = '<span class="box-info-label">预计用完</span><span>7月9日</span>';
    }
  });

  // 更新库存总览：紧张数归0
  document.querySelectorAll('.bo-item').forEach(function(item) {
    var label = item.querySelector('.bo-label');
    var num = item.querySelector('.bo-num');
    if (label && (label.textContent === '库存紧张' || label.textContent === '快吃完了') && num) {
      num.textContent = '0';
      num.classList.remove('warn-text');
    }
  });

  // 更新首页风险卡片
  var alerts = document.querySelectorAll('.alert-card.risk-orange');
  alerts.forEach(function(a) {
    var title = a.querySelector('.alert-title');
    if (title && title.textContent.includes('氨氯地平')) {
      a.style.display = 'none';
    }
  });
}

// ====== 提前提醒时间选择 ======
function pickTime(btn) {
  document.querySelectorAll('.time-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  showToast('已设置为服药前 ' + btn.textContent + ' 提醒');
}

// ====== 添加家属 ======
let selectedRelation = '';

function openAddFamily() {
  selectedRelation = '';
  document.getElementById('familyName').value = '';
  document.getElementById('familyPhone').value = '';
  document.querySelectorAll('.relation-opt').forEach(b => b.classList.remove('selected'));
  document.getElementById('addFamilyModal').classList.add('show');
}

function pickRelation(btn) {
  document.querySelectorAll('.relation-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedRelation = btn.textContent;
}

function confirmAddFamily() {
  const name = document.getElementById('familyName').value.trim();
  const phone = document.getElementById('familyPhone').value.trim();

  if (!name) { showToast('请输入家属姓名'); return; }
  if (!selectedRelation) { showToast('请选择与您的关系'); return; }
  if (!phone || phone.length < 11) { showToast('请输入正确的手机号'); return; }

  // 在家属列表中插入新卡片（插到"添加家属"按钮前面）
  const familyList = document.querySelector('.family-list');
  const addBtn = familyList.lastElementChild;

  const card = document.createElement('div');
  card.className = 'family-card';
  card.innerHTML =
    '<div class="family-avatar">' + name.charAt(0) + '</div>' +
    '<div class="family-info">' +
      '<div class="family-name">' + escapeHtml(name) +
        ' <span class="family-role">' + escapeHtml(selectedRelation) + '</span></div>' +
      '<div class="family-phone">' + phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') + '</div>' +
    '</div>' +
    '<div class="family-status bound">邀请中</div>';

  familyList.insertBefore(card, addBtn);

  // 保存家属
  familyData.push({ name: name, relation: selectedRelation, phone: phone });
  saveData('family', familyData);

  document.getElementById('addFamilyModal').classList.remove('show');
  showToast('已向 ' + name + ' 发送绑定邀请');
}

// ====== 页面加载时恢复保存的数据 ======
window.addEventListener('DOMContentLoaded', function() {
  // 恢复今日打卡记录
  var cards = document.querySelectorAll('#page-home .med-card');
  cards.forEach(function(card) {
    var key = getMedKey(card);
    var record = medRecords[key];
    if (!record) return;

    if (record.startsWith('done_')) {
      var time = record.replace('done_', '');
      card.classList.remove('active-card', 'upcoming-card', 'past-card');
      card.classList.add('done');
      var actions = card.querySelector('.mc-actions');
      if (actions) {
        actions.outerHTML =
          '<div class="mc-right">' +
            '<span class="mc-status-done">&#10003; ' + time + '</span>' +
            '<button class="btn-undo" onclick="undoMed(this)">撤回</button>' +
          '</div>';
      }
      card.style.flexDirection = 'row';
    } else if (record.startsWith('skip_')) {
      var reason = record.replace('skip_', '');
      card.classList.remove('active-card');
      card.classList.add('done');
      var actions = card.querySelector('.mc-actions');
      if (actions) {
        actions.outerHTML =
          '<div class="mc-right"><span class="mc-status-done" style="color:var(--text-third)">已跳过 · ' + reason + '</span></div>';
      }
      card.style.flexDirection = 'row';
      card.style.opacity = '0.5';
    }
  });
  updateAllProgress();

  // 恢复库存修正
  var boxCards = document.querySelectorAll('.box-card');
  boxCards.forEach(function(bc) {
    var drugName = bc.querySelector('.box-drug-name').textContent;
    if (stockData[drugName] !== undefined) {
      var mt = bc.querySelector('.meter-text');
      if (mt) mt.textContent = '剩余 ' + stockData[drugName] + ' 片';
    }
  });

  // 恢复新增家属
  if (familyData.length > 0) {
    var familyList = document.querySelector('.family-list');
    var addBtn = familyList.lastElementChild;
    familyData.forEach(function(f) {
      var card = document.createElement('div');
      card.className = 'family-card';
      card.innerHTML =
        '<div class="family-avatar">' + f.name.charAt(0) + '</div>' +
        '<div class="family-info">' +
          '<div class="family-name">' + f.name +
            ' <span class="family-role">' + f.relation + '</span></div>' +
          '<div class="family-phone">' + f.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') + '</div>' +
        '</div>' +
        '<div class="family-status bound">邀请中</div>';
      familyList.insertBefore(card, addBtn);
    });
  }
});

// ====== 适老化新增功能 ======

// 服药成功大对勾动画
function showDoneCheck() {
  var overlay = document.createElement('div');
  overlay.className = 'done-check-overlay';
  overlay.innerHTML = '<div class="done-check-circle"><span>&#10003;</span></div>';
  document.body.appendChild(overlay);
  setTimeout(function() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .3s';
    setTimeout(function() { overlay.remove(); }, 300);
  }, 600);
}

// 紧急求助
function emergencyCall() {
  var msg = '即将拨打紧急电话：\n\n1. 拨打家属（张小明）：138****6789\n2. 拨打急救电话：120\n\n请选择';
  if (confirm(msg)) {
    showToast('正在拨打家属电话...');
    // 在真实环境中: window.location.href = 'tel:13800006789';
  } else {
    showToast('已取消');
  }
}

// 语音输入（模拟）
var isRecording = false;
function toggleVoice() {
  var btn = document.getElementById('voiceBtn');
  if (!btn) return;
  if (isRecording) {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '\uD83C\uDF99';
    // 模拟语音识别结果
    var input = document.getElementById('chatInput');
    if (input) input.value = '昨晚忘吃药了怎么办';
    showToast('语音识别完成');
  } else {
    isRecording = true;
    btn.classList.add('recording');
    btn.textContent = '\u23F9';
    showToast('正在录音，再次点击停止...');
    // 3秒后自动停止
    setTimeout(function() {
      if (isRecording) toggleVoice();
    }, 3000);
  }
}

// 大字模式切换
function setFontSize(btn, className) {
  document.querySelectorAll('.font-size-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  document.body.classList.remove('font-large', 'font-xl');
  if (className) document.body.classList.add(className);
  // 保存偏好
  saveData('fontSize', className);
  showToast(className === 'font-xl' ? '已切换为超大字体' : className === 'font-large' ? '已切换为大字体' : '已恢复标准字体');
}

// 页面加载时恢复字体大小
(function() {
  var savedSize = loadData('fontSize', '');
  if (savedSize) {
    document.body.classList.add(savedSize);
    // 更新按钮状态
    setTimeout(function() {
      var opts = document.querySelectorAll('.font-size-opt');
      opts.forEach(function(opt) {
        opt.classList.remove('selected');
        if (savedSize === 'font-large' && opt.textContent === '大字') opt.classList.add('selected');
        else if (savedSize === 'font-xl' && opt.textContent === '超大字') opt.classList.add('selected');
        else if (!savedSize && opt.textContent === '标准') opt.classList.add('selected');
      });
    }, 100);
  }
})();

// ====== 启动页角色选择 ======

function selectRole(role) {
  // 隐藏启动页
  document.getElementById('page-launch').classList.remove('active');

  if (role === 'patient') {
    // 显示患者导航和首页
    inFamilyMode = false;
    document.getElementById('tab-bar-main').style.display = '';
    document.getElementById('familyTabBar').style.display = 'none';
    switchTab('tab-home');
  } else {
    // 显示家属导航和监护首页
    inFamilyMode = true;
    document.getElementById('tab-bar-main').style.display = 'none';
    document.getElementById('familyTabBar').style.display = '';
    // 重置家属tab
    document.querySelectorAll('#familyTabBar .tab').forEach(t => t.classList.remove('active'));
    document.getElementById('fm-tab-home').classList.add('active');
    document.getElementById('page-fm-home').classList.add('active');
    if (typeof buildFamilyDatePicker === 'function') buildFamilyDatePicker();
  }
}

function backToRoleSelect() {
  inFamilyMode = false;
  // 隐藏所有页面和导航
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-bar-main').style.display = 'none';
  document.getElementById('familyTabBar').style.display = 'none';
  // 显示启动页
  document.getElementById('page-launch').classList.add('active');
}

// ====== 家属协同管理模式 ======

// 家属模式页面映射
var familyTabMap = {
  'fm-tab-home': 'page-fm-home',
  'fm-tab-stock': 'page-fm-stock',
  'fm-tab-visit': 'page-fm-visit',
  'fm-tab-ai': 'page-fm-ai',
  'fm-tab-settings': 'page-fm-settings'
};

var inFamilyMode = false;

function enterFamilyMode() {
  inFamilyMode = true;
  // 隐藏所有患者页面和导航
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('#tab-bar-main .tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-bar-main').style.display = 'none';
  document.getElementById('familyTabBar').style.display = '';
  // 重置家属tab状态
  document.querySelectorAll('#familyTabBar .tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('fm-tab-home').classList.add('active');
  // 显示家属首页
  document.getElementById('page-fm-home').classList.add('active');
  // 构建家属日期选择器
  buildFamilyDatePicker();
}

function exitFamilyMode() {
  inFamilyMode = false;
  // 隐藏家属页面和导航
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('#familyTabBar .tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('familyTabBar').style.display = 'none';
  document.getElementById('tab-bar-main').style.display = '';
  // 回到个人中心
  switchTab('tab-profile');
}

function switchFamilyTab(tabId) {
  // 切换家属模式的tab
  document.querySelectorAll('#familyTabBar .tab').forEach(function(t) { t.classList.remove('active'); });
  Object.values(familyTabMap).forEach(function(id) { document.getElementById(id).classList.remove('active'); });
  document.getElementById(tabId).classList.add('active');
  document.getElementById(familyTabMap[tabId]).classList.add('active');
  document.getElementById(familyTabMap[tabId]).scrollTop = 0;
}

// 家属模式日期选择器
function buildFamilyDatePicker() {
  var picker = document.getElementById('fmDatePicker');
  if (!picker) return;
  var today = new Date();
  var weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  var html = '';
  for (var i = -7; i <= 7; i++) {
    var d = new Date(today);
    d.setDate(today.getDate() + i);
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var label = '';
    if (i === -1) label = '昨天';
    else if (i === 0) label = '今天';
    else if (i === 1) label = '明天';
    else label = weekNames[d.getDay()];
    var activeClass = (i === 0) ? ' active' : '';
    html += '<div class="date-item' + activeClass + '" data-offset="' + i + '" data-month="' + month + '">' +
      '<div class="d-week">' + label + '</div>' +
      '<div class="d-day">' + day + '</div>' +
    '</div>';
  }
  picker.innerHTML = html;
  setTimeout(function() {
    var active = picker.querySelector('.date-item.active');
    if (active) {
      picker.scrollLeft = active.offsetLeft - picker.offsetWidth / 2 + active.offsetWidth / 2;
    }
  }, 50);
}

// ====== 家属版 AI 智能体 ======

// 家属版能力分组快捷问题
var fmSkillQuestions = {
  fmStatus: ['爸爸今天药都吃了吗？', '爸爸昨天有没有漏服？', '提醒爸爸吃药'],
  fmStock: ['爸爸哪些药快吃完了？', '药还够吃几天？'],
  fmRenew: ['帮爸爸续方', '帮爸爸买药'],
  fmBooking: ['帮爸爸约李医生', '上次医生说了什么？'],
  fmReport: ['爸爸这周服药情况', '查看服药报告']
};

function switchFmSkill(btn) {
  document.querySelectorAll('#page-fm-ai .skill-tag').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  var skill = btn.getAttribute('data-skill');
  renderFmQuickQ(skill);
}

function renderFmQuickQ(skill) {
  var container = document.getElementById('fmQuickQ');
  var qs = fmSkillQuestions[skill] || [];
  var html = '';
  qs.forEach(function(q) {
    html += '<button class="qq-btn" onclick="fmAskQuick(this)">' + q + '</button>';
  });
  container.innerHTML = html;
  container.style.display = '';
}

// 初始化显示第一组
setTimeout(function() { renderFmQuickQ('fmStatus'); }, 100);

// +菜单
function toggleFmPlusMenu() {
  document.getElementById('fmPlusMenuOverlay').classList.toggle('show');
}
function closeFmPlusMenu() {
  document.getElementById('fmPlusMenuOverlay').classList.remove('show');
}
function fmPlusAction(skill) {
  closeFmPlusMenu();
  var firstQ = fmSkillQuestions[skill] ? fmSkillQuestions[skill][0] : '';
  if (firstQ) { fmAddUserMsg(firstQ); fmAgentReply(firstQ); }
}

// 意图识别
function fmDetectIntent(input) {
  if (/今天.*吃|吃了吗|服药.*情况/.test(input)) return 'todayStatus';
  if (/漏服|没吃|忘/.test(input)) return 'missed';
  if (/提醒.*吃药/.test(input)) return 'remind';
  if (/快吃完|库存|还剩|够吃|药量/.test(input)) return 'stock';
  if (/续方|续/.test(input)) return 'renew';
  if (/买药|购药/.test(input)) return 'buy';
  if (/约.*医生|预约|挂号/.test(input)) return 'booking';
  if (/上次.*医生|医嘱|问诊记录/.test(input)) return 'doctorNotes';
  if (/这周|服药率|报告|数据/.test(input)) return 'report';
  return 'unknown';
}

// Agent 回复数据
var fmAgentReplies = {
  todayStatus: {
    thinking: ['查询爸爸今日打卡记录...', '统计服药进度...', '完成'],
    text: '爸爸今天的服药情况：已完成 <strong>3/5</strong> 次。',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row"><span>&#10003; 07:12</span><span>氨氯地平 + 阿司匹林</span></div>' +
      '<div class="ac-row"><span>&#10003; 08:23</span><span>二甲双胍</span></div>' +
      '<div class="ac-row"><span>&#10003; 14:35</span><span>二甲双胍</span></div>' +
      '<div class="ac-row" style="color:var(--text-third)"><span>&#9675; 21:00</span><span>二甲双胍 + 阿托伐他汀</span></div>' +
      '<button class="ac-btn" onclick="showToast(\'已提醒爸爸吃晚上的药\')">提醒爸爸吃药</button></div>'
  },
  missed: {
    thinking: ['查询漏服记录...', '完成'],
    text: '爸爸昨日有 <strong>1 次</strong>漏服：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row" style="color:var(--danger)"><span>&#9888; 4/24 21:00</span><span>二甲双胍 0.5g</span></div>' +
      '<button class="ac-btn" onclick="showToast(\'已提醒爸爸注意按时吃药\')">提醒爸爸注意</button></div>'
  },
  remind: {
    thinking: ['发送提醒...', '完成'],
    text: '已向爸爸发送服药提醒！',
    actionCard: '<div class="ai-action-card"><div class="ac-row"><span>&#128276;</span><span>提醒已发送到爸爸的手机</span></div></div>'
  },
  stock: {
    thinking: ['查询爸爸的药品库存...', '计算剩余天数...', '完成'],
    text: '爸爸目前的药量情况：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row" style="color:var(--danger)"><span>&#9888; 氨氯地平</span><span>12片 · <strong>6天</strong></span></div>' +
      '<div class="ac-row"><span>&#10003; 二甲双胍</span><span>58片 · 19天</span></div>' +
      '<div class="ac-row"><span>&#10003; 阿司匹林</span><span>45片 · 45天</span></div>' +
      '<div class="ac-row"><span>&#10003; 阿托伐他汀</span><span>22片 · 22天</span></div>' +
      '<button class="ac-btn" onclick="switchFamilyTab(\'fm-tab-stock\')">帮爸爸续方</button></div>',
    warn: '氨氯地平库存紧张，建议本周帮爸爸续方。'
  },
  renew: {
    thinking: ['查询库存...', '检查续方条件...', '检查服药记录...', '分析完成'],
    text: '帮您检查了爸爸的续方条件：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row"><span class="ac-status-ok">&#10003;</span><span>近7日服药记录完整</span></div>' +
      '<div class="ac-row"><span class="ac-status-ok">&#10003;</span><span>历史处方可复用</span></div>' +
      '<div class="ac-row"><span class="ac-status-warn">&#9888;</span><span>缺少近期血压记录</span></div>' +
      '<div class="ac-row"><span class="ac-status-ok">&#10003;</span><span>无连续漏服</span></div>' +
      '<button class="ac-btn" onclick="switchFamilyTab(\'fm-tab-visit\')">帮爸爸问诊续方</button></div>'
  },
  buy: {
    thinking: ['查询需补货药品...', '完成'],
    text: '爸爸需要补货的药品：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row" style="color:var(--danger)"><span>氨氯地平 5mg</span><span>仅剩6天</span></div>' +
      '<button class="ac-btn" onclick="switchFamilyTab(\'fm-tab-stock\')">帮爸爸购药</button></div>'
  },
  booking: {
    thinking: ['查询医生排班...', '完成'],
    text: '李建华医生（心内科·主任医师）明天可约时段：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row"><button class="ac-btn-sm" onclick="openBooking(\'video\')">09:00</button> <button class="ac-btn-sm" onclick="openBooking(\'video\')">10:00</button> <button class="ac-btn-sm" onclick="openBooking(\'video\')">14:00</button> <button class="ac-btn-sm" onclick="openBooking(\'video\')">15:00</button></div>' +
      '<div style="font-size:12px;color:var(--text-sec);margin-top:8px">点击时段帮爸爸预约</div></div>'
  },
  doctorNotes: {
    thinking: ['查询问诊记录...', '完成'],
    text: '爸爸最近一次问诊记录：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row"><span>日期</span><span>2026.03.28</span></div>' +
      '<div class="ac-row"><span>医生</span><span>李建华 · 心内科</span></div>' +
      '<div class="ac-row"><span>方式</span><span>视频问诊</span></div>' +
      '<div style="padding:8px 0;font-size:13px;color:var(--text);border-top:1px solid var(--border);margin-top:4px">医嘱：血压控制尚可，继续当前方案，注意低盐饮食</div>' +
      '<button class="ac-btn" onclick="switchFamilyTab(\'fm-tab-visit\')">查看完整记录</button></div>'
  },
  report: {
    thinking: ['统计服药数据...', '生成报告...', '完成'],
    text: '爸爸本周服药报告：',
    actionCard: '<div class="ai-action-card">' +
      '<div class="ac-row"><span>服药率</span><span style="color:var(--primary);font-weight:700">92%</span></div>' +
      '<div class="ac-row"><span>漏服</span><span style="color:var(--danger);font-weight:700">2次</span></div>' +
      '<div class="ac-row"><span>延迟</span><span style="color:var(--accent);font-weight:700">3次</span></div>' +
      '<div style="font-size:12px;color:var(--text-sec);padding-top:8px">比上周提升 3%，整体不错</div>' +
      '<button class="ac-btn" onclick="openMedData()">查看详细报告</button></div>'
  },
  unknown: {
    thinking: ['分析问题...'],
    text: '关于爸爸的用药，我可以帮您：',
    actionCard: '<div class="ai-action-card">' +
      '<button class="ac-btn" onclick="fmPlusAction(\'fmStatus\')" style="margin-bottom:6px">查看服药状态</button>' +
      '<button class="ac-btn" onclick="fmPlusAction(\'fmStock\')" style="margin-bottom:6px">查看药量</button>' +
      '<button class="ac-btn" onclick="fmPlusAction(\'fmRenew\')" style="margin-bottom:6px">帮爸爸续方</button>' +
      '<button class="ac-btn" onclick="fmPlusAction(\'fmBooking\')" style="margin-bottom:6px">帮爸爸约医生</button>' +
      '<button class="ac-btn" onclick="fmPlusAction(\'fmReport\')">查看数据报告</button></div>'
  }
};

// 家属版思考过程 + 回复
function fmAgentReply(input) {
  document.getElementById('fmQuickQ').style.display = 'none';
  var intent = fmDetectIntent(input);
  var data = fmAgentReplies[intent] || fmAgentReplies.unknown;
  fmShowThinking(data.thinking, function() {
    fmAddAgentMsg(data);
  });
}

function fmShowThinking(steps, callback) {
  var area = document.getElementById('fmChatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = '<div class="chat-msg-avatar">&#129432;</div><div class="ai-thinking" id="fmThinkBubble"></div>';
  area.appendChild(div);
  fmScrollBottom();
  var bubble = document.getElementById('fmThinkBubble');
  var i = 0;
  function next() {
    if (i < steps.length) {
      var step = document.createElement('div');
      step.className = 'think-step';
      step.innerHTML = '<span class="think-icon">&#9881;</span> ' + steps[i];
      bubble.appendChild(step);
      fmScrollBottom();
      i++;
      setTimeout(next, 500);
    } else {
      setTimeout(function() {
        div.remove();
        callback();
      }, 800);
    }
  }
  next();
}

function fmAddAgentMsg(data) {
  var area = document.getElementById('fmChatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg ai';
  var html = '<div class="chat-msg-avatar">&#129432;</div><div class="chat-msg-bubble">';
  html += data.text;
  if (data.actionCard) html += data.actionCard;
  if (data.warn) html += '<div class="ai-warn">' + data.warn + '</div>';
  html += '</div>';
  div.innerHTML = html;
  area.appendChild(div);
  fmScrollBottom();
}

function fmAskQuick(btn) {
  var q = btn.textContent;
  fmAddUserMsg(q);
  fmAgentReply(q);
}

function fmSendChat() {
  var input = document.getElementById('fmChatInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  fmAddUserMsg(text);
  fmAgentReply(text);
}

function fmAddUserMsg(text) {
  var area = document.getElementById('fmChatMessages');
  var div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = '<div class="chat-msg-avatar">小</div><div class="chat-msg-bubble">' + escapeHtml(text) + '</div>';
  area.appendChild(div);
  fmScrollBottom();
}

function fmScrollBottom() {
  var scroll = document.getElementById('fmChatScroll');
  setTimeout(function() { scroll.scrollTop = scroll.scrollHeight; }, 50);
}

