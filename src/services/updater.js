// Day Arc Auto-Update Service
// Handles GitHub Releases check, background download, progress tracking, and silent/manual installation

const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');

class UpdateService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isManualCheck = false;
    this.updateInfo = null;

    this.configureUpdater();
    this.registerEvents();
    this.registerIpc();
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  configureUpdater() {
    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Allow pre-releases if needed, default false for production stability
    autoUpdater.allowPrerelease = false;
  }

  registerEvents() {
    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for Day Arc updates...');
      this.sendToRenderer('updater-status', {
        status: 'checking',
        isManual: this.isManualCheck
      });
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] New version available:', info.version);
      this.updateInfo = info;
      this.sendToRenderer('updater-status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        isManual: this.isManualCheck
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[Updater] Day Arc is up-to-date.');
      this.sendToRenderer('updater-status', {
        status: 'not-available',
        version: info ? info.version : app.getVersion(),
        isManual: this.isManualCheck
      });
      this.isManualCheck = false;
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent || 0);
      console.log(`[Updater] Downloading update: ${percent}% (${Math.round((progressObj.bytesPerSecond || 0) / 1024)} KB/s)`);
      this.sendToRenderer('updater-status', {
        status: 'downloading',
        percent: percent,
        bytesPerSecond: progressObj.bytesPerSecond || 0,
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Update package downloaded successfully:', info.version);
      this.sendToRenderer('updater-status', {
        status: 'downloaded',
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      const msg = err ? (err.message || String(err)) : 'Unknown update error';
      console.warn('[Updater] Auto-updater warning/error:', msg);
      this.sendToRenderer('updater-status', {
        status: 'error',
        message: msg,
        isManual: this.isManualCheck
      });
      this.isManualCheck = false;
    });
  }

  registerIpc() {
    ipcMain.handle('check-for-updates', async () => {
      this.isManualCheck = true;
      console.log('[Updater] Manual update check requested by user.');
      try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, result: result ? result.updateInfo : null };
      } catch (err) {
        console.warn('[Updater] Manual check error:', err.message);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('quit-and-install-update', () => {
      console.log('[Updater] Quit and install initiated by user.');
      try {
        // isSilent: false (shows standard progress), isForceRunAfter: true (restarts Day Arc automatically)
        autoUpdater.quitAndInstall(false, true);
      } catch (err) {
        console.error('[Updater] Failed to quit and install update:', err.message);
      }
    });
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send(channel, data);
      } catch (e) {
        console.warn('[Updater] Error sending update status to renderer:', e.message);
      }
    }
  }

  startAutomaticCheck() {
    // Check for updates 6 seconds after application startup
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdates().catch((err) => {
          console.log('[Updater] Background check caught harmlessly:', err.message);
        });
      } catch (e) {
        console.log('[Updater] Background check caught harmlessly:', e.message);
      }
    }, 6000);
  }
}

module.exports = UpdateService;
