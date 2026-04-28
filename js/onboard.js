// ====== 新用户引导 ======

var obGender = 'male';

function pickObGender(btn, gender) {
  btn.parentElement.querySelectorAll('.relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  obGender = gender;
}

function pickObCond(btn) {
  document.querySelectorAll('#obCondPicker .relation-opt').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

// 切换步骤
function obNext(currentStep) {
  if (currentStep === 1) {
    var name = document.getElementById('obName').value.trim();
    if (!name) { showToast('请输入称呼'); return; }
  }

  if (currentStep === 2) {
    var selected = document.querySelectorAll('.ob-disease-btn.selected');
    if (selected.length === 0) { showToast('请至少选择一种'); return; }
  }

  // 隐藏当前步骤
  document.getElementById('obPanel' + currentStep).style.display = 'none';
  document.getElementById('obStep' + currentStep).classList.remove('active');
  document.getElementById('obStep' + currentStep).classList.add('done');

  // 显示下一步
  var next = currentStep + 1;
  document.getElementById('obPanel' + next).style.display = '';
  document.getElementById('obStep' + next).classList.add('active');

  // 第3步自动填入疾病
  if (next === 3) {
    var diseases = [];
    document.querySelectorAll('.ob-disease-btn.selected').forEach(function(b) {
      diseases.push(b.textContent);
    });
    var diseaseInput = document.getElementById('obMedDisease');
    if (diseaseInput && diseases.length > 0) {
      diseaseInput.value = diseases[0]; // 默认填第一个
    }
  }
}

function obBack(currentStep) {
  document.getElementById('obPanel' + currentStep).style.display = 'none';
  document.getElementById('obStep' + currentStep).classList.remove('active');

  var prev = currentStep - 1;
  document.getElementById('obPanel' + prev).style.display = '';
  document.getElementById('obStep' + prev).classList.remove('done');
  document.getElementById('obStep' + prev).classList.add('active');
}

// 完成引导：保存个人信息 + 添加药品
async function obFinish() {
  var name = document.getElementById('obName').value.trim();
  var age = document.getElementById('obAge').value.trim();
  var diseases = [];
  document.querySelectorAll('.ob-disease-btn.selected').forEach(function(b) {
    diseases.push(b.textContent);
  });

  // 保存个人信息到 Supabase
  var user = await getCurrentUser();
  if (user && sb) {
    await sb.from('profiles').upsert({
      id: user.id,
      display_name: name,
      email: user.email,
      role: 'patient'
    });

    // 更新 user_metadata
    await sb.auth.updateUser({
      data: { display_name: name, age: age, gender: obGender, diseases: diseases }
    });
  }

  // 添加药品
  var medName = document.getElementById('obMedName').value.trim();
  var medDosage = document.getElementById('obMedDosage').value.trim();
  var medDisease = document.getElementById('obMedDisease').value.trim();
  var medStock = parseInt(document.getElementById('obMedStock').value) || 30;

  if (medName && medDosage) {
    var times = [];
    document.querySelectorAll('#obTimePicker .relation-opt.selected').forEach(function(b) {
      times.push(b.textContent.trim());
    });

    var condBtn = document.querySelector('#obCondPicker .relation-opt.selected');
    var condition = condBtn ? condBtn.textContent.trim() : '';

    await addMedication({
      name: medName,
      dosage: medDosage,
      frequency: times.length || 1,
      times: times.length > 0 ? times : ['晨起 7:00'],
      condition: condition,
      disease: medDisease,
      stock_count: medStock,
      daily_usage: times.length || 1,
      note: ''
    });
  }

  // 标记引导完成
  localStorage.setItem('yygh_onboarded_' + (user ? user.id : 'local'), 'true');

  // 关闭引导弹窗
  document.getElementById('onboardModal').classList.remove('show');

  // 更新页面显示
  updateUserDisplay(user || { user_metadata: { display_name: name }, email: '' });
  if (typeof initMedData === 'function') await initMedData();

  showToast('设置完成！欢迎使用 PillPal');
}

// 跳过添加药品
async function obSkipMed() {
  var name = document.getElementById('obName').value.trim() || '用户';
  var age = document.getElementById('obAge').value.trim();
  var diseases = [];
  document.querySelectorAll('.ob-disease-btn.selected').forEach(function(b) {
    diseases.push(b.textContent);
  });

  var user = await getCurrentUser();
  if (user && sb) {
    await sb.from('profiles').upsert({
      id: user.id,
      display_name: name,
      email: user.email,
      role: 'patient'
    });
    await sb.auth.updateUser({
      data: { display_name: name, age: age, gender: obGender, diseases: diseases }
    });
  }

  localStorage.setItem('yygh_onboarded_' + (user ? user.id : 'local'), 'true');
  document.getElementById('onboardModal').classList.remove('show');
  updateUserDisplay(user || { user_metadata: { display_name: name }, email: '' });
  if (typeof initMedData === 'function') await initMedData();
  showToast('个人信息已保存，可以随时添加药品');
}

// 检查是否需要引导
async function checkOnboarding() {
  var user = await getCurrentUser();
  if (!user) return;

  var key = 'yygh_onboarded_' + user.id;
  if (localStorage.getItem(key)) return; // 已经引导过

  // 检查是否有药品数据（有的话说明不是新用户）
  var meds = await getMedications();
  if (meds.length > 0) {
    localStorage.setItem(key, 'true');
    return;
  }

  // 新用户，显示引导
  // 预填昵称
  var displayName = (user.user_metadata && user.user_metadata.display_name) || '';
  if (displayName) {
    document.getElementById('obName').value = displayName;
  }

  document.getElementById('onboardModal').classList.add('show');
}
