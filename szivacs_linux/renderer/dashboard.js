const api = window.szivacs;
const DAYS_HU = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];

let currentView = 'dashboard';
let weekOffset = 0;
let userInfo = { name: 'Felhasználó', iss: '' };
const _apiCache = {};

async function cachedCall(endpoint, iss, params) {
  const cacheKey = endpoint + ':' + JSON.stringify(params ?? null);
  if (_apiCache[cacheKey]) return _apiCache[cacheKey];
  const data = await api.callEndpoint(endpoint, iss, params);
  _apiCache[cacheKey] = data;
  return data;
}

function htmlEnc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Időtúllépés')), ms)),
  ]);
}

function fmtDate(d) {
  if (!d) return '';
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1 && now.getDate() === d.getDate()) return 'Ma';
  if (diff < 2 && now.getDate() - d.getDate() === 1) return 'Tegnap';
  if (diff < 7 && now.getDay() !== d.getDay()) {
    const days = ['Vas', 'Hét', 'Kedd', 'Sze', 'Csü', 'Pén', 'Szo'];
    return days[d.getDay()];
  }
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${m}.${dd}.`;
  return `${y}.${m}.${dd}.`;
}

function subjectColor(s) {
  let hash = 0;
  for (let i = 0; i < (s || '').length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#39CCF8','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#A3DFFA','#14b8a6','#f97316','#5CD0F8','#84cc16','#d946ef'];
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getWeekRange(offset) {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { mon, sun };
}

function formatWeekLabel(mon, sun) {
  const mm = `${mon.getMonth() + 1}.${mon.getDate()}.`;
  const ss = `${sun.getMonth() + 1}.${sun.getDate()}.`;
  return `${mm} – ${ss}`;
}

let _gradeValueField = null;

function detectGradeValueField(grades) {
  if (!grades || !grades.length) return null;
  const candidates = ['Ertek', 'ertek', 'Erdemjegy', 'erdemjegy', 'Jegy', 'jegy', 'Szam', 'szam', 'Eredmeny', 'eredmeny', 'Osztalyzat', 'osztalyzat', 'Pont', 'pont', 'SulyozottErtek', 'sulyozottErtek', 'DecimalisErtek', 'decimalisErtek', 'Szazalek', 'szazalek', 'ErettsegiPont', 'erettsegiPont'];
  for (const key of candidates) {
    const v = grades[0][key];
    if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
      return key;
    }
  }
  for (const key of Object.keys(grades[0])) {
    const v = grades[0][key];
    if (typeof v === 'number' && v >= 1 && v <= 5) return key;
  }
  for (const key of Object.keys(grades[0])) {
    const v = grades[0][key];
    if (typeof v === 'string' && /^[1-5]$/.test(v)) return key;
  }
  return null;
}

function getGradeValue(g) {
  const fn = _gradeValueField || 'Ertek';
  let v = g[fn];
  if (v === undefined) v = g['ertek'];
  if (typeof v === 'number') return v;
  const parsed = parseInt(v, 10);
  return isNaN(parsed) ? NaN : parsed;
}

function isRegularGrade(val) { return !isNaN(val) && val >= 1 && val <= 5; }

function gradeDisplay(val) {
  if (isNaN(val)) return { text: '?', cls: '', isPct: false };
  if (isRegularGrade(val)) return { text: String(val), cls: `grade-${val}`, isPct: false };
  return { text: val + '%', cls: 'grade-pct', isPct: true };
}

function calcAverage(grades) {
  if (!grades || !grades.length) return 0;
  const nums = grades.map(g => {
    const v = getGradeValue(g);
    return isRegularGrade(v) ? v : null;
  }).filter(v => v !== null);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function switchView(name) {
  currentView = name;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === name));
  document.querySelectorAll('.view').forEach(el => {
    const isTarget = el.id === 'view' + name.charAt(0).toUpperCase() + name.slice(1);
    if (isTarget) {
      el.classList.remove('anim-entrance');
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.classList.remove('show'); t.classList.add('hidden'); }, duration);
}

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (show) {
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('loading-show'));
  } else {
    el.classList.remove('loading-show');
    setTimeout(() => el.classList.add('hidden'), 250);
  }
}

function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('modal-show'));
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('modal-show');
  setTimeout(() => el.classList.add('hidden'), 250);
}

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(atob(b64));
  } catch { return null; }
}

// ============== INIT ==============

async function init() {
  const status = await api.getAuthStatus();
  if (!status.isLoggedIn) {
    await api.loadLogin();
    return;
  }
  if (!status.institute_code || !status.display_name) {
    await api.logout();
    await api.loadLogin();
    return;
  }
  userInfo = { name: status.display_name || 'Felhasználó', iss: status.institute_code };
  document.getElementById('userName').textContent = userInfo.name;
  document.getElementById('userAvatar').textContent = userInfo.name[0] || 'S';
  // Verify the token actually works before showing dashboard
  try {
    await withTimeout(cachedCall('student', userInfo.iss), 10000);
  } catch {
    await api.logout();
    await api.loadLogin();
    return;
  }
  switchView('dashboard');
  loadDashboard();
  const ver = await api.getAppVersion();
  document.getElementById('versionLabel').textContent = 'Szivacs ' + ver;
  setupUpdates();
  // Apply start page setting
  const startPage = getSetting('startPage');
  if (startPage && startPage !== 'dashboard') {
    switchView(startPage);
    if (startPage === 'timetable') {
      _ttView = 'weekly';
      document.getElementById('ttViewWeekly').classList.add('active');
      document.getElementById('ttViewMonthly').classList.remove('active');
      document.getElementById('timetableContainer').style.display = '';
      document.getElementById('monthlyTimetableContainer').style.display = 'none';
      loadTimetable();
    } else if (startPage === 'grades') loadGrades();
  }
  // Hide splash screen
  const splash = document.getElementById('splashScreen');
  if (splash) { splash.classList.add('splash-hide'); setTimeout(() => splash.style.display = 'none', 400); }
}

// ============== LOGOUT ==============

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (!confirm('Biztosan ki szeretnél jelentkezni?')) return;
  await api.logout();
});

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('szivacs-theme', t);
  const isLight = t === 'light';
  const logo = document.getElementById('sidebarLogo');
  if (logo) logo.src = isLight ? '../szivacs_big_black.png' : '../szivacs_big.png';
  const loginLogo = document.querySelector('.login-logo');
  if (loginLogo) loginLogo.src = isLight ? '../szivacs_big_black.png' : '../szivacs_big.png';
}

const savedTheme = localStorage.getItem('szivacs-theme') || 'dark';
setTheme(savedTheme);
document.getElementById('themeSelect').value = savedTheme;
document.getElementById('themeSelect').addEventListener('change', (e) => setTheme(e.target.value));

// ============== SETTINGS SYSTEM ==============

const SETTINGS = {
  startPage:    { key: 'sziv_setting_startPage',    def: 'dashboard', type: 'select' },
  ttTests:      { key: 'sziv_setting_ttTests',      def: 'true',      type: 'checkbox' },
  ttSubs:       { key: 'sziv_setting_ttSubs',       def: 'true',      type: 'checkbox' },
  ttAB:         { key: 'sziv_setting_ttAB',         def: 'true',      type: 'checkbox' },
  ttDismissed:  { key: 'sziv_setting_ttDismissed',  def: 'true',      type: 'checkbox' },
  rounding:     { key: 'sziv_setting_rounding',     def: '0.50',      type: 'select' },
  showClassAvg: { key: 'sziv_setting_showClassAvg', def: 'true',      type: 'checkbox' },
  compact:      { key: 'sziv_setting_compact',      def: 'false',     type: 'checkbox' },
};

function getSetting(name) {
  const s = SETTINGS[name];
  if (!s) return null;
  const val = localStorage.getItem(s.key);
  if (val === null) return s.def;
  return val;
}

function setSetting(name, val) {
  const s = SETTINGS[name];
  if (!s) return;
  localStorage.setItem(s.key, String(val));
  if (s.type === 'checkbox') applyCompactMode();
}

function loadSettingsUI() {
  document.getElementById('settingStartPage').value = getSetting('startPage');
  document.getElementById('setTtTests').checked = getSetting('ttTests') === 'true';
  document.getElementById('setTtSubs').checked = getSetting('ttSubs') === 'true';
  document.getElementById('setTtAB').checked = getSetting('ttAB') === 'true';
  document.getElementById('setTtDismissed').checked = getSetting('ttDismissed') === 'true';
  document.getElementById('settingRounding').value = getSetting('rounding');
  document.getElementById('setShowClassAvg').checked = getSetting('showClassAvg') === 'true';
  document.getElementById('setCompact').checked = getSetting('compact') === 'true';
  applyCompactMode();
}

function applyCompactMode() {
  document.body.classList.toggle('compact-mode', getSetting('compact') === 'true');
}

// Wire up settings change handlers
document.getElementById('settingStartPage').addEventListener('change', (e) => setSetting('startPage', e.target.value));
document.getElementById('setTtTests').addEventListener('change', (e) => setSetting('ttTests', e.target.checked));
document.getElementById('setTtSubs').addEventListener('change', (e) => setSetting('ttSubs', e.target.checked));
document.getElementById('setTtAB').addEventListener('change', (e) => setSetting('ttAB', e.target.checked));
document.getElementById('setTtDismissed').addEventListener('change', (e) => setSetting('ttDismissed', e.target.checked));
document.getElementById('settingRounding').addEventListener('change', (e) => setSetting('rounding', e.target.value));
document.getElementById('setShowClassAvg').addEventListener('change', (e) => setSetting('showClassAvg', e.target.checked));
document.getElementById('setCompact').addEventListener('change', (e) => setSetting('compact', e.target.checked));

document.getElementById('sidebarUser').addEventListener('click', () => {
  showModal('settingsOverlay');
  loadAccountList();
  loadSettingsUI();
});
document.getElementById('settingsClose').addEventListener('click', () => {
  hideModal('settingsOverlay');
});
document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideModal('settingsOverlay');
});

// ============== MULTI-ACCOUNT UI ==============

async function loadAccountList() {
  const select = document.getElementById('accountSelect');
  try {
    const data = await api.getAccounts();
    select.innerHTML = data.accounts.map(a =>
      `<option value="${htmlEnc(a.institute_code)}" ${a.institute_code === data.active ? 'selected' : ''}>${htmlEnc(a.display_name)} (${htmlEnc(a.institute_code)})</option>`
    ).join('');
  } catch { select.innerHTML = '<option>Hiba</option>'; }
}

document.getElementById('addAccountBtn').addEventListener('click', async () => {
  hideModal('settingsOverlay');
  try {
    await api.addAccount();
    // Page will reload on success
  } catch (e) {
    showToast('Hiba: ' + e.message);
  }
});

document.getElementById('removeAccountBtn').addEventListener('click', async () => {
  const select = document.getElementById('accountSelect');
  const code = select.value;
  if (!code) return;
  const data = await api.getAccounts();
  if (data.accounts.length <= 1) {
    showToast('Nem távolítható el az utolsó fiók');
    return;
  }
  try {
    await api.removeAccount(code);
    await loadAccountList();
    // Reload page to switch to next account if needed
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    showToast('Hiba: ' + e.message);
  }
});

document.getElementById('accountSelect').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  try {
    await api.switchAccount(e.target.value);
    // Page will reload on success
  } catch (err) {
    showToast('Hiba: ' + err.message);
  }
});

// ============== AUTO-UPDATE ==============

function setupUpdates() {
  const statusEl = document.getElementById('updateStatus');
  const progressWrap = document.getElementById('updateProgressWrap');
  const progressBar = document.getElementById('updateProgressBar');
  const progressLabel = document.getElementById('updateProgressLabel');
  const installBtn = document.getElementById('installUpdateBtn');
  const checkBtn = document.getElementById('checkUpdateBtn');

  api.onUpdateStatus((type, data) => {
    if (type === 'checking') {
      checkBtn.disabled = true;
      statusEl.textContent = 'Frissítések keresése...';
    } else if (type === 'available') {
      checkBtn.disabled = false;
      statusEl.textContent = `Új verzió: ${data.version}`;
      progressWrap.classList.remove('hidden');
      progressWrap.style.display = 'flex';
      progressBar.style.width = '0%';
      progressLabel.textContent = 'Letöltés...';
      api.downloadUpdate();
    } else if (type === 'not-available') {
      checkBtn.disabled = false;
      statusEl.textContent = 'A legújabb verziót használod.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    } else if (type === 'error') {
      checkBtn.disabled = false;
      statusEl.textContent = 'Hiba: ' + (data?.message || 'ismeretlen');
      setTimeout(() => { statusEl.textContent = ''; }, 5000);
    } else if (type === 'progress') {
      const pct = data.percent;
      progressBar.style.width = pct + '%';
      progressLabel.textContent = pct + '%';
    } else if (type === 'downloaded') {
      progressLabel.textContent = 'Kész!';
      progressBar.style.width = '100%';
      installBtn.style.display = 'block';
      statusEl.textContent = 'A frissítés letöltve.';
    }
  });

  checkBtn.addEventListener('click', () => {
    statusEl.textContent = '';
    progressWrap.classList.add('hidden');
    progressWrap.style.display = 'none';
    installBtn.style.display = 'none';
    api.checkForUpdates();
  });

  installBtn.addEventListener('click', () => {
    api.installUpdate();
  });
}

// ============== NAVIGATION ==============

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    const view = el.dataset.view;
    switchView(view);
    if (view === 'dashboard') loadDashboard();
    else if (view === 'timetable') {
      _ttView = 'weekly';
      document.getElementById('ttViewWeekly').classList.add('active');
      document.getElementById('ttViewMonthly').classList.remove('active');
      document.getElementById('timetableContainer').style.display = '';
      document.getElementById('monthlyTimetableContainer').style.display = 'none';
      loadTimetable();
    }
    else if (view === 'grades') loadGrades();
    else if (view === 'stats') loadStats();
    else if (view === 'bag') loadBag();
    else if (view === 'homework') loadHomework();
    else if (view === 'absences') loadAbsences();
    else if (view === 'calendar') loadCalendar();
    else if (view === 'info') loadInfo();

  });
});

document.getElementById('dashTimetable').addEventListener('click', () => { switchView('timetable'); loadTimetable(); });
document.getElementById('dashGrades').addEventListener('click', () => { switchView('grades'); loadGrades(); });
document.getElementById('dashInfo').addEventListener('click', () => { switchView('info'); loadInfo(); });

// ============== DASHBOARD ==============

async function loadDashboard() {
  document.getElementById('dashboardGreeting').textContent = `Üdvözöljük, ${userInfo.name}!`;
  withTimeout(loadCurrentLesson(), 10000).catch(() => {});
  withTimeout(loadTodayTimetable(), 10000).catch(() => {});
  withTimeout(loadRecentGrades(), 10000).catch(() => {});
}

async function loadCurrentLesson() {
  const container = document.getElementById('dashCurrentContent');
  if (!userInfo.iss) { container.innerHTML = ''; return; }
  try {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
      container.innerHTML = `<div class="dash-lesson-current"><div class="clc-icon">🎉</div><div class="clc-info"><div class="clc-status">Hétvége</div><div class="clc-detail">Pihenj a hétvégén!</div></div></div>`;
      return;
    }
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);

    const data = await cachedCall('timetable', userInfo.iss, {
      datumTol: formatDate(mon),
      datumIg: formatDate(sun),
    });
    const lessons = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    const todayLessons = lessons.filter(l => {
      const ds = l.KezdetIdopont || l.Datum;
      if (!ds) return false;
      return new Date(ds).getDay() === day;
    }).sort((a, b) => {
      const pa = a.Oraszam || a.oraSorszama || 0;
      const pb = b.Oraszam || b.oraSorszama || 0;
      return pa - pb;
    });

    if (!todayLessons.length) {
      container.innerHTML = `<div class="dash-lesson-current"><div class="clc-icon">✅</div><div class="clc-info"><div class="clc-status">Ma nincs órád</div><div class="clc-detail">Szabadnapod van</div></div></div>`;
      return;
    }

    const nowMins = now.getHours() * 60 + now.getMinutes();
    const PERIOD_HOURS = { 1: 480, 2: 540, 3: 600, 4: 660, 5: 720, 6: 780, 7: 840, 8: 900, 9: 960, 10: 1020 };
    const PERIOD_LENGTH = 45;

    // Find current and next lessons
    let currentLesson = null, nextLesson = null;
    let schoolOver = true;
    for (const l of todayLessons) {
      const p = l.Oraszam || l.oraSorszama || 0;
      const startMin = PERIOD_HOURS[p];
      if (!startMin) continue;
      const endMin = startMin + PERIOD_LENGTH;
      if (nowMins >= startMin && nowMins < endMin) {
        currentLesson = l;
        schoolOver = false;
        break;
      }
      if (nowMins < startMin) {
        nextLesson = l;
        schoolOver = false;
        break;
      }
    }
    // If no current and no next, check if any lesson is still to come (between periods)
    if (!currentLesson && !nextLesson && todayLessons.length > 0) {
      const lastLesson = todayLessons[todayLessons.length - 1];
      const lastP = lastLesson.Oraszam || lastLesson.oraSorszama || 0;
      const lastEnd = (PERIOD_HOURS[lastP] || 0) + PERIOD_LENGTH;
      schoolOver = nowMins >= lastEnd;
      // Between periods — find the next upcoming lesson
      for (const l of todayLessons) {
        const p = l.Oraszam || l.oraSorszama || 0;
        const startMin = PERIOD_HOURS[p];
        if (startMin && nowMins < startMin) {
          nextLesson = l;
          schoolOver = false;
          break;
        }
      }
    }

    function lessonSubject(l) {
      return l.Tantargy && typeof l.Tantargy === 'object' ? l.Tantargy.Nev : (l.Nev || 'Ismeretlen');
    }
    function lessonTeacher(l) { return l.TanarNeve || ''; }
    function lessonRoom(l) { return l.TeremNeve || ''; }

    if (schoolOver) {
      container.innerHTML = `<div class="dash-lesson-current"><div class="clc-icon">🏁</div><div class="clc-info"><div class="clc-status">Az órák véget értek</div><div class="clc-detail">Szép napot!</div></div></div>`;
    } else if (currentLesson) {
      const subj = lessonSubject(currentLesson);
      const teacher = lessonTeacher(currentLesson);
      const room = lessonRoom(currentLesson);
      const p = currentLesson.Oraszam || currentLesson.oraSorszama || 0;
      const startMin = PERIOD_HOURS[p];
      const endMin = startMin + PERIOD_LENGTH;
      const remaining = endMin - nowMins;
      const color = subjectColor(subj);
      container.innerHTML = `<div class="dash-lesson-current" style="border-left:3px solid ${color};">
        <div class="clc-icon">📚</div>
        <div class="clc-info">
          <div class="clc-status">${htmlEnc(subj)}</div>
          <div class="clc-detail">${p}. óra · ${teacher ? htmlEnc(teacher) + ' · ' : ''}${room ? htmlEnc(room) + ' · ' : ''}${remaining} perc van hátra</div>
        </div>
      </div>`;
    } else if (nextLesson) {
      const subj = lessonSubject(nextLesson);
      const p = nextLesson.Oraszam || nextLesson.oraSorszama || 0;
      const startMin = PERIOD_HOURS[p];
      const minsUntil = startMin - nowMins;
      const color = subjectColor(subj);
      const h = Math.floor(minsUntil / 60);
      const m = minsUntil % 60;
      const timeStr = h > 0 ? `${h}ó ${m}perc` : `${m} perc`;
      container.innerHTML = `<div class="dash-lesson-current" style="border-left:3px solid ${color};">
        <div class="clc-icon">⏰</div>
        <div class="clc-info">
          <div class="clc-status">Következő: ${htmlEnc(subj)}</div>
          <div class="clc-detail">${p}. óra ${timeStr} múlva</div>
        </div>
      </div>`;
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;">Hiba: ${htmlEnc(e.message)}</div>`;
  }
}

