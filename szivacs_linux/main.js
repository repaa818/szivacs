const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const CLIENT_ID = 'kreta-ellenorzo-student-mobile-android';
const REDIRECT_URI = 'https://mobil.e-kreta.hu/ellenorzo-student/prod/oauthredirect';
const TOKEN_URL = 'https://idp.e-kreta.hu/connect/token';
const AUTH_URL = 'https://idp.e-kreta.hu/connect/authorize';
const API_KEY = '21ff6c25-d1da-4a68-a811-c881a6057463';
const SCOPES = 'openid email offline_access kreta-ellenorzo-webapi.public kreta-eugyintezes-webapi.public kreta-fileservice-webapi.public kreta-mobile-global-webapi.public kreta-dkt-webapi.public kreta-ier-webapi.public';

const ENDPOINTS = {
  student:   (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/TanuloAdatlap`,
  grades:    (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/Ertekelesek`,
  timetable: (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/OrarendElemek`,
  absences:  (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/Mulasztasok`,
  events:    (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/Bejegyzesek`,
  homework:  (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/HaziFeladatok`,
  classAverages: (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/OsztalyCsoportTantargyAtlagok`,
  noticeBoard:  (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/UzenoTabla`,
  infoBoard:    (iss) => `https://${iss}.e-kreta.hu/ellenorzo/v3/sajat/InformaciosTablak`,
};

let mainWindow = null;
let TOKENS_FILE = null;
let _refreshPromise = null;

// Multi-account storage
let accountsMap = {};       // { institute_code: { access_token, refresh_token, expires_at, institute_code, display_name, student_id, scope } }
let activeInstituteCode = null;
let tokenStore = {};        // active account's tokens (synced with accountsMap)

function syncTokenStoreToActive() {
  if (activeInstituteCode && accountsMap[activeInstituteCode]) {
    Object.assign(accountsMap[activeInstituteCode], tokenStore);
  }
}

function syncActiveToTokenStore() {
  if (activeInstituteCode && accountsMap[activeInstituteCode]) {
    tokenStore = accountsMap[activeInstituteCode];
  } else {
    tokenStore = {};
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  mainWindow?.webContents.send('update:status', 'checking');
});
autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update:available', { version: info.version });
});
autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update:status', 'not-available');
});
autoUpdater.on('error', (err) => {
  mainWindow?.webContents.send('update:error', { message: err.message });
});
autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update:progress', { percent: Math.round(progress.percent) });
});
autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update:downloaded');
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function initTokenStorage() {
  const dir = app.getPath('userData');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  TOKENS_FILE = path.join(dir, 'szivacs-tokens.json');
}

function saveTokens() {
  if (!TOKENS_FILE) return;
  syncTokenStoreToActive();
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({
      accounts: accountsMap,
      active: activeInstituteCode,
    }));
  } catch (e) { console.error('saveTokens failed:', e.message); }
}

function loadTokens() {
  if (!TOKENS_FILE) return false;
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
      // Migration: old format — tokens at the top level
      if (data.access_token && data.refresh_token && !data.accounts) {
        const iss = data.institute_code || 'default';
        accountsMap = {};
        accountsMap[iss] = { ...data };
        activeInstituteCode = iss;
        syncActiveToTokenStore();
        saveTokens();
        console.log('Migrated old token format to multi-account');
        return true;
      }
      accountsMap = data.accounts || {};
      activeInstituteCode = data.active || null;
      syncActiveToTokenStore();
      return !!tokenStore.refresh_token;
    }
  } catch (e) { console.error('loadTokens failed:', e.message); }
  return false;
}

function clearTokens() {
  if (activeInstituteCode && accountsMap[activeInstituteCode]) {
    delete accountsMap[activeInstituteCode];
  }
  const remaining = Object.keys(accountsMap);
  if (remaining.length > 0) {
    activeInstituteCode = remaining[0];
    syncActiveToTokenStore();
  } else {
    tokenStore = {};
    activeInstituteCode = null;
  }
  saveTokens();
}

function base64url(buf) {
  return buf.toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

function generateVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateState() {
  return base64url(crypto.randomBytes(16));
}

function computeChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64urlDecode(parts[1]));
  } catch { return null; }
}

