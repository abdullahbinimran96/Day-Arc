// Preload bridge between Renderer and Main Process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dayarc', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, val) => ipcRenderer.invoke('set-setting', key, val),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // Namaz
  getNamazTimes: (date, lat, lng, gmtOffset) => ipcRenderer.invoke('get-namaz-times', date, lat, lng, gmtOffset),
  getNamazSettings: () => ipcRenderer.invoke('get-namaz-settings'),
  updateNamazSetting: (prayer, duration, isEnabled, overrideTime, afterAzaan) => 
    ipcRenderer.invoke('update-namaz-setting', prayer, duration, isEnabled, overrideTime, afterAzaan),

  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  saveTask: (task) => ipcRenderer.invoke('save-task', task),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  saveBookmark: (bm) => ipcRenderer.invoke('save-bookmark', bm),
  deleteBookmark: (id) => ipcRenderer.invoke('delete-bookmark', id),

  // Sounds
  getSounds: () => ipcRenderer.invoke('get-sounds'),
  saveSound: (sound) => ipcRenderer.invoke('save-sound', sound),
  deleteSound: (id) => ipcRenderer.invoke('delete-sound', id),

  // Private Tab & Blocklist
  getPrivateBlocklist: () => ipcRenderer.invoke('get-private-blocklist'),
  addBlockedDomain: (domain) => ipcRenderer.invoke('add-blocked-domain', domain),
  removeBlockedDomain: (id) => ipcRenderer.invoke('remove-blocked-domain', id),
  checkAdultDomain: (domain) => ipcRenderer.invoke('check-adult-domain', domain),

  // Browser Integration
  getBrowsers: () => ipcRenderer.invoke('get-browsers'),
  launchBrowserUrl: (browserId, profileId, urls) => ipcRenderer.invoke('launch-browser-url', browserId, profileId, urls),

  // Focus Session & Extension Control
  startFocusSession: (sessionData) => ipcRenderer.invoke('start-focus-session', sessionData),
  stopFocusSession: () => ipcRenderer.invoke('stop-focus-session'),
  recordFocusSession: (session) => ipcRenderer.invoke('record-focus-session', session),
  getStatsToday: () => ipcRenderer.invoke('get-stats-today'),

  // Event Listeners from Main / Extension / Overlay
  onViolation: (callback) => ipcRenderer.on('on-url-violation', (event, data) => callback(data)),
  onSecurityBlocked: (callback) => ipcRenderer.on('on-security-blocked', (event, data) => callback(data)),
  onStartOverlay: (callback) => ipcRenderer.on('start-overlay', (event, session) => callback(session)),
  onStopOverlay: (callback) => ipcRenderer.on('stop-overlay', (event) => callback()),
  onSessionStartedBackground: (callback) => ipcRenderer.on('session-started-background', (event, data) => callback(data)),
  onSessionStopped: (callback) => ipcRenderer.on('session-stopped', (event) => callback()),
  onAppWindowRelock: (callback) => ipcRenderer.on('app-window-relock', () => callback()),

  // Window Controls & Extensions
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setTaskbarPreview: (title, tooltip) => ipcRenderer.invoke('set-taskbar-preview', title, tooltip),
  updateTaskbarCountdown: (data) => ipcRenderer.invoke('update-taskbar-countdown', data),
  onUpdateTaskbarWidget: (callback) => ipcRenderer.on('update-taskbar-widget-data', (event, data) => callback(data)),
  installBrowserExtensions: () => ipcRenderer.invoke('install-browser-extensions'),
  resetAllData: () => ipcRenderer.invoke('reset-all-data')
});