async function loadTodayTimetable() {
  const container = document.getElementById('dashTodayContent');
  if (!userInfo.iss) { container.innerHTML = ''; return; }
  try {
    const now = new Date();
    const mon = new Date(now);
    const day = now.getDay();
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const data = await cachedCall('timetable', userInfo.iss, {
      datumTol: formatDate(mon),
      datumIg: formatDate(sun),
    });
    const lessons = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    const today = now.getDay();
    const todayLessons = lessons.filter(l => {
      const ds = l.KezdetIdopont || l.Datum;
      if (!ds) return false;
      const d = new Date(ds).getDay();
      return d === today;
    }).sort((a, b) => {
      const pa = a.Oraszam || a.oraSorszama || 0;
      const pb = b.Oraszam || b.oraSorszama || 0;
      return pa - pb;
    });
    if (!todayLessons.length) {
      container.innerHTML = `<div class="empty-state" style="padding:24px;">Ma nincs órád</div>`;
      return;
    }
    let html = '';
    for (const l of todayLessons) {
      const period = l.Oraszam || l.oraSorszama || '?';
      const subject = l.Tantargy && typeof l.Tantargy === 'object' ? l.Tantargy.Nev : (l.Nev || 'Ismeretlen');
      const teacher = l.TanarNeve || '';
      const room = l.TeremNeve || '';
      const color = subjectColor(subject);
      html += `<div class="dash-lesson">
        <div class="dash-lesson-period">${period}.</div>
        <div class="dash-lesson-bar" style="background:${color};"></div>
        <div class="dash-lesson-info">
          <div class="dash-lesson-subject">${htmlEnc(subject)}</div>
          <div class="dash-lesson-detail">${teacher ? htmlEnc(teacher) : ''}${teacher && room ? ' · ' : ''}${room ? htmlEnc(room) : ''}</div>
        </div>
      </div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;">Hiba: ${htmlEnc(e.message)}</div>`;
  }
}

async function loadRecentGrades() {
  const container = document.getElementById('dashRecentContent');
  if (!userInfo.iss) { container.innerHTML = ''; return; }
  try {
    const data = await cachedCall('grades', userInfo.iss);
    const grades = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!grades.length) {
      container.innerHTML = `<div class="empty-state" style="padding:24px;">Nincsenek jegyek</div>`;
      return;
    }
    if (!_gradeValueField) _gradeValueField = detectGradeValueField(grades);
    const sorted = [...grades].sort((a, b) => {
      const da = getGradeDate(a);
      const db = getGradeDate(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
    const recent = sorted.slice(0, 5);
    let html = '';
    for (const g of recent) {
      const val = getGradeValue(g);
      const disp = gradeDisplay(val);
      const subject = g.Tantargy && typeof g.Tantargy === 'object' ? g.Tantargy.Nev : (g.tantargy || g.subject || g.tantargyNeve || g.Tantargy || 'Ismeretlen');
      const theme = getGradeTheme(g);
      const date = getGradeDate(g);
      const dateFormatted = fmtDate(date);
      html += `<div class="dash-grade">
        <div class="grade-value ${disp.cls}">${disp.text}</div>
        <div class="dash-grade-info">
          <div class="dash-grade-subject">${htmlEnc(subject)}</div>
          <div class="dash-grade-detail">${theme ? htmlEnc(theme) : ''}</div>
        </div>
        <div class="dash-grade-date">${dateFormatted}</div>
      </div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;">Hiba: ${htmlEnc(e.message)}</div>`;
  }
}

// ============== TIMETABLE ==============

document.getElementById('prevWeek').addEventListener('click', () => { weekOffset--; loadTimetable(); });
document.getElementById('nextWeek').addEventListener('click', () => { weekOffset++; loadTimetable(); });
document.getElementById('todayBtn').addEventListener('click', () => { weekOffset = 0; loadTimetable(); });

let _ttView = 'weekly';
document.getElementById('ttViewWeekly').addEventListener('click', () => {
  _ttView = 'weekly';
  document.getElementById('ttViewWeekly').classList.add('active');
  document.getElementById('ttViewMonthly').classList.remove('active');
  document.getElementById('timetableContainer').style.display = '';
  document.getElementById('monthlyTimetableContainer').style.display = 'none';
  loadTimetable();
});
document.getElementById('ttViewMonthly').addEventListener('click', () => {
  _ttView = 'monthly';
  document.getElementById('ttViewMonthly').classList.add('active');
  document.getElementById('ttViewWeekly').classList.remove('active');
  document.getElementById('timetableContainer').style.display = 'none';
  document.getElementById('monthlyTimetableContainer').style.display = '';
  loadMonthlyTimetable();
});

async function loadTimetable() {
  const container = document.getElementById('timetableContainer');
  const label = document.getElementById('weekLabel');
  const { mon, sun } = getWeekRange(weekOffset);
  const showAB = getSetting('ttAB') === 'true';
  const ab = getABWeek(mon);
  label.textContent = `${formatWeekLabel(mon, sun)}${showAB ? ` — ${ab} hét` : ''}`;
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) {
    container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>';
    return;
  }
  try {
    showLoading(true);
    const [data, eventsData] = await Promise.all([
      cachedCall('timetable', userInfo.iss, { datumTol: formatDate(mon), datumIg: formatDate(sun) }),
      cachedCall('events', userInfo.iss).catch(() => null),
    ]);
    const events = Array.isArray(eventsData) ? eventsData : (eventsData?.value || eventsData?.items || eventsData?.d || []);
    const dateSet = new Set();
    for (const e of events) {
      const ds = e.Datum || e.datum || e.Kezdes || '';
      if (ds) dateSet.add(ds.length === 10 ? ds : ds.slice(0, 10));
    }
    renderTimetable(container, data, mon, dateSet);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

const PERIOD_TIMES = ['', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'];

function getABWeek(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = Math.floor((date - start) / 86400000);
  const weekNum = Math.ceil((diff + start.getDay() + 1) / 7);
  return weekNum % 2 === 0 ? 'B' : 'A';
}

function getCurrentPeriod() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (let p = PERIOD_TIMES.length - 1; p >= 1; p--) {
    const [h, m] = PERIOD_TIMES[p].split(':').map(Number);
    if (mins >= h * 60 + m) return p;
  }
  return 0;
}

function isLessonPast(lesson) {
  const ds = lesson.KezdetIdopont || lesson.Datum;
  if (!ds) return false;
  const start = new Date(ds);
  const now = new Date();
  return start < now;
}

function renderTimetable(container, data, weekStart, testDates) {
  const setShowTests = getSetting('ttTests') !== 'false';
  const setShowSubs = getSetting('ttSubs') !== 'false';
  const setShowDismissed = getSetting('ttDismissed') !== 'false';
  const lessons = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
  if (!lessons.length) {
    container.innerHTML = `<div class="empty-state">Nincs óra ezen a héten</div>`;
    return;
  }
  const dayNames = { 1: 'Hétfő', 2: 'Kedd', 3: 'Szerda', 4: 'Csütörtök', 5: 'Péntek' };

  function lessonDay(l) {
    const ds = l.KezdetIdopont || l.Datum;
    if (ds) { const d = new Date(ds).getDay(); return d === 0 ? 7 : d; }
    return 0;
  }
  function lessonPeriod(l) { return l.Oraszam || l.oraSorszama || 0; }
  function lessonSubject(l) {
    if (l.Tantargy && typeof l.Tantargy === 'object') return l.Tantargy.Nev || l.Tantargy.név || l.Nev;
    return l.Nev || l.tantargy || l.subject || 'Ismeretlen';
  }
  function lessonTeacher(l) { return l.TanarNeve || l.tanarNeve || l.teacher || ''; }
  function lessonSubstitute(l) { return l.HelyettesitoTanarNeve || l.helyettesitoTanarNeve || ''; }
  function lessonRoom(l) { return l.TeremNeve || l.teremNeve || l.terem || l.room || ''; }
  function lessonType(l) { return l.Tipus || l.tipus || l.LessonType || l.lessonType || l.OraTipus || l.oraTipus || ''; }
  function isDismissed(l) {
    const t = lessonType(l);
    if (typeof t === 'string' && (t.toLowerCase().includes('ures') || t.toLowerCase().includes('free') || t.toLowerCase().includes('elengedett') || t.toLowerCase().includes('szunetelo') || t.toLowerCase().includes('nem tart'))) return true;
    if (typeof t === 'object' && t !== null) {
      const tn = t.Nev || t.Megnevezes || t.Leiras || '';
      if (typeof tn === 'string' && (tn.toLowerCase().includes('ures') || tn.toLowerCase().includes('elengedett'))) return true;
    }
    return false;
  }

  const dayMap = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  let maxPeriod = 0;
  let anyMapped = false;
  for (const l of lessons) {
    const day = lessonDay(l);
    const period = lessonPeriod(l);
    if (day >= 1 && day <= 5) {
      dayMap[day].push(l);
      anyMapped = true;
      if (period > maxPeriod) maxPeriod = period;
    }
  }
  if (!anyMapped && lessons.length) {
    container.innerHTML = `<div class="empty-state">Nem sikerült felismerni az órák szerkezetét</div>`;
    return;
  }

  const today = new Date().getDay();
  const currentPeriod = getCurrentPeriod();
  const isCurrentWeek = weekOffset === 0;

  let html = '<div class="tt-grid">';
  html += '<div class="tt-cell header"></div>';
  for (let d = 1; d <= 5; d++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + d - 1);
    const isToday = today === d && isCurrentWeek;
    const dateStr = fmtDate(date);
    const key = formatDate(date);
    const hasTest = testDates && testDates.has(key);
    html += `<div class="tt-cell header ${isToday ? 'tt-today' : ''}">${dayNames[d]}<br><span class="tt-date">${dateStr}</span>${setShowTests && hasTest ? '<span class="tt-test-indicator" title="Dolgozat ezen a napon"></span>' : ''}</div>`;
  }
  const periodCount = Math.max(maxPeriod, 7);
  for (let p = 1; p <= periodCount; p++) {
    const isCurrentPeriod = p === currentPeriod && isCurrentWeek;
    html += `<div class="tt-cell time ${isCurrentPeriod ? 'tt-now' : ''}">${p}.</div>`;
    for (let d = 1; d <= 5; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d - 1);
      const isToday = today === d && isCurrentWeek;
      const key = formatDate(date);
      const lesson = dayMap[d].find(l => lessonPeriod(l) === p);
      if (lesson) {
        const subject = lessonSubject(lesson);
        const teacher = lessonTeacher(lesson);
        const substitute = lessonSubstitute(lesson);
        const room = lessonRoom(lesson);
        const dismissed = setShowDismissed && isDismissed(lesson);
        const color = dismissed ? 'var(--text-dim)' : subjectColor(subject);
        const past = isToday && isLessonPast(lesson) && p < currentPeriod;
        const cellClass = dismissed ? 'tt-dismissed' : (past ? 'tt-past' : '') + (isCurrentPeriod && isToday ? ' tt-now-cell' : '');
        let teacherDisplay = '';
        if (!dismissed) {
          if (setShowSubs && substitute) {
            teacherDisplay = `<div class="tt-detail tt-substitute">${htmlEnc(substitute)} <span class="tt-sub-badge">helyettesít</span></div>`;
          } else if (teacher) {
            teacherDisplay = `<div class="tt-detail">${htmlEnc(teacher)}</div>`;
          }
        }
        const hasTestOnDay = setShowTests && testDates && testDates.has(key);

        html += `<div class="tt-cell ${cellClass}" style="border-left:3px solid ${color};" data-subj="${htmlEnc(subject)}" data-teacher="${htmlEnc(substitute || teacher)}" data-room="${htmlEnc(room)}">
          <div class="tt-lesson">
            <span class="tt-badge" style="background:${color};"></span>
            <div class="tt-subject">${dismissed ? 'Elengedve' : htmlEnc(subject)}</div>
            ${dismissed ? '' : teacherDisplay}
            ${room && !dismissed ? `<div class="tt-detail tt-room">${htmlEnc(room)}</div>` : ''}
            ${hasTestOnDay ? '<span class="tt-test-dot" title="Dolgozat"></span>' : ''}
          </div>
        </div>`;
      } else {
        const emptyClass = isCurrentPeriod && isToday ? 'tt-now-empty' : '';
        html += `<div class="tt-cell empty ${emptyClass}"></div>`;
      }
    }
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.tt-cell[data-subj]').forEach(el => {
    el.addEventListener('click', () => {
      showToast(`${el.dataset.subj}${el.dataset.teacher ? ' · ' + el.dataset.teacher : ''}${el.dataset.room ? ' · ' + el.dataset.room : ''}`);
    });
  });
}

// ============== MONTHLY TIMETABLE ==============

let _monthlyOffset = 0;

async function loadMonthlyTimetable() {
  const container = document.getElementById('monthlyTimetableContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + _monthlyOffset, 1);
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

    // Fetch timetable for the whole month + padding weeks
    const fetchStart = new Date(monthStart);
    fetchStart.setDate(fetchStart.getDate() - fetchStart.getDay() + 1); // Monday before
    const fetchEnd = new Date(monthEnd);
    fetchEnd.setDate(fetchEnd.getDate() + (7 - fetchEnd.getDay())); // Sunday after

    const data = await cachedCall('timetable', userInfo.iss, {
      datumTol: formatDate(fetchStart),
      datumIg: formatDate(fetchEnd),
    });
    const lessons = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);

    // Build day map: key = YYYY-MM-DD → [{ subject, teacher, room, period }]
    const dayMap = {};
    for (const l of lessons) {
      const ds = l.KezdetIdopont || l.Datum;
      if (!ds) continue;
      const d = new Date(ds);
      const key = formatDate(d);
      const subj = l.Tantargy && typeof l.Tantargy === 'object' ? l.Tantargy.Nev : (l.Nev || 'Ismeretlen');
      if (!dayMap[key]) dayMap[key] = [];
      dayMap[key].push({
        subject: subj,
        teacher: l.TanarNeve || '',
        room: l.TeremNeve || '',
        period: l.Oraszam || l.oraSorszama || 0,
      });
    }

    // Render month calendar
    const firstDay = targetMonth.getDay() === 0 ? 6 : targetMonth.getDay() - 1;
    const daysInMonth = monthEnd.getDate();
    const today = new Date();
    const todayKey = formatDate(today);

    let html = `<div class="cal-nav">
      <button id="mtPrev" class="btn btn-ghost btn-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3l-5 5 5 5"/></svg></button>
      <span class="cal-label">${targetMonth.getFullYear()}. ${targetMonth.toLocaleDateString('hu-HU', { month: 'long' })}</span>
      <button id="mtNext" class="btn btn-ghost btn-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l5 5-5 5"/></svg></button>
      <button id="mtToday" class="btn btn-outline btn-sm" style="margin-left:auto;">Ma</button>
    </div><div class="cal-grid">`;

    const dayHeaders = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
    for (const h of dayHeaders) html += `<div class="cal-header">${h}</div>`;

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell cal-other"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), d);
      const key = formatDate(dateObj);
      const entries = dayMap[key] || [];
      const count = entries.length;
      const isToday = key === todayKey;
      const dow = dateObj.getDay();
      const isWeekend = dow === 0 || dow === 6;

      let dotClass = '';
      if (count === 0) dotClass = 'mt-dot-none';
      else if (count <= 3) dotClass = 'mt-dot-low';
      else if (count <= 5) dotClass = 'mt-dot-mid';
      else dotClass = 'mt-dot-high';

      html += `<div class="cal-cell ${isToday ? 'cal-today' : ''} ${isWeekend ? 'cal-other' : ''} ${count > 0 ? 'cal-has' : ''}" data-key="${key}">
        <span class="cal-day">${d}</span>
        ${count > 0 ? `<span class="mt-dot ${dotClass}">${count}</span>` : ''}
      </div>`;
    }

    html += `</div><div id="mtDetail" class="cal-detail" style="margin-top:16px;"><div class="empty-state" style="padding:16px;">Kattints egy napra a részletekért</div></div>`;
    container.innerHTML = html;

    // Day click handler
    container.querySelectorAll('.cal-cell.cal-has').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        const entries = dayMap[key] || [];
        const d = new Date(key + 'T00:00:00');
        let detail = `<div class="cal-detail-date">${['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'][d.getDay()]}, ${fmtDate(d)} (${entries.length} óra)</div>`;
        for (const e of entries) {
          const color = subjectColor(e.subject);
          detail += `<div class="cal-detail-item" style="border-left:3px solid ${color};padding-left:10px;border-radius:4px;">
            <div class="cal-detail-info">
              <div class="cal-detail-subj">${htmlEnc(e.subject)}</div>
              <div class="cal-detail-theme">${e.period}. óra${e.teacher ? ' · ' + htmlEnc(e.teacher) : ''}${e.room ? ' · ' + htmlEnc(e.room) : ''}</div>
            </div>
          </div>`;
        }
        document.getElementById('mtDetail').innerHTML = detail;
      });
    });

    // Nav buttons
    document.getElementById('mtPrev').addEventListener('click', () => { _monthlyOffset--; loadMonthlyTimetable(); });
    document.getElementById('mtNext').addEventListener('click', () => { _monthlyOffset++; loadMonthlyTimetable(); });
    document.getElementById('mtToday').addEventListener('click', () => { _monthlyOffset = 0; loadMonthlyTimetable(); });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== BAG ==============

