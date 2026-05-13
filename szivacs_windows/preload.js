const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('szivacs', {
  login: () => ipcRenderer.invoke('login:start'),
  refreshToken: () => ipcRenderer.invoke('tokens:refresh'),
  callAPI: (url, method) => ipcRenderer.invoke('api:call', { url, method }),
  callEndpoint: (name, iss, params) => ipcRenderer.invoke('api:endpoint', { name, iss, params }),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  loadDashboard: () => ipcRenderer.invoke('app:dashboard'),
  loadLogin: () => ipcRenderer.invoke('app:login'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => {
    ipcRenderer.on('update:status', (_, status) => cb(status));
    ipcRenderer.on('update:available', (_, data) => cb('available', data));
    ipcRenderer.on('update:not-available', () => cb('not-available'));
    ipcRenderer.on('update:error', (_, data) => cb('error', data));
    ipcRenderer.on('update:progress', (_, data) => cb('progress', data));
    ipcRenderer.on('update:downloaded', () => cb('downloaded'));
  },
  // Multi-account
  getAccounts: () => ipcRenderer.invoke('accounts:list'),
  switchAccount: (institute_code) => ipcRenderer.invoke('accounts:switch', { institute_code }),
  addAccount: () => ipcRenderer.invoke('accounts:add'),
  removeAccount: (institute_code) => ipcRenderer.invoke('accounts:remove', { institute_code }),
});