async function createWindow() {
  const iconPath = path.join(__dirname, 'szivacs_small.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Szivacs',
    backgroundColor: '#0c0c1a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  let startPage = 'login.html';
  if (tokenStore.refresh_token) {
    try {
      await refreshTokens();
      startPage = 'dashboard.html';
    } catch {
      console.log('Token refresh failed, clearing session');
      clearTokens();
    }
  } else if (tokenStore.access_token && !tokenStore.refresh_token) {
    console.log('Has access token but no refresh token, clearing');
    clearTokens();
  }
  console.log('Starting with:', startPage);
  mainWindow.loadFile(path.join(__dirname, 'renderer', startPage));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
  });
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    code, code_verifier: verifier, redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID, grant_type: 'authorization_code',
  });

  const resp = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Token exchange failed (${resp.status}): ${await resp.text()}`);

  const tokens = await resp.json();
  const idPayload = decodeJWT(tokens.id_token);
  console.log('ID token payload:', JSON.stringify(idPayload, null, 2));
  tokens.institute_code = idPayload?.['kreta:institute_code'] || '';
  tokens.display_name = idPayload?.name || idPayload?.['kreta:user_name'] || '';
  tokens.student_id = idPayload?.sub || '';
  tokens.expires_at = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600);
  console.log('Token store after exchange:', JSON.stringify({institute_code: tokens.institute_code, display_name: tokens.display_name}, null, 2));
  // Save to multi-account store
  const iss = tokens.institute_code || 'default_' + Date.now();
  tokenStore = tokens;
  activeInstituteCode = iss;
  accountsMap[iss] = { ...tokens };
  saveTokens();
  return tokens;
}

async function refreshTokens() {
  if (!tokenStore.refresh_token) throw new Error('Nincs refresh token');
  if (!tokenStore.institute_code) throw new Error('Nincs intézményi kód');

  if (_refreshPromise) return _refreshPromise;

  const doRefresh = async () => {
    const body = new URLSearchParams({
      institute_code: tokenStore.institute_code,
      refresh_token: tokenStore.refresh_token,
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
    });

    const resp = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    });

    if (!resp.ok) throw new Error(`Token refresh failed (${resp.status}): ${await resp.text()}`);

    const tokens = await resp.json();
    tokenStore = { ...tokenStore, ...tokens, expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600) };
    syncTokenStoreToActive();
    saveTokens();
    return tokenStore;
  };

  _refreshPromise = doRefresh();
  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

async function callAPI(url, method = 'GET') {
  const isExpired = tokenStore.expires_at && (Date.now() / 1000) > tokenStore.expires_at - 60;
  if (isExpired && tokenStore.refresh_token) {
    await refreshTokens();
  }

  const resp = await fetchWithTimeout(url, {
    method,
    headers: {
      'Authorization': `Bearer ${tokenStore.access_token}`,
      'apiKey': API_KEY,
      'Accept': '*/*',
      'User-Agent': 'Szivacs/1.0',
    },
  });

  if (resp.status === 401 && tokenStore.refresh_token) {
    await refreshTokens();
    const retryResp = await fetchWithTimeout(url, {
      method,
      headers: {
        'Authorization': `Bearer ${tokenStore.access_token}`,
        'apiKey': API_KEY,
        'Accept': '*/*',
        'User-Agent': 'Szivacs/1.0',
      },
    });
    if (!retryResp.ok) throw new Error(`API error (${retryResp.status}): ${await retryResp.text()}`);
    const ct = retryResp.headers.get('content-type') || '';
    return ct.includes('json') ? await retryResp.json() : await retryResp.text();
  }

  if (!resp.ok) throw new Error(`API error (${resp.status}): ${await resp.text()}`);
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('json') ? await resp.json() : await resp.text();
}

async function performLogin() {
  const verifier = generateVerifier();
  const state = generateState();
  const challenge = computeChallenge(verifier);

  const params = new URLSearchParams({
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: SCOPES,
    state, nonce: state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'login',
  });

  const loginUrl = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 600, height: 750,
      title: 'Kreta bejelentkezés',
      backgroundColor: '#fff',
      icon: path.join(__dirname, 'szivacs_small.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    let handled = false;

    authWindow.webContents.on('did-navigate', (event, url) => {
      if (handled) return;
      console.log('Auth navigate:', url);
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        if (error) {
          handled = true;
          authWindow.close();
          reject(new Error(`Login error: ${error}`));
          return;
        }
        if (code) {
          handled = true;
          authWindow.close();
          exchangeCode(code, verifier).then(resolve).catch(reject);
        }
      } catch (e) {}
    });

    authWindow.loadURL(loginUrl);
    authWindow.on('closed', () => { if (!handled) reject(new Error('A bejelentkezési ablak bezárult')); });
  });
}

ipcMain.handle('login:start', async () => {
  syncTokenStoreToActive();
  await performLogin();
  return { ok: true };
});

ipcMain.handle('tokens:refresh', async () => refreshTokens());

ipcMain.handle('api:call', async (_, { url, method }) => callAPI(url, method || 'GET'));

ipcMain.handle('api:endpoint', async (_, { name, iss, params }) => {
  const fn = ENDPOINTS[name];
  if (!fn) throw new Error(`Ismeretlen endpoint: ${name}`);
  let url = fn(iss);
  if (params) {
    const q = new URLSearchParams(params);
    url += (url.includes('?') ? '&' : '?') + q.toString();
  }
  console.log(`API call: ${name} -> ${url}`);
  try {
    const result = await callAPI(url);
    console.log(`API success: ${name}`);
    return result;
  } catch (e) {
    console.error(`API error: ${name} - ${e.message}`);
    throw e;
  }
});

ipcMain.handle('auth:status', () => ({
  isLoggedIn: !!tokenStore.access_token,
  display_name: tokenStore.display_name || null,
  institute_code: tokenStore.institute_code || null,
  expires_at: tokenStore.expires_at || null,
  hasMultipleAccounts: Object.keys(accountsMap).length > 1,
}));

ipcMain.handle('auth:logout', () => {
  clearTokens();
  const remaining = Object.keys(accountsMap);
  if (remaining.length === 0) {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));
  }
});

// ============== MULTI-ACCOUNT ==============

ipcMain.handle('accounts:list', () => {
  const list = Object.entries(accountsMap).map(([code, acc]) => ({
    institute_code: code,
    display_name: acc.display_name || 'Ismeretlen',
    student_id: acc.student_id || '',
  }));
  return { accounts: list, active: activeInstituteCode };
});

ipcMain.handle('accounts:switch', async (_, { institute_code }) => {
  if (!accountsMap[institute_code]) throw new Error('Account not found');
  syncTokenStoreToActive();
  activeInstituteCode = institute_code;
  syncActiveToTokenStore();
  saveTokens();
  // Reload dashboard with new account
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));
  return { ok: true };
});

ipcMain.handle('accounts:add', async () => {
  syncTokenStoreToActive();
  const tokens = await performLogin();
  // exchangeCode already saved to accountsMap
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));
  return { ok: true };
});

ipcMain.handle('accounts:remove', async (_, { institute_code }) => {
  if (!accountsMap[institute_code]) throw new Error('Account not found');
  delete accountsMap[institute_code];
  if (activeInstituteCode === institute_code) {
    const remaining = Object.keys(accountsMap);
    if (remaining.length > 0) {
      activeInstituteCode = remaining[0];
      syncActiveToTokenStore();
    } else {
      tokenStore = {};
      activeInstituteCode = null;
    }
  }
  saveTokens();
  return { ok: true };
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('update:check', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('update:download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('update:install', () => {
  setImmediate(() => autoUpdater.quitAndInstall());
});

ipcMain.handle('app:dashboard', () => {
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));
});

ipcMain.handle('app:login', () => {
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const img = nativeImage.createFromPath(path.join(__dirname, 'szivacs_small.png'));
    if (!img.isEmpty()) app.dock.setIcon(img);
  }
  Menu.setApplicationMenu(null);
  initTokenStorage();
  const restored = loadTokens();
  console.log('Token restore:', restored ? 'session restored' : 'no saved session');
  createWindow().then(() => {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