async function loadBag() {
  const container = document.getElementById('bagContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const data = await cachedCall('timetable', userInfo.iss, {
      datumTol: formatDate(mon),
      datumIg: formatDate(sun),
    });
    const lessons = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!lessons.length) {
      container.innerHTML = '<div class="empty-state">Nincs óra ezen a héten</div>';
      return;
    }

    function lSubject(l) {
      if (l.Tantargy && typeof l.Tantargy === 'object') return l.Tantargy.Nev || l.Tantargy.név;
      return l.Nev || l.tantargy || l.subject || 'Ismeretlen';
    }
    function lDay(l) {
      const ds = l.KezdetIdopont || l.Datum;
      if (ds) { const d = new Date(ds).getDay(); return d === 0 ? 7 : d; }
      return 0;
    }
    function lPeriod(l) { return l.Oraszam || l.oraSorszama || 0; }

    const dayMap = {};
    for (let d = 1; d <= 5; d++) dayMap[d] = [];
    for (const l of lessons) {
      const d = lDay(l);
      if (d >= 1 && d <= 5) dayMap[d].push(l);
    }

    const todayIdx = day >= 1 && day <= 5 ? day : null;
    const yesterdayIdx = todayIdx && todayIdx > 1 ? todayIdx - 1 : null;
    const tomorrowIdx = todayIdx && todayIdx < 5 ? todayIdx + 1 : null;

    function subjectsSet(d) { return new Set(dayMap[d].map(lSubject)); }

    const todaySubjs = todayIdx ? subjectsSet(todayIdx) : new Set();
    const yesterdaySubjs = yesterdayIdx ? subjectsSet(yesterdayIdx) : new Set();
    const tomorrowSubjs = tomorrowIdx ? subjectsSet(tomorrowIdx) : new Set();

    const toPack = todayIdx ? dayMap[todayIdx].sort((a, b) => lPeriod(a) - lPeriod(b)) : [];
    const toPrepare = tomorrowIdx ? dayMap[tomorrowIdx].sort((a, b) => lPeriod(a) - lPeriod(b)) : [];

    const newToday = [...todaySubjs].filter(s => !yesterdaySubjs.has(s));
    const notNeeded = [...yesterdaySubjs].filter(s => !todaySubjs.has(s));

    const HUN = { 1: 'Hétfő', 2: 'Kedd', 3: 'Szerda', 4: 'Csütörtök', 5: 'Péntek' };

    let html = `
    <div class="bag-today">
      <div class="bag-day-label ${!todayIdx ? 'bag-dim' : ''}">${todayIdx ? HUN[todayIdx] + ' (ma)' : 'Hétvége'}</div>
      <div class="bag-section-title">Bepakolni</div>
      <div class="bag-items">`;

    if (todayIdx && toPack.length) {
      for (const l of toPack) {
        const subj = lSubject(l);
        const color = subjectColor(subj);
        const period = lPeriod(l);
        const room = l.TeremNeve || '';
        html += `<div class="bag-item" style="border-left:3px solid ${color};">
          <span class="bag-badge" style="background:${color};"></span>
          <div class="bag-item-info">
            <div class="bag-item-name">${htmlEnc(subj)}</div>
            <div class="bag-item-meta">${period}. óra${room ? ' · ' + htmlEnc(room) : ''}</div>
          </div>
        </div>`;
      }
    } else if (todayIdx) {
      html += `<div class="bag-empty">Ma nincs órád</div>`;
    } else {
      html += `<div class="bag-empty">Pihenj!</div>`;
    }

    html += `</div>`;

    if (newToday.length || notNeeded.length) {
      html += `<div class="bag-diff">`;
      if (newToday.length) {
        html += `<div class="bag-diff-col"><div class="bag-section-title bag-new">Új tantárgy</div>`;
        for (const s of newToday) {
          const color = subjectColor(s);
          html += `<div class="bag-item" style="border-left:3px solid ${color};">
            <span class="bag-badge" style="background:${color};"></span>
            <div class="bag-item-info"><div class="bag-item-name">${htmlEnc(s)}</div></div>
          </div>`;
        }
        html += `</div>`;
      }
      if (notNeeded.length) {
        html += `<div class="bag-diff-col"><div class="bag-section-title bag-out">Kivehető</div>`;
        for (const s of notNeeded) {
          const color = subjectColor(s);
          html += `<div class="bag-item bag-item-out" style="border-left:3px solid ${color};">
            <span class="bag-badge" style="background:${color};"></span>
            <div class="bag-item-info"><div class="bag-item-name">${htmlEnc(s)}</div></div>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }

    if (tomorrowIdx) {
      html += `<div class="bag-tomorrow">
        <div class="bag-day-label">${HUN[tomorrowIdx]} (holnap)</div>
        <div class="bag-section-title">Előkészíteni</div>
        <div class="bag-items">`;
      for (const l of toPrepare) {
        const subj = lSubject(l);
        const color = subjectColor(subj);
        const period = lPeriod(l);
        const room = l.TeremNeve || '';
        html += `<div class="bag-item" style="border-left:3px solid ${color};">
          <span class="bag-badge" style="background:${color};"></span>
          <div class="bag-item-info">
            <div class="bag-item-name">${htmlEnc(subj)}</div>
            <div class="bag-item-meta">${period}. óra${room ? ' · ' + htmlEnc(room) : ''}</div>
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== HOMEWORK ==============

async function loadHomework() {
  const container = document.getElementById('homeworkContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);
    const oneWeekLater = new Date(now);
    oneWeekLater.setDate(now.getDate() + 7);
    const data = await cachedCall('homework', userInfo.iss, {
      datumTol: formatDate(twoWeeksAgo),
      datumIg: formatDate(oneWeekLater),
    });
    const items = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Nincs kiírt házi feladat</div>';
      return;
    }
    const active = [];
    const past = [];
    for (const hw of items) {
      const deadline = hw.HataridoDatuma || hw.Hatarido || hw.BeadasDatuma || hw.Datum || '';
      const hwDate = deadline ? new Date(deadline) : null;
      if (hwDate && !isNaN(hwDate.getTime()) && hwDate < now) {
        past.push(hw);
      } else {
        active.push(hw);
      }
    }
    // Update homework badge
    const badge = document.getElementById('hwBadge');
    if (badge) {
      const activeCount = active.length;
      if (activeCount > 0) { badge.textContent = activeCount; badge.classList.remove('hidden'); }
      else { badge.classList.add('hidden'); }
    }
    active.sort((a, b) => {
      const da = a.HataridoDatuma || a.FeladasDatuma || a.Hatarido || '';
      const db = b.HataridoDatuma || b.FeladasDatuma || b.Hatarido || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da) - new Date(db);
    });
    past.sort((a, b) => {
      const da = a.HataridoDatuma || a.FeladasDatuma || a.Hatarido || '';
      const db = b.HataridoDatuma || b.FeladasDatuma || b.Hatarido || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(db) - new Date(da);
    });

    let html = '';
    if (active.length) {
      html += `<h2 class="hw-section-title hw-active-title">Aktív (${active.length})</h2>
      <div class="hw-list">`;
      for (const hw of active) {
        html += renderHomeworkItem(hw, false);
      }
      html += `</div>`;
    }
    if (past.length) {
      html += `<h2 class="hw-section-title hw-past-title">Lejárt (${past.length})</h2>
      <div class="hw-list">`;
      for (const hw of past) {
        html += renderHomeworkItem(hw, true);
      }
      html += `</div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('.hw-toggle-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = el.closest('.hw-item');
        const uid = item?.dataset.hwUid;
        if (!uid) return;
        const hw = [...active, ...past].find(h => {
          const hid = h.Uid || h.uid || h.Id || h.id || h.Azonosito || h.Azonosito || '';
          return String(hid) === uid;
        });
        if (hw) { toggleHwDone(hw); loadHomework(); }
      });
    });
  } catch (e) {
    const preview = typeof data !== 'undefined' && data ? JSON.stringify(data).slice(0, 600) : '';
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>${preview ? `<div style="font-size:11px;color:var(--text-dim);background:var(--surface);padding:12px;border-radius:6px;margin-top:8px;white-space:pre-wrap;word-break:break-word;"><strong>API válasz:</strong><br>${htmlEnc(preview)}</div>` : ''}`;
  } finally {
    showLoading(false);
  }
}

function getHwDoneKey(hw) {
  return 'sziv_hw_done_' + (hw.Uid || hw.uid || hw.Id || hw.id || hw.Azonosito || hw.Azonosito);
}

function isHwDone(hw) {
  const apiDone = hw.IsMegoldva === true || hw.IsMegoldva === 'true' || hw.IsBeadhato === false;
  const localDone = localStorage.getItem(getHwDoneKey(hw)) === 'true';
  return apiDone || localDone;
}

function toggleHwDone(hw) {
  const key = getHwDoneKey(hw);
  const current = localStorage.getItem(key) === 'true';
  localStorage.setItem(key, current ? 'false' : 'true');
}

function renderHomeworkItem(hw, isPast) {
  const subject = hw.Tantargy && typeof hw.Tantargy === 'object' ? hw.Tantargy.Nev : (hw.TantargyNeve || hw.Tantargy || hw.tantargy || '');
  const desc = hw.Szoveg || hw.Leiras || hw.FeladatLeiras || hw.Megnevezes || hw.Tartalom || '';
  const deadline = hw.HataridoDatuma || hw.Hatarido || hw.BeadasDatuma || hw.Datum || '';
  const deadlineFormatted = deadline ? fmtDate(new Date(deadline)) : '';
  const deadlineFull = deadline ? new Date(deadline).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const teacher = hw.RogzitoTanarNeve || hw.TanarNeve || hw.tanarNeve || '';
  const color = subjectColor(subject);
  const isDone = isHwDone(hw);
  const uid = hw.Uid || hw.uid || hw.Id || hw.id || hw.Azonosito || hw.Azonosito || 'hw_' + Math.random();

  let html = `<div class="hw-item ${isPast ? 'hw-past' : ''} ${isDone ? 'hw-done' : ''}" style="border-left:3px solid ${color};" data-hw-uid="${htmlEnc(String(uid))}">`;
  html += `<div class="hw-header">
    <span class="hw-badge" style="background:${color};"></span>
    <span class="hw-subject">${htmlEnc(subject || 'Ismeretlen')}</span>
    <span class="hw-toggle-btn" title="${isDone ? 'Megjelölés folyamatban' : 'Megjelölés készként'}">${isDone ? '✓' : '◻'}</span>
    ${isDone ? '<span class="hw-done-badge">Kész</span>' : ''}
  </div>`;
  if (desc) {
    html += `<div class="hw-desc">${desc}</div>`;
  }
  html += `<div class="hw-meta">`;
  if (deadlineFormatted) {
    html += `<span class="hw-deadline ${isPast ? 'hw-deadline-past' : ''}">${htmlEnc(deadlineFull)}</span>`;
  }
  if (teacher) {
    html += `<span class="hw-teacher">${htmlEnc(teacher)}</span>`;
  }
  html += `</div>`;
  html += `</div>`;
  return html;
}

// ============== ABSENCES ==============

async function loadAbsences() {
  const container = document.getElementById('absencesContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const data = await cachedCall('absences', userInfo.iss);
    const absences = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!absences.length) {
      container.innerHTML = '<div class="empty-state">Nincs hiányzás</div>';
      return;
    }
    const total = absences.length;

    // Debug: show first item raw data so we can identify the real field name
    const first = absences[0];
    const firstItemJson = JSON.stringify(first, null, 2).slice(0, 1200);
    const firstKeys = Object.keys(first).join(', ');
    const firstValues = Object.entries(first).slice(0, 8).map(([k, v]) =>
      `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80)}`
    ).join('\n');

    // Try to find the justified field by scanning every key for likely values
    let justifiedField = null;
    let typeField = null;
    for (const key of Object.keys(first)) {
      const val = first[key];
      if (val === true || val === false || val === 'true' || val === 'false' || val === 1 || val === 0) {
        justifiedField = key;
        break;
      }
      if (typeof val === 'string' && (val.toLowerCase().includes('igazolt') || val.toLowerCase() === 'igazolatlan' || val.toLowerCase() === 'justified' || val.toLowerCase() === 'unjustified')) {
        typeField = key;
        break;
      }
    }
    if (!justifiedField && !typeField) {
      const candidates = ['Igazolt', 'igazolt', 'IgazoltE', 'igazoltE', 'Justified', 'justified', 'IsIgazolt', 'isIgazolt', 'IgazolasTipusa', 'igazolasTipusa', 'Tipus', 'tipus', 'Status', 'status', 'Allapot', 'allapot', 'Jelleg', 'jelleg', 'MulasztasTipus', 'mulasztasTipus'];
      justifiedField = candidates.find(k => k in first);
      if (!justifiedField) typeField = candidates.find(k => k in first);
    }

    const isJustified = (a) => {
      if (justifiedField) {
        const val = a[justifiedField];
        if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
        if (typeof val === 'number') return val === 1;
        return !!val;
      }
      if (typeField) {
        const val = a[typeField];
        if (typeof val === 'string') return val.toLowerCase().includes('igazolt') && !val.toLowerCase().includes('igazolatlan');
        return false;
      }
      return false;
    };

    const justified = absences.filter(isJustified).length;
    const unjustified = total - justified;

    let html = `<div class="abs-summary">
      <div class="abs-stat"><span class="abs-num">${total}</span> összesen</div>
      <div class="abs-stat"><span class="abs-num abs-ok">${justified}</span> igazolt</div>
      <div class="abs-stat"><span class="abs-num abs-bad">${unjustified}</span> igazolatlan</div>
    </div>`;

    html += `<div class="abs-list">`;
    for (const a of absences) {
      const date = a.Datum || a.datum || a.MulasztasDatum || a.mulasztasDatum || '';
      const dateFormatted = date ? fmtDate(new Date(date + (date.length === 10 ? 'T00:00:00' : ''))) : '';
      const subj = a.Tantargy && typeof a.Tantargy === 'object' ? a.Tantargy.Nev : (a.tantargy || a.Tantargy || '');
      const hours = a.OrakSzama || a.orakSzama || a.TavolletOrak || '';
      const isOk = isJustified(a);
      const status = isOk ? 'Igazolt' : 'Igazolatlan';
      html += `<div class="abs-item ${isOk ? 'abs-ok-item' : 'abs-bad-item'}">
        <div class="abs-status ${isOk ? 'abs-status-ok' : 'abs-status-bad'}"></div>
        <div class="abs-item-info">
          <div class="abs-item-date">${htmlEnc(dateFormatted)}</div>
          <div class="abs-item-subj">${subj ? htmlEnc(subj) : ''}${hours ? ' · ' + htmlEnc(hours) + ' óra' : ''}</div>
        </div>
        <div class="abs-item-status">${status}</div>
      </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Nem sikerült betölteni a hiányzásokat</div><div class="empty-state" style="font-size:12px;color:var(--text-dim);">${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== CALENDAR (Dolgozat Naptár) ==============

async function loadCalendar() {
  const container = document.getElementById('calendarContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const [gradesData, eventsData] = await Promise.all([
      cachedCall('grades', userInfo.iss),
      cachedCall('events', userInfo.iss).catch(() => null),
    ]);
    const grades = Array.isArray(gradesData) ? gradesData : (gradesData?.value || gradesData?.items || gradesData?.d || []);
    const events = Array.isArray(eventsData) ? eventsData : (eventsData?.value || eventsData?.items || eventsData?.d || []);

    const today = new Date();
    const startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const testGrades = grades.filter(g => {
      const date = getGradeDate(g);
      if (!date || date < startMonth || date > endMonth) return false;
      const type = getGradeType(g);
      const subj = getGradeSubject(g);
      return true;
    });

    const dayMap = {};
    for (const g of testGrades) {
      const date = getGradeDate(g);
      if (!date) continue;
      const key = formatDate(date);
      if (!dayMap[key]) dayMap[key] = [];
      dayMap[key].push({ type: 'grade', subject: getGradeSubject(g), val: getGradeValue(g), theme: getGradeTheme(g), date: g });
    }
    for (const e of events) {
      const date = e.Datum || e.datum || e.Kezdes || '';
      if (!date) continue;
      const key = date.length === 10 ? date : date.slice(0, 10);
      if (!dayMap[key]) dayMap[key] = [];
      dayMap[key].push({ type: 'event', title: e.Megnevezes || e.cim || e.Nev || e.Leiras || 'Esemény', date: e });
    }

    const now = new Date();
    let html = `<div class="cal-nav">
      <button id="calPrev" class="btn btn-ghost btn-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3l-5 5 5 5"/></svg></button>
      <span id="calLabel" class="cal-label">${now.getFullYear()}. ${now.toLocaleDateString('hu-HU', { month: 'long' })}</span>
      <button id="calNext" class="btn btn-ghost btn-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l5 5-5 5"/></svg></button>
    </div><div class="cal-grid"><div class="cal-header">H</div><div class="cal-header">K</div><div class="cal-header">Sze</div><div class="cal-header">Cs</div><div class="cal-header">P</div><div class="cal-header">Szo</div><div class="cal-header">V</div>`;

    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let i = 0; i < startPad; i++) html += `<div class="cal-cell cal-other"></div>`;
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(now.getFullYear(), now.getMonth(), d);
      const key = formatDate(dateObj);
      const items = dayMap[key] || [];
      const isToday = d === today.getDate() && now.getMonth() === today.getMonth() && now.getFullYear() === today.getFullYear();
      const hasTest = items.some(i => i.type === 'grade');
      const hasEvent = items.some(i => i.type === 'event');
      html += `<div class="cal-cell ${isToday ? 'cal-today' : ''} ${items.length ? 'cal-has' : ''}" data-key="${key}">
        <span class="cal-day">${d}</span>
        ${hasTest ? '<span class="cal-dot cal-dot-test"></span>' : ''}
        ${hasEvent ? '<span class="cal-dot cal-dot-event"></span>' : ''}
      </div>`;
    }
    html += `</div><div id="calDetail" class="cal-detail"><div class="empty-state" style="padding:16px;">Kattints egy napra</div></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.cal-cell.cal-has').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        const items = dayMap[key] || [];
        const d = new Date(key + 'T00:00:00');
        let detail = `<div class="cal-detail-date">${['Vasárnap','Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat'][d.getDay()]}, ${fmtDate(d)}</div>`;
        for (const item of items) {
          if (item.type === 'grade') {
            const disp = gradeDisplay(item.val);
            detail += `<div class="cal-detail-item">
              <span class="grade-value ${disp.cls}" style="width:28px;height:28px;font-size:11px;">${disp.text}</span>
              <div class="cal-detail-info">
                <div class="cal-detail-subj">${htmlEnc(item.subject)}</div>
                <div class="cal-detail-theme">${item.theme ? htmlEnc(item.theme) : ''}</div>
              </div>
            </div>`;
          } else {
            detail += `<div class="cal-detail-item">
              <span class="cal-detail-icon">📌</span>
              <div class="cal-detail-info">
                <div class="cal-detail-subj">${htmlEnc(item.title)}</div>
              </div>
            </div>`;
          }
        }
        document.getElementById('calDetail').innerHTML = detail;
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== GRADES ==============

document.getElementById('gradeFilter').addEventListener('change', () => renderGrades());

document.getElementById('calcBtn').addEventListener('click', () => {
  window._calcFilteredGrades = null;
  const hint = document.getElementById('calcSubjectHint');
  if (hint) { hint.style.display = 'none'; }
  const grades = window._gradeData || [];
  const regulars = grades.map(g => getGradeValue(g)).filter(isRegularGrade);
  const avg = regulars.length ? (regulars.reduce((a, b) => a + b, 0) / regulars.length) : 0;
  document.getElementById('calcCurrentAvg').textContent = avg ? avg.toFixed(2) : '–';
  document.getElementById('calcGradeCount').textContent = regulars.length;
  showModal('calcOverlay');
  updateCalcResults();
});
document.getElementById('calcClose').addEventListener('click', () => hideModal('calcOverlay'));
document.getElementById('calcOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideModal('calcOverlay'); });

function updateCalcResults() {
  const filtered = window._calcFilteredGrades;
  const grades = filtered || window._gradeData || [];
  const regulars = grades.map(g => getGradeValue(g)).filter(isRegularGrade);
  const currentSum = regulars.reduce((a, b) => a + b, 0);
  const count = regulars.length;

  const newGrade = parseFloat(document.getElementById('calcInputGrade').value) || 5;
  const newAvg = (currentSum + newGrade) / (count + 1);
  document.getElementById('calcResult').textContent = newAvg.toFixed(2);
  document.getElementById('calcResult').style.color = newAvg >= 4.5 ? 'var(--success)' : newAvg >= 3.5 ? 'var(--primary)' : newAvg >= 2.5 ? 'var(--warning)' : 'var(--danger)';

  const target = parseFloat(document.getElementById('calcInputTarget').value) || 4;
  const needed = target * (count + 1) - currentSum;
  const targetResult = document.getElementById('calcTargetResult');
  if (needed > 5) {
    targetResult.textContent = 'Lehetetlen';
    targetResult.style.color = 'var(--danger)';
  } else if (needed < 1) {
    targetResult.textContent = 'Bármilyen jegy elég';
    targetResult.style.color = 'var(--success)';
  } else {
    targetResult.textContent = needed.toFixed(1) + ' kell';
    targetResult.style.color = needed > 4 ? 'var(--danger)' : needed > 3 ? 'var(--warning)' : 'var(--primary)';
  }
}
document.getElementById('calcInputGrade').addEventListener('input', updateCalcResults);
document.getElementById('calcInputTarget').addEventListener('input', updateCalcResults);

async function loadGrades() {
  const container = document.getElementById('gradesContainer');
  const summary = document.getElementById('gradesSummary');
  const filter = document.getElementById('gradeFilter');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) {
    container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>';
    return;
  }
  try {
    showLoading(true);
    const data = await cachedCall('grades', userInfo.iss);
    const grades = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!grades.length) {
      const preview = typeof data === 'object' && data ? JSON.stringify(data).slice(0, 600) : String(data);
      container.innerHTML = `<div class="empty-state">Nincsenek jegyek</div><div style="font-size:11px;color:var(--text-dim);background:var(--surface);padding:12px;border-radius:6px;margin-top:8px;white-space:pre-wrap;word-break:break-word;"><strong>API válasz:</strong><br>${htmlEnc(preview)}</div>`;
      summary.innerHTML = '';
      return;
    }
    console.log('Raw grades response:', data);
    console.log('First grade item:', JSON.stringify(grades[0], null, 2));
    const subjects = [...new Set(grades.map(g => {
      if (g.Tantargy && typeof g.Tantargy === 'object') return g.Tantargy.Nev || g.Tantargy.név || 'Egyéb';
      return g.tantargy || g.subject || g.tantargyNeve || g.Tantargy || 'Egyéb';
    }))].sort();
    filter.innerHTML = '<option value="all">Minden tárgy</option>' +
      subjects.map(s => `<option value="${htmlEnc(s)}">${htmlEnc(s)}</option>`).join('');
    _gradeValueField = detectGradeValueField(grades);
    console.log('Detected grade value field:', _gradeValueField);
    console.log('First grade Tipus:', JSON.stringify(grades[0].Tipus));
    const avg = calcAverage(grades);
    const count = grades.length;
    summary.innerHTML = `
      <div class="stat">Átlag: <strong>${avg.toFixed(2)}</strong></div>
      <div class="stat">Jegyek: <strong>${count}</strong></div>
    `;
    window._gradeData = grades;
    // Try loading class averages
    withTimeout(loadClassAverages(grades), 8000).catch(() => {});
    renderGrades();
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== CLASS AVERAGES ==============

let _classAverages = {}; // { subject_name: average }

async function loadClassAverages(grades) {
  if (!userInfo.iss) return;
  if (getSetting('showClassAvg') === 'false') return;
  try {
    const data = await api.callEndpoint('classAverages', userInfo.iss);
    const items = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!items || !items.length) return;
    // Map subject -> average from the API response
    for (const item of items) {
      const subj = item.Tantargy && typeof item.Tantargy === 'object' ? item.Tantargy.Nev : (item.tantargy || item.Tantargy || item.tantargyNeve || '');
      const avg = item.Atlag || item.atlag || item.OsztalyAtlag || item.osztalyAtlag || item.ErdemjegyAtlag || item.erdemjegyAtlag;
      if (subj && avg !== undefined && avg !== null) {
        _classAverages[subj] = parseFloat(avg);
      }
    }
    if (Object.keys(_classAverages).length > 0) {
      // Add class average to summary
      const allAvgs = Object.values(_classAverages).filter(v => !isNaN(v));
      if (allAvgs.length > 0) {
        const overallClassAvg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
        const display = document.getElementById('classAvgDisplay');
        display.style.display = 'block';
        display.innerHTML = `<div class="stat">Osztályátlag: <strong>${overallClassAvg.toFixed(2)}</strong></div>`;
      }
    }
  } catch (e) {
    // Class averages not available — silently ignore
    console.log('Class averages not available:', e.message);
  }
}

function getGradeType(g) {
  if (g.Tipus && typeof g.Tipus === 'object') {
    return g.Tipus.Nev || g.Tipus.Megnevezes || g.Tipus.Leiras || g.Tipus.TipusNev || g.Tipus.Kod || '';
  }
  if (g.tipus && typeof g.tipus === 'object') return g.tipus.Nev || g.tipus.Megnevezes || '';
  if (g.kiertekelesTipus) return g.kiertekelesTipus;
  if (g.KiertekelesTipus) return g.KiertekelesTipus;
  if (g.type) return g.type;
  return typeof g.Tipus === 'string' ? g.Tipus : '';
}

function getGradeTheme(g) {
  return g.Tema || g.tema || '';
}

function getGradeWeight(g) {
  const v = g.SulySzazalekErteke || g.sulySzazalekErteke || g.Suly || g.suly || '';
  if (v !== undefined && v !== '') return typeof v === 'number' ? v + '%' : String(v) + (String(v).includes('%') ? '' : '%');
  return '';
}

function getGradeDate(g) {
  const ds = g.KeszitesDatuma || g.KiertekelesDatum || g.kiertekelesDatum || g.Datum || g.datum || g.RogzitesDatuma || '';
  if (!ds) return null;
  const d = new Date(ds + (ds.length === 10 ? 'T00:00:00' : ''));
  return isNaN(d.getTime()) ? null : d;
}

let _gradeLayout = 'vertical';

document.getElementById('layoutVertical').addEventListener('click', () => {
  _gradeLayout = 'vertical';
  document.getElementById('layoutVertical').classList.add('active');
  document.getElementById('layoutHorizontal').classList.remove('active');
  document.getElementById('gradesContainer').className = 'grades-list';
  renderGrades();
});
document.getElementById('layoutHorizontal').addEventListener('click', () => {
  _gradeLayout = 'horizontal';
  document.getElementById('layoutHorizontal').classList.add('active');
  document.getElementById('layoutVertical').classList.remove('active');
  document.getElementById('gradesContainer').className = 'grades-horizontal';
  renderGrades();
});

function getGradeSubject(g) {
  if (g.Tantargy && typeof g.Tantargy === 'object') return g.Tantargy.Nev || g.Tantargy.név || 'Egyéb';
  return g.tantargy || g.subject || g.tantargyNeve || g.Tantargy || 'Ismeretlen';
}

function renderGrades() {
  if (_gradeLayout === 'horizontal') return renderGradesHorizontal();
  renderGradesVertical();
}

function renderGradesVertical() {
  const container = document.getElementById('gradesContainer');
  const filterVal = document.getElementById('gradeFilter').value;
  const grades = window._gradeData || [];
  let filtered = grades;
  if (filterVal !== 'all') {
    filtered = grades.filter(g => getGradeSubject(g) === filterVal);
  }
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state">Nincsenek jegyek</div>';
    return;
  }
  const sorted = [...filtered].sort((a, b) => {
    const da = getGradeDate(a);
    const db = getGradeDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });
  let html = '';
  for (const g of sorted) {
    const val = getGradeValue(g);
    const disp = gradeDisplay(val);
    const subject = getGradeSubject(g);
    const teacher = g.ErtekeloTanarNeve || g.TanarNeve || g.tanarNeve || g.kiertekelestAdoTanar || '';
    const theme = getGradeTheme(g);
    const weight = getGradeWeight(g);
    const date = getGradeDate(g);
    const dateFormatted = fmtDate(date);
    html += `<div class="grade-item">
      <div class="grade-value ${disp.cls}">${disp.text}</div>
      <div class="grade-info">
        <div class="grade-subject">${htmlEnc(subject)}</div>
        <div class="grade-meta">${theme ? htmlEnc(theme) : ''}${theme && weight ? ' &middot; ' : ''}${weight ? htmlEnc(weight) : ''}</div>
        ${teacher ? `<div class="grade-meta">${htmlEnc(teacher)}</div>` : ''}
      </div>
      <div class="grade-date">${dateFormatted}</div>
    </div>`;
  }
  container.innerHTML = html;
}

function renderGradesHorizontal() {
  const container = document.getElementById('gradesContainer');
  const grades = window._gradeData || [];
  if (!grades.length) {
    container.innerHTML = '<div class="empty-state">Nincsenek jegyek</div>';
    return;
  }
  const groups = {};
  const gradeMap = {};
  for (const g of grades) {
    const subj = getGradeSubject(g);
    if (!groups[subj]) groups[subj] = [];
    groups[subj].push(g);
  }
  const subjects = Object.keys(groups).sort();
  let idx = 0;
  let html = '';
  for (const subj of subjects) {
    const subjGrades = [...groups[subj]].sort((a, b) => {
      const da = getGradeDate(a);
      const db = getGradeDate(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    const color = subjectColor(subj);
    const subjAvg = calcAverage(subjGrades);
    const classAvg = _classAverages[subj];
    const regCount = subjGrades.filter(g => isRegularGrade(getGradeValue(g))).length;
    let gradesHtml = '';
    for (const g of subjGrades) {
      const val = getGradeValue(g);
      const disp = gradeDisplay(val);
      gradeMap['g' + idx] = g;
      gradesHtml += `<div class="gh-grade" data-idx="${idx}">
        <div class="grade-value ${disp.cls}">${disp.text}</div>
      </div>`;
      idx++;
    }
    html += `<div class="gh-row" data-subj="${htmlEnc(subj)}">
      <div class="gh-subject" style="border-left:3px solid ${color};padding-left:10px;">
        <span class="gh-subj-name">${htmlEnc(subj)}</span>
        <span class="gh-subj-avg">${subjAvg > 0 ? subjAvg.toFixed(2) : '–'}</span>
        ${classAvg ? `<span class="gh-class-avg" title="Osztályátlag">📊 ${classAvg.toFixed(2)}</span>` : ''}
      </div>
      <div class="gh-grades">${gradesHtml}</div>
      ${regCount > 0 ? `<button class="gh-calc-btn btn btn-ghost btn-icon" title="Számológép ehhez a tantárgyhoz"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h3"/></svg></button>` : ''}
    </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.gh-grade').forEach(el => {
    el.addEventListener('click', () => {
      const g = gradeMap['g' + el.dataset.idx];
      if (g) showGradeDetail(g);
    });
  });
  container.querySelectorAll('.gh-calc-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = el.closest('.gh-row');
      const subjName = row?.dataset.subj;
      if (!subjName) return;
      openCalcForSubject(subjName);
    });
  });
  container.querySelectorAll('.gh-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.gh-grade') || e.target.closest('.gh-calc-btn')) return;
      const subjName = el.dataset.subj;
      if (subjName) showSubjectDetail(subjName);
    });
  });
}

