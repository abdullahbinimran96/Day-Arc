const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dbManager = require('./src/db/database');
const namazCalc = require('./src/services/namaz-calculator');
const stevenBlack = require('./src/services/stevenblack-blocklist');
const browserProfiles = require('./src/services/browser-profiles');

app.whenReady().then(async () => {
  await dbManager.init();
  stevenBlack.load();

  // Register IPC Handlers
  ipcMain.handle('get-settings', () => dbManager.getAllSettings());
  ipcMain.handle('set-setting', (_, key, val) => dbManager.setSetting(key, val));
  ipcMain.handle('get-namaz-settings', () => dbManager.getNamazSettings());
  ipcMain.handle('update-namaz-setting', (_, name, dur, enabled, override, afterAzaan) => 
    dbManager.updateNamazSetting(name, dur, enabled, override, afterAzaan));
  ipcMain.handle('get-namaz-times', (_, dateStr, lat, lng, gmt) => 
    namazCalc.calculate(new Date(dateStr), parseFloat(lat), parseFloat(lng), parseFloat(gmt)));
  ipcMain.handle('get-tasks', () => dbManager.getTasks());
  ipcMain.handle('save-task', (_, task) => dbManager.saveTask(task));
  ipcMain.handle('delete-task', (_, id) => dbManager.deleteTask(id));
  ipcMain.handle('get-bookmarks', () => dbManager.getBookmarks());
  ipcMain.handle('save-bookmark', (_, bm) => dbManager.saveBookmark(bm));
  ipcMain.handle('delete-bookmark', (_, id) => dbManager.deleteBookmark(id));
  ipcMain.handle('get-sounds', () => dbManager.getSounds());
  ipcMain.handle('save-sound', (_, sound) => dbManager.saveSound(sound));
  ipcMain.handle('delete-sound', (_, id) => dbManager.deleteSound(id));
  ipcMain.handle('get-private-blocklist', () => dbManager.getPrivateBlocklist());
  ipcMain.handle('add-blocked-domain', (_, d) => dbManager.addPrivateBlockedDomain(d));
  ipcMain.handle('remove-blocked-domain', (_, id) => dbManager.removePrivateBlockedDomain(id));
  ipcMain.handle('get-stats-today', () => dbManager.getStatsToday());
  ipcMain.handle('record-focus-session', (_, s) => dbManager.recordFocusSession(s));
  ipcMain.handle('get-browsers', () => browserProfiles.detectBrowsers());
  ipcMain.handle('start-focus-session', () => ({ success: true }));
  ipcMain.handle('stop-focus-session', () => ({ success: true }));
  ipcMain.handle('launch-browser-url', () => true);
  ipcMain.handle('set-auto-start', () => true);

  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    show: true, // Show window so it paints properly
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
  await new Promise(r => setTimeout(r, 1500));

  const panels = ['dashboard', 'namaz', 'tasks', 'bookmarks', 'private-tab', 'sounds', 'settings'];
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

  for (const p of panels) {
    await win.webContents.executeJavaScript(`
      window.switchPanel("${p}");
    `);
    // Wait for repaint
    await new Promise(r => setTimeout(r, 800));

    const image = await win.webContents.capturePage();
    const filePath = path.join(screenshotsDir, `panel-${p}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`📸 Captured screenshot of panel: ${p}`);
  }

  console.log('✅ ALL SCREENSHOTS REFRESHED!');
  app.quit();
});