function openCalcForSubject(subject) {
  const grades = window._gradeData || [];
  const filtered = grades.filter(g => getGradeSubject(g) === subject);
  const regulars = filtered.map(g => getGradeValue(g)).filter(isRegularGrade);
  const avg = regulars.length ? (regulars.reduce((a, b) => a + b, 0) / regulars.length) : 0;
  document.getElementById('calcCurrentAvg').textContent = avg ? avg.toFixed(2) : '–';
  document.getElementById('calcGradeCount').textContent = regulars.length;
  const hint = document.getElementById('calcSubjectHint');
  if (hint) { hint.textContent = 'Tantárgy: ' + subject; hint.style.display = 'block'; }
  window._calcFilteredGrades = filtered;
  showModal('calcOverlay');
  updateCalcResults();
}

function showSubjectDetail(subject) {
  const grades = window._gradeData || [];
  const filtered = grades.filter(g => getGradeSubject(g) === subject);
  if (!filtered.length) return;
  const regulars = filtered.map(g => getGradeValue(g)).filter(isRegularGrade);
  const avg = regulars.length ? (regulars.reduce((a, b) => a + b, 0) / regulars.length) : 0;
  const best = regulars.length ? Math.max(...regulars) : '–';
  const worst = regulars.length ? Math.min(...regulars) : '–';
  const sorted = [...filtered].sort((a, b) => {
    const da = getGradeDate(a);
    const db = getGradeDate(b);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
    return db - da;
  });
  const color = subjectColor(subject);
  document.getElementById('subjDetailTitle').textContent = subject;
  const classAvg = _classAverages[subject];
  let bodyHtml = `
    <div style="text-align:center;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:12px;">
      <span class="grade-value grade-${Math.round(avg) || 3}" style="width:48px;height:48px;font-size:20px;margin:0 auto;">${avg > 0 ? avg.toFixed(2) : '–'}</span>
      <div style="margin-top:8px;font-size:13px;color:var(--text-muted);">
        ⬆ ${best} &middot; ⬇ ${worst} &middot; ${regulars.length} db
        ${classAvg ? `&middot; Osztály: ${classAvg.toFixed(2)}` : ''}
      </div>
    </div>
    <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">`;
  for (const g of sorted) {
    const val = getGradeValue(g);
    const disp = gradeDisplay(val);
    const theme = getGradeTheme(g);
    const date = getGradeDate(g);
    const dateFormatted = fmtDate(date);
    bodyHtml += `<div class="grade-item" style="padding:8px 10px;">
      <div class="grade-value ${disp.cls}" style="width:28px;height:28px;font-size:11px;">${disp.text}</div>
      <div class="grade-info">
        <div class="grade-meta">${theme ? htmlEnc(theme) : ''}${theme && dateFormatted ? ' · ' : ''}${dateFormatted ? htmlEnc(dateFormatted) : ''}</div>
      </div>
    </div>`;
  }
  bodyHtml += `</div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
      <button id="subjCalcBtn" class="btn btn-outline btn-sm" style="width:100%;">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h3"/></svg>
        Számológép ehhez a tantárgyhoz
      </button>
    </div>`;
  document.getElementById('subjDetailBody').innerHTML = bodyHtml;
  showModal('subjDetailOverlay');
  document.getElementById('subjDetailClose').addEventListener('click', () => hideModal('subjDetailOverlay'));
  document.getElementById('subjDetailOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideModal('subjDetailOverlay'); });
  document.getElementById('subjCalcBtn').addEventListener('click', () => {
    hideModal('subjDetailOverlay');
    openCalcForSubject(subject);
  });
}

function showGradeDetail(g) {
  const val = getGradeValue(g);
  const disp = gradeDisplay(val);
  const subject = getGradeSubject(g);
  const date = getGradeDate(g);
  const dateFormatted = fmtDate(date);
  const type = getGradeType(g);
  const theme = getGradeTheme(g);
  const weight = getGradeWeight(g);
  const teacher = g.ErtekeloTanarNeve || g.TanarNeve || g.tanarNeve || g.kiertekelestAdoTanar || '';
  const createdAt = g.KeszitesDatuma || g.RogzitesDatuma || '';
  const overlay = document.getElementById('gradeDetailOverlay');
  const panel = document.getElementById('gradeDetailPanel');
  panel.innerHTML = `
    <div class="gd-header">
      <div class="grade-value ${disp.cls}" style="width:44px;height:44px;font-size:18px;">${disp.text}</div>
      <div>
        <div class="gd-subject">${htmlEnc(subject)}</div>
        ${dateFormatted ? `<div class="gd-date">${htmlEnc(dateFormatted)}</div>` : ''}
      </div>
      <button id="gdClose" class="btn btn-ghost btn-icon" style="margin-left:auto;">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      </button>
    </div>
    <div class="gd-body">
      ${type ? `<div class="gd-row"><span class="gd-label">Típus</span><span>${htmlEnc(type)}</span></div>` : ''}
      ${theme ? `<div class="gd-row"><span class="gd-label">Téma</span><span>${htmlEnc(theme)}</span></div>` : ''}
      ${teacher ? `<div class="gd-row"><span class="gd-label">Tanár</span><span>${htmlEnc(teacher)}</span></div>` : ''}
      ${weight ? `<div class="gd-row"><span class="gd-label">Súly</span><span>${htmlEnc(weight)}</span></div>` : ''}
      ${createdAt ? `<div class="gd-row"><span class="gd-label">Létrehozva</span><span>${htmlEnc(createdAt)}</span></div>` : ''}
    </div>
  `;
  showModal('gradeDetailOverlay');
  document.getElementById('gdClose').addEventListener('click', () => hideModal('gradeDetailOverlay'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideModal('gradeDetailOverlay'); });
}

// ============== STATS ==============

const GRADE_COLORS = { 5: '#10b981', 4: '#84cc16', 3: '#f59e0b', 2: '#f97316', 1: '#ef4444' };

async function loadStats() {
  const container = document.getElementById('statsContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) { container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>'; return; }
  try {
    showLoading(true);
    const data = await cachedCall('grades', userInfo.iss);
    const grades = Array.isArray(data) ? data : (data?.value || data?.items || data?.d || []);
    if (!grades.length) { container.innerHTML = '<div class="empty-state">Nincsenek jegyek</div>'; return; }
    if (!_gradeValueField) _gradeValueField = detectGradeValueField(grades);
    const regulars = grades.map(g => getGradeValue(g)).filter(isRegularGrade);
    const pcts = grades.filter(g => !isRegularGrade(getGradeValue(g)) && !isNaN(getGradeValue(g)));
    const avg = regulars.length ? (regulars.reduce((a, b) => a + b, 0) / regulars.length).toFixed(2) : '–';
    const best = regulars.length ? Math.max(...regulars) : '–';
    const worst = regulars.length ? Math.min(...regulars) : '–';
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const v of regulars) { if (dist[v] !== undefined) dist[v]++; }

    const subjMap = {};
    const monthMap = {};
    for (const g of grades) {
      const subj = getGradeSubject(g);
      const val = getGradeValue(g);
      if (!subjMap[subj]) subjMap[subj] = { all: [], regular: [] };
      subjMap[subj].all.push(val);
      if (isRegularGrade(val)) subjMap[subj].regular.push(val);
      const date = getGradeDate(g);
      if (date && isRegularGrade(val)) {
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(val);
      }
    }
    const subjStats = Object.keys(subjMap).sort().map(s => {
      const r = subjMap[s].regular;
      const a = r.length ? (r.reduce((a, b) => a + b, 0) / r.length) : 0;
      const b = r.length ? Math.max(...r) : 0;
      const w = r.length ? Math.min(...r) : 0;
      return { name: s, avg: a, best: b, worst: w, count: r.length, total: subjMap[s].all.length };
    }).filter(s => s.count > 0);
    const maxSubjAvg = Math.max(...subjStats.map(s => s.avg), 1);

    const months = Object.keys(monthMap).sort();
    const maxMonthCount = Math.max(...months.map(m => monthMap[m].length), 1);
    const monthAvgs = months.map(m => {
      const vals = monthMap[m];
      return { key: m, avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
    });

    const distMax = Math.max(...Object.values(dist), 1);
    const totalReg = regulars.length || 1;

    let html = '';

    // === TREND CALCULATIONS ===
    const sortedByDate = [...grades].filter(g => isRegularGrade(getGradeValue(g)) && getGradeDate(g)).sort((a, b) => getGradeDate(a) - getGradeDate(b));
    const recentCount = Math.max(5, Math.floor(sortedByDate.length * 0.25));
    const recentVals = sortedByDate.slice(-recentCount).map(g => getGradeValue(g));
    const olderVals = sortedByDate.slice(0, -recentCount).map(g => getGradeValue(g));
    const recentAvg = recentVals.length ? recentVals.reduce((a, b) => a + b, 0) / recentVals.length : 0;
    const olderAvg = olderVals.length ? olderVals.reduce((a, b) => a + b, 0) / olderVals.length : 0;
    const trendDiff = recentAvg - olderAvg;
    let trendIcon = '', trendText = '', trendColor = '';
    if (olderVals.length && recentVals.length) {
      if (trendDiff > 0.2) { trendIcon = '↑'; trendText = `${trendDiff.toFixed(2)} javulás`; trendColor = 'var(--success)'; }
      else if (trendDiff < -0.2) { trendIcon = '↓'; trendText = `${(-trendDiff).toFixed(2)} romlás`; trendColor = 'var(--danger)'; }
      else { trendIcon = '→'; trendText = 'stagnál'; trendColor = 'var(--text-dim)'; }
    }

    // Per-subject trend
    const subjTrendMap = {};
    for (const s of subjStats) {
      const subjGrades = grades.filter(g => getGradeSubject(g) === s.name && isRegularGrade(getGradeValue(g)) && getGradeDate(g))
        .sort((a, b) => getGradeDate(a) - getGradeDate(b));
      if (subjGrades.length >= 4) {
        const half = Math.floor(subjGrades.length / 2);
        const recent = subjGrades.slice(-half).map(g => getGradeValue(g));
        const older = subjGrades.slice(0, half).map(g => getGradeValue(g));
        const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const oAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = rAvg - oAvg;
        if (diff > 0.3) subjTrendMap[s.name] = '↑';
        else if (diff < -0.3) subjTrendMap[s.name] = '↓';
        else subjTrendMap[s.name] = '→';
      }
    }

    // Sparkline data (last 20 grades)
    const sparkVals = sortedByDate.slice(-20).map(g => getGradeValue(g));
    const sparkMin = Math.min(...sparkVals, 1);
    const sparkMax = Math.max(...sparkVals, 5);
    const sparkRange = Math.max(sparkMax - sparkMin, 1);

    // === TOP ROW: Overview + Donut ===
    html += `<div class="stats-grid">`;

    // Overview card
    const gradeWord = avg !== '–' ? (avg >= 4.5 ? 'Kiváló' : avg >= 3.5 ? 'Jó' : avg >= 2.5 ? 'Közepes' : avg >= 1.5 ? 'Elégséges' : 'Gyenge') : '';
    html += `<div class="card stats-card stats-overview">
      <h2>Áttekintés</h2>
      <div class="stats-big" style="color:${avg !== '–' ? GRADE_COLORS[Math.round(Number(avg))] || 'var(--primary)' : 'var(--text-muted)'};">${avg}</div>
      <div class="stats-label">${gradeWord ? `${gradeWord} (${regulars.length} érdemjegy)` : `${regulars.length} érdemjegy`}</div>
      <div class="stats-mini"><span>⬆ ${best}</span><span>⬇ ${worst}</span></div>
      <div class="stats-mini" style="margin-top:6px;"><span>Összes: ${grades.length}</span><span>Százalékos: ${pcts.length}</span></div>
      ${trendIcon ? `<div class="stats-trend" style="color:${trendColor};"><span class="stats-trend-icon">${trendIcon}</span>${trendText}</div>` : ''}
      ${sparkVals.length >= 3 ? `<div class="stats-spark-wrap"><svg class="stats-spark" viewBox="0 0 ${sparkVals.length * 10} 40" preserveAspectRatio="none">
        <path d="${sparkVals.map((v, i) => {
        const x = i * 10 + 5;
        const y = 40 - ((v - sparkMin) / sparkRange) * 36 - 2;
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      }).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-opacity="0.5"/>
        ${sparkVals.map((v, i) => {
        const x = i * 10 + 5;
        const y = 40 - ((v - sparkMin) / sparkRange) * 36 - 2;
        return `<circle cx="${x}" cy="${y}" r="2.5" fill="${GRADE_COLORS[Math.round(v)] || 'var(--primary)'}"/>`;
      }).join('')}
      </svg></div>` : ''}
    </div>`;

    // Donut + Distribution (conic-gradient)
    const donutColors = [];
    let curDeg = 0;
    for (let g = 5; g >= 1; g--) {
      if (dist[g] > 0) {
        const sliceDeg = (dist[g] / totalReg) * 360;
        donutColors.push(`${GRADE_COLORS[g]} ${curDeg}deg ${curDeg + sliceDeg}deg`);
        curDeg += sliceDeg;
      }
    }
    const conicStr = donutColors.join(', ');
    html += `<div class="card stats-card">
      <h2>Eloszlás</h2>
      <div class="stats-donut-wrap">
        <div class="stats-donut-cg" style="background: conic-gradient(${conicStr});">
          <div class="stats-donut-hole">
            <span class="stats-donut-num">${totalReg}</span>
            <span class="stats-donut-lbl">db</span>
          </div>
        </div>
        <div class="stats-donut-legend">`;
    const gradeNames = { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' };
    for (let g = 5; g >= 1; g--) {
      const pct = totalReg > 0 ? (dist[g] / totalReg * 100).toFixed(0) : 0;
      html += `<div class="dl-row"><span class="dl-dot" style="background:${GRADE_COLORS[g]};"></span><span>${gradeNames[g]}</span><span class="dl-count">${dist[g]}</span><span class="dl-pct">${pct}%</span></div>`;
    }
    html += `</div></div></div></div>`;

    // === DISTRIBUTION BAR (clickable) ===
    html += `<div class="card" style="margin-top:20px;">
      <h2 style="font-size:14px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Érdemjegyek</h2>
      <div class="dist-bar-wrap">`;
    for (let g = 5; g >= 1; g--) {
      if (dist[g] > 0) {
        const pct = totalReg > 0 ? (dist[g] / totalReg * 100) : 0;
        html += `<div class="dist-bar-seg" data-grade="${g}" style="flex:${dist[g]};background:${GRADE_COLORS[g]};min-width:${Math.max(pct * 0.8, 20)}px;" title="${g}: ${dist[g]} db (${pct.toFixed(0)}%)">
          <span class="dist-bar-label">${g}</span>
        </div>`;
      }
    }
    html += `</div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-dim);padding:0 4px;">
      <span>${regulars.length} érdemjegy</span>
      <span>⬆ ${best} ⬇ ${worst}</span>
    </div>
    </div>`;

    // === MONTHLY TREND (SVG chart with reference lines + trendline) ===
    if (monthAvgs.length > 1) {
      const slotW = Math.max(32, Math.min(56, Math.max(100, Math.min(500, months.length * 50)) / months.length));
      const svgW = Math.max(slotW * months.length + 8, 100);
      const barAreaH = 100;
      const topPad = 16;
      const botPad = 34;
      const chartH = topPad + barAreaH + botPad;
      const barW = Math.max(6, Math.min(20, slotW * 0.4));

      let ms = `<svg viewBox="0 0 ${svgW} ${chartH}" class="mt-svg">`;

      for (let g = 2; g <= 5; g++) {
        const ry = topPad + barAreaH - (g / 5) * barAreaH;
        ms += `<line x1="0" y1="${ry}" x2="${svgW}" y2="${ry}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
        ms += `<text x="${svgW - 4}" y="${ry + 3}" text-anchor="end" fill="var(--text-dim)" font-size="7">${g}</text>`;
      }

      for (let i = 0; i < months.length; i++) {
        const cx = slotW / 2 + i * slotW;
        const avg = monthAvgs[i].avg;
        const bh = (avg / 5) * barAreaH;
        const by = topPad + barAreaH - bh;
        const color = GRADE_COLORS[Math.round(avg)] || 'var(--primary)';

        ms += `<rect x="${cx - barW / 2}" y="${by}" width="${barW}" height="${Math.max(bh, 2)}" rx="2" fill="${color}" opacity="0.85"/>`;
        ms += `<text x="${cx}" y="${topPad + barAreaH + 12}" text-anchor="middle" fill="var(--text-dim)" font-size="8">${monthAvgs[i].key.slice(5) + '.' + monthAvgs[i].key.slice(2, 4)}</text>`;
        ms += `<text x="${cx}" y="${topPad + barAreaH + 24}" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-weight="600">${avg.toFixed(1)}</text>`;
        ms += `<text x="${cx}" y="${topPad + barAreaH + 33}" text-anchor="middle" fill="var(--text-dim)" font-size="7">${monthAvgs[i].count}db</text>`;
      }

      // Trendline connecting bar tops
      if (months.length > 2) {
        const points = months.map((m, i) => {
          const cx = slotW / 2 + i * slotW;
          const bh = (monthAvgs[i].avg / 5) * barAreaH;
          const by = topPad + barAreaH - bh;
          return `${cx},${by.toFixed(1)}`;
        }).join(' ');
        ms += `<polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-opacity="0.6" stroke-dasharray="4,3"/>`;
        for (let i = 0; i < months.length; i++) {
          const cx = slotW / 2 + i * slotW;
          const bh = (monthAvgs[i].avg / 5) * barAreaH;
          const by = topPad + barAreaH - bh;
          ms += `<circle cx="${cx}" cy="${by.toFixed(1)}" r="2.5" fill="var(--primary)" stroke="var(--card)" stroke-width="1.5" opacity="0.7"/>`;
        }
      }

      ms += `</svg>`;

      html += `<div class="card" style="margin-top:20px;">
        <h2 style="font-size:14px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">Havi átlag</h2>
        <div class="mt-chart-wrap">${ms}</div>
      </div>`;
    }

    // === SUBJECT AVERAGES ===
    html += `<div class="card" style="margin-top:20px;">
      <h2 style="font-size:14px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;">Tantárgyak</h2>
      <div class="stats-subjects">`;
    for (const s of subjStats) {
      const color = subjectColor(s.name);
      const barPct = (s.avg / maxSubjAvg) * 100;
      const trend = subjTrendMap[s.name] || '';
      const trendCls = trend === '↑' ? 'trend-up' : trend === '↓' ? 'trend-down' : trend === '→' ? 'trend-flat' : '';
      html += `<div class="ss-row">
        <div class="ss-name" style="border-left:3px solid ${color};padding-left:10px;">${htmlEnc(s.name)}</div>
        <div class="ss-bar-wrap"><div class="ss-bar" style="width:${barPct}%;background:${GRADE_COLORS[Math.round(s.avg)] || 'var(--primary)'};"></div></div>
        <div class="ss-avg">${s.avg.toFixed(2)}</div>
        <div class="ss-detail">⬆${s.best} ⬇${s.worst}</div>
        ${trend ? `<div class="ss-trend ${trendCls}">${trend}</div>` : ''}
        <div class="ss-count">${s.count}</div>
      </div>`;
    }
    html += `</div></div>`;

    container.innerHTML = html;
    container.querySelectorAll('.dist-bar-seg').forEach(el => {
      el.addEventListener('click', () => {
        const grade = el.dataset.grade;
        showToast(`${grade}-es jegy: ${dist[grade] || 0} db (${totalReg > 0 ? ((dist[grade] || 0) / totalReg * 100).toFixed(0) : 0}%)`);
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}

// ============== INFO ==============

async function loadInfo() {
  const container = document.getElementById('infoContainer');
  container.innerHTML = '<div class="empty-state">Töltés...</div>';
  if (!userInfo.iss) {
    container.innerHTML = '<div class="empty-state">Nincs intézményi kód</div>';
    return;
  }
  try {
    showLoading(true);
    const data = await cachedCall('student', userInfo.iss);
    const info = data || {};
    const rawPreview = JSON.stringify(info).slice(0, 2000);
    const hasKnownFields = info.Nev || info.tanuloNeve || info.name || info.nev || info.Osztaly || info.osztaly || info.class || info.Uid;
    if (!hasKnownFields) {
      container.innerHTML = `<div class="card info-card"><h2>API válasz (ismeretlen formátum)</h2><pre style="font-size:11px;color:var(--text-muted);white-space:pre-wrap;word-break:break-word;background:var(--surface);padding:12px;border-radius:6px;">${htmlEnc(rawPreview)}</pre></div>`;
      return;
    }
    const studentName = info.Nev || info.tanuloNeve || info.name || info.nev || info.teljesNev || userInfo.name || '–';
    const className = info.Osztaly || info.osztaly || info.class || info.className || info.osztalyNeve || '–';
    const school = info.IntezmenyNev || info.iskolaNeve || info.school || info.intezmeny || info.intezmenyNeve || '–';
    const birthDate = info.SzuletesiDatum || info.szuletesiDatum || info.birthDate || info.szuletesIdeje || '';
    const birthPlace = info.SzuletesiHely || info.szuletesiHely || info.birthPlace || '';
    const motherName = info.AnyjaNeve || info.anyaNeve || info.motherName || info.anyjaNeve || '';
    const address = Array.isArray(info.Cimek) ? info.Cimek[0] : (info.Cimek || info.lakcim || info.address || info.allandoLakcim || '');
    const neptun = info.NeptunKod || info.neptunKod || info.neptun || '';
    const om = info.OmAzonosito || info.omAzonosito || info.om || '';
    const email = info.EmailCim || info.email || info.eMail || '';
    const phone = info.Telefonszam || info.telefonszam || info.phone || '';
    const studentId = info.Uid || info.tanuloAzonosito || info.studentId || '';
    document.getElementById('userAvatar').textContent = (studentName !== '–' ? studentName[0] : 'S').toUpperCase();
    document.getElementById('userName').textContent = studentName;
    document.getElementById('userClass').textContent = className;
    container.innerHTML = `
      <div class="card info-card">
        <h2>Személyes adatok</h2>
        <table class="info-table">
          <tr><th>Név</th><td>${htmlEnc(studentName)}</td></tr>
          ${birthDate ? `<tr><th>Születési dátum</th><td>${htmlEnc(birthDate)}</td></tr>` : ''}
          ${birthPlace ? `<tr><th>Születési hely</th><td>${htmlEnc(birthPlace)}</td></tr>` : ''}
          ${motherName ? `<tr><th>Anyja neve</th><td>${htmlEnc(motherName)}</td></tr>` : ''}
          ${studentId ? `<tr><th>Tanuló azonosító</th><td>${htmlEnc(studentId)}</td></tr>` : ''}
        </table>
      </div>
      <div class="card info-card half">
        <h2>Iskola</h2>
        <table class="info-table">
          ${school ? `<tr><th>Intézmény</th><td>${htmlEnc(school)}</td></tr>` : ''}
          <tr><th>Osztály</th><td>${htmlEnc(className)}</td></tr>
          ${neptun ? `<tr><th>Neptun kód</th><td>${htmlEnc(neptun)}</td></tr>` : ''}
          ${om ? `<tr><th>OM azonosító</th><td>${htmlEnc(om)}</td></tr>` : ''}
        </table>
      </div>
      <div class="card info-card half">
        <h2>Elérhetőség</h2>
        <table class="info-table">
          ${email ? `<tr><th>Email</th><td>${htmlEnc(email)}</td></tr>` : ''}
          ${phone ? `<tr><th>Telefon</th><td>${htmlEnc(phone)}</td></tr>` : ''}
          ${address ? `<tr><th>Lakcím</th><td>${htmlEnc(address)}</td></tr>` : ''}
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Hiba: ${htmlEnc(e.message)}</div>`;
  } finally {
    showLoading(false);
  }
}



// ============== START ==============
init().catch(e => {
  console.error('Init error:', e);
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;color:var(--text-muted);font-size:14px;">
    <span style="font-size:40px;">⚠️</span>
    <div>Nem sikerült elindítani az alkalmazást</div>
    <div style="font-size:12px;color:var(--text-dim);">${e.message}</div>
  </div>`;
});
