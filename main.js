// Day Arc Main Process
// Manages App Lifecycle, System Tray, Workarea Desktop Blur Window & Startup Automation

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, powerMonitor, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Set Application Name and Windows User Model ID for clean Taskbar/Start Menu integration
app.setName('Day Arc');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.dayarc.app');
}

// Enable audio autoplay without user interaction for reliable Azaan and task sounds
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const dbManager = require('./src/db/database');
const namazCalc = require('./src/services/namaz-calculator');
const browserProfiles = require('./src/services/browser-profiles');
const stevenBlack = require('./src/services/stevenblack-blocklist');
const extensionServer = require('./src/server/extension-server');
const bundledSounds = require('./src/services/bundled-sounds');
const autoStartManager = require('./src/services/autostart');
const browserInstaller = require('./src/services/browser-installer');
const uninstaller = require('./src/services/uninstaller');
const UpdateService = require('./src/services/updater');

// CLI handlers for uninstallation and full data reset
if (process.argv.includes('--uninstall') || process.argv.includes('--cleanup')) {
  console.log('[CLI] Running Day Arc uninstaller...');
  uninstaller.uninstallAll({ removeProjectDb: true });
  process.exit(0);
}

let mainWindow = null;
let blurOverlayWindow = null;
let tray = null;
let isQuitting = false;
let activeSessionWatchdog = null;
let currentActiveSession = null;
let taskbarWidgetWindow = null;
let widgetHideTimeout = null;
let updateService = null;

process.on('uncaughtException', (err) => {
  console.error('[Main Process Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Main Process Rejection]:', reason);
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-window-relock');
      }
    }
  });
}

async function createWindow() {
  await dbManager.init();
  stevenBlack.load();

  // Scan and register bundled sounds from resources/ directory
  bundledSounds.scanAndRegister(dbManager);

  // Auto-install and register Day Arc Extension across all Chromium-based browsers (Chrome, Edge, Brave, etc.)
  try {
    browserInstaller.installAll();
  } catch (e) {
    console.warn('[Extension Auto-Install Error]:', e);
  }

  // Sync auto-start registry and startup shortcut
  const autoStartEnabled = dbManager.getSetting('auto_start') !== '0';
  autoStartManager.sync(autoStartEnabled);

  const icoPath = path.join(__dirname, 'build', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  const iconPath = (process.platform === 'win32' && fs.existsSync(icoPath)) ? icoPath : pngPath;
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1080,
    minHeight: 700,
    title: 'Day Arc',
    backgroundColor: '#11121B',
    icon: appIcon,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  mainWindow.loadFile('index.html');

  // Open external links safely in the default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle close to tray (Always On / Run in background mode)
  mainWindow.on('close', (event) => {
    const runInBackground = dbManager.getSetting('run_in_background') !== '0';
    if (!isQuitting && runInBackground) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-window-relock');
      }
      mainWindow.hide();
    }
  });

  mainWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-window-relock');
    }
  });

  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-window-relock');
    }
  });

  createTray(appIcon);
  createBlurOverlayWindow();
  createTaskbarWidgetWindow();
  setupExtensionServer();
  startBackgroundCountdownService();

  // Initialize Auto-Updater Service
  try {
    updateService = new UpdateService(mainWindow);
    updateService.startAutomaticCheck();
  } catch (e) {
    console.warn('[Auto-Updater Init Warning]:', e.message);
  }

  // Listen for system sleep and wake events to guarantee scheduler continuous execution
  try {
    powerMonitor.on('resume', () => {
      console.log('[POWER] System resumed from sleep. Resynchronizing background scheduler...');
      startBackgroundCountdownService();
      checkBackgroundScheduler(getBackgroundTargetNow());
    });
  } catch (e) {
    console.warn('[POWER] PowerMonitor setup warning:', e);
  }

  // Restore active focus session if app was restarted during a session
  try {
    const savedState = dbManager.getSetting('active_session_state');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      if (parsed && parsed.endTime && parsed.endTime > Date.now()) {
        const remainingMins = Math.ceil((parsed.endTime - Date.now()) / 60000);
        if (remainingMins > 0) {
          console.log(`[STARTUP] Resuming active focus session "${parsed.taskName}" (${remainingMins} mins remaining)`);
          startFocusSessionInternal({
            ...parsed,
            duration_mins: remainingMins,
            endTime: parsed.endTime
          });
        }
      } else {
        dbManager.setSetting('active_session_state', '');
      }
    }
  } catch (e) {
    console.warn('[STARTUP] Error restoring active session state:', e);
  }
}

function createTray(icon) {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(icon || iconPath);
  tray.setToolTip('Day Arc - Time Management & Focus');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Day Arc',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-window-relock');
          }
        }
      }
    },
    {
      label: 'Quick Focus Mode',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('trigger-quick-focus');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Day Arc',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  const openApp = () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-window-relock');
      }
    }
  };

  tray.on('click', openApp);
  tray.on('double-click', openApp);
}

// Fullscreen Desktop Blur Overlay (Excluding Windows Taskbar)
function createBlurOverlayWindow() {
  if (blurOverlayWindow && !blurOverlayWindow.isDestroyed()) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  // Using workArea so the Windows Taskbar stays unblurred and completely clear!
  const { x, y, width, height } = primaryDisplay.workArea;

  blurOverlayWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    fullscreen: false,
    alwaysOnTop: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  blurOverlayWindow.setVisibleOnAllWorkspaces(true);
  blurOverlayWindow.loadFile('overlay.html');

  blurOverlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      blurOverlayWindow.hide();
    }
  });
}

// Windows Taskbar Left-Side 5-Minute Countdown Widget Window (Round 14)
function createTaskbarWidgetWindow() {
  if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  const widgetWidth = 290;
  const widgetHeight = 52;
  // Positioned on the left side, directly above the Windows taskbar!
  const widgetX = x + 16;
  const widgetY = y + height - widgetHeight - 8;

  taskbarWidgetWindow = new BrowserWindow({
    x: widgetX,
    y: widgetY,
    width: widgetWidth,
    height: widgetHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  taskbarWidgetWindow.setAlwaysOnTop(true, 'screen-saver');
  taskbarWidgetWindow.setVisibleOnAllWorkspaces(true);
  taskbarWidgetWindow.loadFile('taskbar-widget.html');

  taskbarWidgetWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      taskbarWidgetWindow.hide();
    }
  });
}

function setupExtensionServer() {
  extensionServer.start();

  const blocklist = dbManager.getPrivateBlocklist().map(b => b.domain);
  const adultBlocked = dbManager.getSetting('block_adult_content') === '1';
  extensionServer.syncSecurityRules(blocklist, adultBlocked);

  extensionServer.onViolation((data) => {
    console.warn('URL Violation reported by extension:', data);
    if (currentActiveSession && (currentActiveSession.isStrict || currentActiveSession.isUrlTask)) {
      triggerStrictWindowEnforcement();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('on-url-violation', data);
    }
  });

  extensionServer.onSecurityBlocked((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('on-security-blocked', data);
    }
  });

  extensionServer.onMinimizeEscape((data) => {
    console.warn('[DayArc] Minimize escape reported by extension:', data);
    if (currentActiveSession && (currentActiveSession.isStrict || currentActiveSession.isUrlTask || currentActiveSession.task_type === 'url')) {
      triggerStrictWindowEnforcement();
    }
  });
}

function startActiveWindowWatchdog() {
  if (activeSessionWatchdog) clearInterval(activeSessionWatchdog);

  activeSessionWatchdog = setInterval(() => {
    const isNamaz = currentActiveSession && (
      (currentActiveSession.id && String(currentActiveSession.id).startsWith('namaz-')) ||
      currentActiveSession.task_type === 'namaz' ||
      (currentActiveSession.taskName && currentActiveSession.taskName.toLowerCase().startsWith('namaz'))
    );
    // Strict mode is reserved strictly for Namaz (Daily tasks are non-strict)
    if (!currentActiveSession || !isNamaz || !currentActiveSession.isStrict) {
      clearInterval(activeSessionWatchdog);
      activeSessionWatchdog = null;
      return;
    }

    if (process.platform === 'win32') {
      const psCmd = `
        $w = Add-Type -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\"user32.dll\\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid); [DllImport(\\"user32.dll\\")] public static extern bool IsIconic(IntPtr hWnd); [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport(\\"user32.dll\\")] public static extern bool SetForegroundWindow(IntPtr hWnd);' -Name 'WinAPI_${Date.now()}' -Namespace 'DayArc_${Date.now()}' -PassThru;

        $fgHwnd = $w::GetForegroundWindow();
        $pidVal = 0;
        $w::GetWindowThreadProcessId($fgHwnd, [ref]$pidVal) | Out-Null;
        $fgProc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue;

        $browserProcs = Get-Process chrome, msedge, brave, firefox, arc -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 };
        $browserHwnd = if ($browserProcs) { ($browserProcs | Select-Object -First 1).MainWindowHandle } else { [IntPtr]::Zero };
        $isBrowserMinimized = if ($browserHwnd -ne [IntPtr]::Zero) { $w::IsIconic($browserHwnd) } else { $false };

        [PSCustomObject]@{
            ForegroundProcess = if ($fgProc) { $fgProc.ProcessName.ToLower() } else { '' };
            ForegroundPid = $pidVal;
            BrowserFound = ($browserHwnd -ne [IntPtr]::Zero);
            IsBrowserMinimized = $isBrowserMinimized;
        } | ConvertTo-Json -Compress
      `.replace(/\r?\n\s*/g, ' ');

      exec(`powershell -NoProfile -Command "${psCmd}"`, (err, stdout) => {
        if (!err && stdout) {
          try {
            const data = JSON.parse(stdout.trim());
            const proc = (data.ForegroundProcess || '').toLowerCase().trim();
            const isMinimized = !!data.IsBrowserMinimized;
            const allowedProcesses = ['chrome', 'msedge', 'brave', 'firefox', 'arc', 'electron', 'day arc', 'day-arc'];

            // Case 1: Browser was minimized by user -> Escape attempt!
            if (isMinimized) {
              console.log('[Watchdog] Browser minimization detected during focus. Restoring browser.');
              triggerStrictWindowEnforcement(proc);
              return;
            }

            // Case 2: Foreground window is desktop/folder/another app (not allowed browser) -> Escape attempt!
            if (proc && !allowedProcesses.includes(proc)) {
              console.log(`[Watchdog] Unauthorized app '${proc}' brought to front during focus. Restoring browser focus.`);
              triggerStrictWindowEnforcement(proc);
            }
          } catch (pe) {
            const proc = stdout.trim().toLowerCase();
            const allowedProcesses = ['chrome', 'msedge', 'brave', 'firefox', 'arc', 'electron', 'day arc', 'day-arc'];
            if (proc && !allowedProcesses.includes(proc)) {
              triggerStrictWindowEnforcement(proc);
            }
          }
        }
      });
    }
  }, 800);
}

function shouldBlurTask(taskOrSession) {
  if (!taskOrSession) return false;
  const blurGloballyEnabled = dbManager.getSetting('blur_enforcement_enabled') !== '0';
  if (!blurGloballyEnabled) return false;

  // 1. Namaz tasks: Blur by default (unless explicitly disabled in namaz_settings)
  const isNamaz = (taskOrSession.id && String(taskOrSession.id).startsWith('namaz-')) ||
                  taskOrSession.task_type === 'namaz' ||
                  (taskOrSession.taskName && taskOrSession.taskName.toLowerCase().startsWith('namaz'));
  if (isNamaz) {
    return taskOrSession.is_enabled !== 0 && taskOrSession.is_enabled !== false;
  }

  // 2. URL tasks: Blur desktop behind Chrome so user sees timer on minimize/close
  if (taskOrSession.isUrlTask || taskOrSession.task_type === 'url') {
    return true;
  }

  // 3. Normal / Timed tasks: Blur
  return true;
}

function focusBrowserWindow(browserName = 'chrome') {
  if (process.platform !== 'win32') return;
  const script = `
    $ws = New-Object -ComObject WScript.Shell;
    $procs = Get-Process chrome, msedge, brave, firefox, arc -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 };
    if ($procs) {
      foreach ($p in $procs) {
        try {
          $ws.AppActivate($p.Id) | Out-Null;
        } catch {}
      }
    }
  `;
  exec(`powershell -NoProfile -Command "${script.replace(/\r?\n\s*/g, ' ')}"`, (err) => {
    if (!err) console.log('[TRIGGER] Activated browser window to foreground.');
  });
}

function executeUrlTask(sessionData) {
  const taskId = sessionData.id || 'unknown';
  const runId = `${taskId}:${Date.now()}`;
  const scheduledTime = sessionData.scheduledTime || sessionData.start_time || 'now';
  const triggerTime = new Date().toISOString();
  const rawUrls = sessionData.allowedUrls || [];
  
  console.log(`[URL-TASK] Initiating URL Task: taskId=${taskId}, runId=${runId}, scheduledTime=${scheduledTime}, triggerTime=${triggerTime}, rawUrls=`, rawUrls);

  // Normalize URLs
  const cleanUrls = rawUrls
    .map(u => {
      if (!u) return '';
      let clean = String(u).trim().replace(/^(https?:\/\/)+/gi, '');
      return clean.length > 0 ? 'https://' + clean : '';
    })
    .filter(u => u.length > 8);

  if (cleanUrls.length === 0) {
    console.error(`[URL-TASK] Error: No valid URLs provided for URL Task (taskId=${taskId}, runId=${runId})`);
    return false;
  }

  sessionData.allowedUrls = cleanUrls;
  const defaultBrowser = dbManager.getSetting('default_browser') || 'chrome';
  const defaultProfile = dbManager.getSetting('default_profile') || 'Default';

  console.log(`[URL-TASK] Launching browser "${defaultBrowser}" (Profile: "${defaultProfile}") with normalized URLs:`, cleanUrls);
  browserProfiles.launchUrl(defaultBrowser, defaultProfile, cleanUrls);

  // Explicitly focus the Chrome window to foreground with retries for window initialization
  setTimeout(() => { focusBrowserWindow(defaultBrowser); }, 300);
  setTimeout(() => { focusBrowserWindow(defaultBrowser); }, 800);
  setTimeout(() => { focusBrowserWindow(defaultBrowser); }, 1500);

  // Send START_SESSION command to Chrome extension
  extensionServer.startSession(sessionData);

  return true;
}

function triggerStrictWindowEnforcement(unauthorizedProc = '') {
  if (!currentActiveSession) return;
  
  const isNamaz = (currentActiveSession.id && String(currentActiveSession.id).startsWith('namaz-')) ||
                  currentActiveSession.task_type === 'namaz' ||
                  (currentActiveSession.taskName && currentActiveSession.taskName.toLowerCase().startsWith('namaz'));

  // Namaz tasks: strict screen-saver overlay
  if (isNamaz) {
    const shouldBlur = shouldBlurTask(currentActiveSession);
    if (shouldBlur && blurOverlayWindow && !blurOverlayWindow.isDestroyed()) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { x, y, width, height } = primaryDisplay.workArea;
      blurOverlayWindow.setBounds({ x, y, width, height });
      blurOverlayWindow.show();
      blurOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
      blurOverlayWindow.focus();
    }
    return;
  }

  // URL task enforcement: keep blur backdrop behind, focus browser, kill unauthorized apps
  const isUrl = currentActiveSession.isUrlTask || currentActiveSession.task_type === 'url';
  if (isUrl) {
    const defaultBrowser = dbManager.getSetting('default_browser') || 'chrome';
    if (unauthorizedProc) {
      const lower = unauthorizedProc.toLowerCase();
      if (['notepad', 'wordpad', 'calc', 'calculator', 'cmd', 'powershell', 'vlc', 'mspaint', 'taskmgr'].includes(lower)) {
        exec(`taskkill /F /IM ${lower}.exe /T`, () => {});
      } else if (lower === 'explorer' || lower === 'progman' || lower === 'workerw') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { try { $_.Quit() } catch {} }"', () => {});
      }
    }
    extensionServer.restoreBrowserWindow();
    focusBrowserWindow(defaultBrowser);
  }
}

// --- BACKGROUND COUNTDOWN SERVICE (Continuous 5-min taskbar ticker independent of window state - Round 15) ---
let backgroundCountdownInterval = null;

function getBackgroundTargetNow() {
  const gmtOffset = parseFloat(dbManager.getSetting('gmt_offset') || '5');
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const targetMs = utcMs + (gmtOffset * 3600000);
  return new Date(targetMs);
}

function getEffectiveNamazTimes(targetNow) {
  const isFriday = targetNow.getDay() === 5;
  const prayerKeys = isFriday ? ['fajr', 'jumma', 'asr', 'maghrib', 'isha'] : ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
  
  const lat = parseFloat(dbManager.getSetting('calc_lat') || '31.5204');
  const lng = parseFloat(dbManager.getSetting('calc_lng') || '74.3587');
  const gmt = parseFloat(dbManager.getSetting('calc_gmt') || '5');
  const calculated = namazCalc.calculate(targetNow, lat, lng, gmt);

  const namazSettings = dbManager.getNamazSettings();
  const times = {};

  prayerKeys.forEach(p => {
    const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
    let timeStr = null;
    let durationMins = (p === 'jumma' ? 45 : 15);
    let isEnabled = false;

    if (setting) {
      isEnabled = setting.is_enabled === 1 || setting.is_enabled === '1' || setting.is_enabled === true;
      durationMins = parseInt(setting.duration_mins) || durationMins;
      if (setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        timeStr = setting.override_time;
      }
    }

    if (!timeStr && setting && isEnabled) {
      const calcKey = p === 'jumma' ? 'zuhr' : p;
      timeStr = calculated[calcKey];
    }

    if (timeStr && isEnabled) {
      times[p] = {
        name: `Namaz: ${p.charAt(0).toUpperCase() + p.slice(1)}`,
        time: timeStr,
        durationMins: durationMins,
        isEnabled: isEnabled
      };
    }
  });

  return times;
}

function getBackgroundNextUpcomingItem(targetNow) {
  const currentSecs = targetNow.getHours() * 3600 + targetNow.getMinutes() * 60 + targetNow.getSeconds();
  let candidates = [];

  // Prayers (both manual override and calculated offline times)
  try {
    const effectivePrayers = getEffectiveNamazTimes(targetNow);
    for (const [pKey, prayer] of Object.entries(effectivePrayers)) {
      if (prayer.isEnabled && prayer.time && /^\d{1,2}:\d{2}$/.test(prayer.time)) {
        const [h, m] = prayer.time.split(':').map(Number);
        const itemSecs = h * 3600 + m * 60;
        let diff = itemSecs - currentSecs;
        if (diff < 0) diff += 86400;
        candidates.push({
          id: `namaz-${pKey}`,
          name: prayer.name,
          time: prayer.time,
          diffSecs: diff,
          duration_mins: prayer.durationMins,
          task_type: 'namaz'
        });
      }
    }
  } catch (e) {
    console.warn('[SCHEDULER] Error getting prayer candidates:', e);
  }

  // Tasks
  try {
    const y = targetNow.getFullYear();
    const m = String(targetNow.getMonth() + 1).padStart(2, '0');
    const d = String(targetNow.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = dayNames[targetNow.getDay()];

    const tasks = dbManager.getTasks();
    tasks.forEach(t => {
      if (t.is_enabled === 0) return;
      const matchesDate = t.specific_date ? t.specific_date === todayStr : (t.repeat_days || []).includes(currentDayName);
      if (matchesDate && t.start_time && /^\d{1,2}:\d{2}$/.test(t.start_time)) {
        const [th, tm] = t.start_time.split(':').map(Number);
        const itemSecs = th * 3600 + tm * 60;
        let diff = itemSecs - currentSecs;
        if (diff < 0) diff += 86400;
        candidates.push({
          id: t.id,
          name: t.name,
          time: t.start_time,
          diffSecs: diff,
          duration_mins: parseInt(t.duration_mins) || 30,
          task_type: t.task_type || 'normal'
        });
      }
    });
  } catch (e) {
    console.warn('[SCHEDULER] Error getting task candidates:', e);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.diffSecs - b.diffSecs);
  return candidates[0];
}

let triggeredTasksForToday = new Set();
let lastSchedulerDateStr = '';

function checkBackgroundScheduler(targetNow) {
  const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
  const y = targetNow.getFullYear();
  const m = String(targetNow.getMonth() + 1).padStart(2, '0');
  const d = String(targetNow.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDayName = dayNames[targetNow.getDay()];

  if (lastSchedulerDateStr !== todayStr) {
    triggeredTasksForToday.clear();
    lastSchedulerDateStr = todayStr;
  }

  // If a session is actively running, don't trigger a new one over it
  if (currentActiveSession && currentActiveSession.endTime && currentActiveSession.endTime > Date.now()) {
    return;
  }

  // Phase 3 Guard: Explicitly check if task list is empty and no enabled prayers exist
  const tasks = dbManager.getTasks();
  const effectivePrayers = getEffectiveNamazTimes(targetNow);
  const hasPrayers = Object.keys(effectivePrayers).length > 0;

  if ((!tasks || tasks.length === 0) && !hasPrayers) {
    if (currentActiveSession && (!currentActiveSession.endTime || currentActiveSession.endTime <= Date.now())) {
      currentActiveSession = null;
    }
    return;
  }

  // 1. Check Tasks from DB
  try {
    for (const task of tasks) {
      if (task.is_enabled === 0) continue;
      const matchesDate = task.specific_date ? task.specific_date === todayStr : (task.repeat_days || []).includes(currentDayName);
      if (matchesDate && task.start_time && /^\d{1,2}:\d{2}$/.test(task.start_time)) {
        const [sh, sm] = task.start_time.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const durationMins = parseInt(task.duration_mins) || 30;
        const endMins = startMins + durationMins;
        const taskKey = `${todayStr}_task_${task.id}_${task.start_time}`;

        // Match within active time window and ensure not already triggered today
        if (currentMins >= startMins && currentMins < endMins && !triggeredTasksForToday.has(taskKey)) {
          triggeredTasksForToday.add(taskKey);
          console.log(`[SCHEDULER] Task "${task.name}" matched for trigger at ${task.start_time} (Current: ${currentMins})`);

          const durRemaining = endMins - currentMins;
          startFocusSessionInternal({
            id: task.id,
            taskName: task.name,
            task_type: task.task_type || (task.allowed_urls && task.allowed_urls.length > 0 ? 'url' : 'normal'),
            allowedUrls: task.allowed_urls || [],
            isStrict: !!task.is_strict,
            isUrlTask: task.task_type === 'url',
            duration_mins: durRemaining,
            endTime: Date.now() + durRemaining * 60 * 1000,
            sound_id: task.sound_id || null
          });
          return;
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error checking tasks:', err);
  }

  // 2. Check Prayers
  try {
    const effectivePrayers = getEffectiveNamazTimes(targetNow);
    for (const [pKey, prayer] of Object.entries(effectivePrayers)) {
      if (prayer.isEnabled && prayer.time && /^\d{1,2}:\d{2}$/.test(prayer.time)) {
        const [sh, sm] = prayer.time.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = startMins + prayer.durationMins;
        const prayerTaskKey = `${todayStr}_namaz_${pKey}_${prayer.time}`;

        if (currentMins >= startMins && currentMins < endMins && !triggeredTasksForToday.has(prayerTaskKey)) {
          triggeredTasksForToday.add(prayerTaskKey);
          console.log(`[SCHEDULER] Namaz "${pKey}" matched for trigger at ${prayer.time} (Current: ${currentMins})`);
          const durRemaining = endMins - currentMins;
          startFocusSessionInternal({
            id: `namaz-${pKey}`,
            taskName: prayer.name,
            task_type: 'namaz',
            duration_mins: durRemaining,
            isStrict: true,
            isUrlTask: false,
            endTime: Date.now() + durRemaining * 60 * 1000,
            sound_id: dbManager.getSetting('azaan_sound_id') || 'bundled-azaan-voice'
          });
          return;
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error checking namaz:', err);
  }
}

function startBackgroundCountdownService() {
  if (backgroundCountdownInterval) clearInterval(backgroundCountdownInterval);

  backgroundCountdownInterval = setInterval(() => {
    try {
      const targetNow = getBackgroundTargetNow();
      
      // Step A: Active Task & Namaz Trigger Engine
      checkBackgroundScheduler(targetNow);

      // Step B: Taskbar Floating Countdown Widget Updater (Unified Widget State Model)
      if (currentActiveSession && currentActiveSession.endTime && currentActiveSession.endTime > Date.now()) {
        // Active Session Reverse Countdown (e.g. 25:00 -> 24:59 -> 00:00)
        const remMs = currentActiveSession.endTime - Date.now();
        const remSecs = Math.max(0, Math.floor(remMs / 1000));
        const mm = Math.floor(remSecs / 60);
        const ss = remSecs % 60;
        const countStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

        if (!taskbarWidgetWindow || taskbarWidgetWindow.isDestroyed()) {
          createTaskbarWidgetWindow();
        }

        if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
          if (!taskbarWidgetWindow.isVisible()) {
            taskbarWidgetWindow.showInactive();
          }
          taskbarWidgetWindow.webContents.send('update-taskbar-widget-data', {
            status: 'activeTask',
            taskId: currentActiveSession.id,
            taskName: currentActiveSession.taskName,
            taskType: currentActiveSession.task_type || (currentActiveSession.isUrlTask ? 'url' : 'normal'),
            endsAtTimestamp: currentActiveSession.endTime,
            remainingSeconds: remSecs,
            countStr: countStr,
            isActiveSession: true,
            isStartingNow: false,
            updatedAt: Date.now()
          });
        }

        if (tray) {
          tray.setToolTip(`Day Arc — Active: ${currentActiveSession.taskName} (${countStr} left)`);
        }
      } else {
        if (currentActiveSession && currentActiveSession.endTime && currentActiveSession.endTime <= Date.now()) {
          console.log(`[SESSION] Focus session "${currentActiveSession.taskName}" time expired. Releasing restrictions.`);
          stopFocusSessionInternal();
        }

        // Upcoming Task Reverse Countdown (Within 5 minutes: 05:00 -> 04:59 -> 00:00)
        const nextItem = getBackgroundNextUpcomingItem(targetNow);

        if (!nextItem) {
          if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed() && taskbarWidgetWindow.isVisible()) {
            taskbarWidgetWindow.hide();
          }
          return;
        }

        const diffSecs = nextItem.diffSecs;

        if (diffSecs <= 300 && diffSecs > 0) {
          const mm = Math.floor(diffSecs / 60);
          const ss = diffSecs % 60;
          const countStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

          if (!taskbarWidgetWindow || taskbarWidgetWindow.isDestroyed()) {
            createTaskbarWidgetWindow();
          }

          if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
            if (!taskbarWidgetWindow.isVisible()) {
              taskbarWidgetWindow.showInactive();
            }
            taskbarWidgetWindow.webContents.send('update-taskbar-widget-data', {
              status: 'preTask',
              taskId: nextItem.id,
              taskName: nextItem.name,
              taskType: nextItem.task_type || 'normal',
              targetTimestamp: Date.now() + diffSecs * 1000,
              remainingSeconds: diffSecs,
              countStr: countStr,
              diffSecs: diffSecs,
              isActiveSession: false,
              isStartingNow: false,
              updatedAt: Date.now()
            });
          }

          if (tray) {
            tray.setToolTip(`Day Arc — Next: ${nextItem.name} in ${countStr}`);
          }
        } else if (diffSecs === 0) {
          if (!taskbarWidgetWindow || taskbarWidgetWindow.isDestroyed()) {
            createTaskbarWidgetWindow();
          }
          if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
            if (!taskbarWidgetWindow.isVisible()) {
              taskbarWidgetWindow.showInactive();
            }
            taskbarWidgetWindow.webContents.send('update-taskbar-widget-data', {
              status: 'preTask',
              taskId: nextItem.id,
              taskName: nextItem.name,
              countStr: '00:00',
              diffSecs: 0,
              isActiveSession: false,
              isStartingNow: true,
              updatedAt: Date.now()
            });
          }
        } else {
          if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed() && taskbarWidgetWindow.isVisible()) {
            taskbarWidgetWindow.hide();
          }
        }
      }
    } catch (err) {
      console.warn('[Background Countdown Error]:', err);
    }
  }, 1000);
}

function startFocusSessionInternal(sessionData) {
  currentActiveSession = sessionData;

  // Determine if this is a URL task
  const isUrl = sessionData.isUrlTask || sessionData.task_type === 'url';
  sessionData.isUrlTask = isUrl;

  // Persist active session state for auto-resume on reboot
  dbManager.setSetting('active_session_state', JSON.stringify(sessionData));

  // Resolve Sound object from database if sound_id is provided
  if (!sessionData.sound && sessionData.sound_id && sessionData.sound_id !== 'none') {
    try {
      const allSounds = dbManager.getSounds();
      sessionData.sound = allSounds.find(s => s.id === sessionData.sound_id) || null;
      if (sessionData.sound) {
        console.log(`[SOUND] Resolved audio for session: "${sessionData.sound.name}" (${sessionData.sound.id})`);
      }
    } catch (err) {
      console.error('[SOUND] Error resolving sound:', err);
    }
  }

  // 1. Central Blur Policy Evaluation
  const shouldBlur = shouldBlurTask(sessionData);
  if (shouldBlur) {
    if (!blurOverlayWindow || blurOverlayWindow.isDestroyed()) {
      createBlurOverlayWindow();
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;
    blurOverlayWindow.setBounds({ x, y, width, height });
    if (isUrl) {
      if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"', () => {});
      }
      blurOverlayWindow.setAlwaysOnTop(false);
      blurOverlayWindow.showInactive();
    } else {
      blurOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
      blurOverlayWindow.show();
      blurOverlayWindow.focus();
    }
    blurOverlayWindow.webContents.send('start-overlay', sessionData);
  } else {
    if (blurOverlayWindow && !blurOverlayWindow.isDestroyed()) {
      blurOverlayWindow.hide();
    }
  }

  // 2. URL Task Execution or Extension Session Start
  if (isUrl) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    setTimeout(() => {
      executeUrlTask(sessionData);
    }, 150);
  } else {
    extensionServer.startSession(sessionData);
  }

  // 3. Watchdog: Strict mode ONLY for Namaz (Daily tasks are non-strict)
  const isNamaz = (sessionData.id && String(sessionData.id).startsWith('namaz-')) ||
                  sessionData.task_type === 'namaz' ||
                  (sessionData.taskName && sessionData.taskName.toLowerCase().startsWith('namaz'));
  if (isNamaz && sessionData.isStrict) {
    startActiveWindowWatchdog();
  } else if (activeSessionWatchdog) {
    clearInterval(activeSessionWatchdog);
    activeSessionWatchdog = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session-started-background', sessionData);
  }

  return true;
}

// --- IPC Handlers ---
ipcMain.handle('get-settings', async () => {
  return dbManager.getAllSettings();
});

ipcMain.handle('set-setting', async (event, key, val) => {
  dbManager.setSetting(key, val);
  if (key === 'block_adult_content') {
    const blocklist = dbManager.getPrivateBlocklist().map(b => b.domain);
    extensionServer.syncSecurityRules(blocklist, val === '1' || val === true);
  }
  if (key === 'auto_start') {
    autoStartManager.sync(val === '1' || val === true);
  }
  return true;
});

ipcMain.handle('set-auto-start', async (event, enabled) => {
  dbManager.setSetting('auto_start', enabled ? '1' : '0');
  autoStartManager.sync(!!enabled);
  return true;
});

ipcMain.handle('get-namaz-times', async (event, dateStr, lat, lng, gmtOffset) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const latitude = parseFloat(lat || dbManager.getSetting('lat') || '24.8607');
  const longitude = parseFloat(lng || dbManager.getSetting('lng') || '67.0011');
  const offset = parseFloat(gmtOffset || dbManager.getSetting('gmt_offset') || '5');
  return namazCalc.calculate(d, latitude, longitude, offset);
});

ipcMain.handle('get-namaz-settings', async () => {
  return dbManager.getNamazSettings();
});

ipcMain.handle('update-namaz-setting', async (event, prayer, duration, isEnabled, overrideTime, afterAzaan) => {
  dbManager.updateNamazSetting(prayer, duration, isEnabled, overrideTime, afterAzaan);
  return true;
});

ipcMain.handle('get-tasks', async () => {
  return dbManager.getTasks();
});

ipcMain.handle('save-task', async (event, task) => {
  const id = dbManager.saveTask(task);
  for (const key of Array.from(triggeredTasksForToday)) {
    if (key.includes(`_task_${id}_`) || (task.id && key.includes(`_task_${task.id}_`))) {
      triggeredTasksForToday.delete(key);
    }
  }
  return id;
});

ipcMain.handle('delete-task', async (event, id) => {
  dbManager.deleteTask(id);
  for (const key of Array.from(triggeredTasksForToday)) {
    if (key.includes(`_task_${id}_`)) {
      triggeredTasksForToday.delete(key);
    }
  }
  return true;
});

ipcMain.handle('get-bookmarks', async () => {
  return dbManager.getBookmarks();
});

ipcMain.handle('save-bookmark', async (event, bm) => {
  return dbManager.saveBookmark(bm);
});

ipcMain.handle('delete-bookmark', async (event, id) => {
  dbManager.deleteBookmark(id);
  return true;
});

ipcMain.handle('get-sounds', async () => {
  return dbManager.getSounds();
});

ipcMain.handle('save-sound', async (event, sound) => {
  return dbManager.saveSound(sound);
});

ipcMain.handle('delete-sound', async (event, id) => {
  dbManager.deleteSound(id);
  return true;
});

ipcMain.handle('get-private-blocklist', async () => {
  return dbManager.getPrivateBlocklist();
});

ipcMain.handle('add-blocked-domain', async (event, domain) => {
  const id = dbManager.addPrivateBlockedDomain(domain);
  const blocklist = dbManager.getPrivateBlocklist().map(b => b.domain);
  const adultBlocked = dbManager.getSetting('block_adult_content') === '1';
  extensionServer.syncSecurityRules(blocklist, adultBlocked);
  return id;
});

ipcMain.handle('remove-blocked-domain', async (event, id) => {
  dbManager.removePrivateBlockedDomain(id);
  const blocklist = dbManager.getPrivateBlocklist().map(b => b.domain);
  const adultBlocked = dbManager.getSetting('block_adult_content') === '1';
  extensionServer.syncSecurityRules(blocklist, adultBlocked);
  return true;
});

ipcMain.handle('check-adult-domain', async (event, domain) => {
  return stevenBlack.isBlocked(domain);
});

ipcMain.handle('get-browsers', async () => {
  return browserProfiles.detectBrowsers();
});

ipcMain.handle('launch-browser-url', async (event, browserId, profileId, urls) => {
  browserProfiles.launchUrl(browserId, profileId, urls);
  return true;
});

ipcMain.handle('start-focus-session', async (event, sessionData) => {
  return startFocusSessionInternal(sessionData);
});

ipcMain.handle('reopen-task-browser', async () => {
  if (currentActiveSession && (currentActiveSession.isUrlTask || (currentActiveSession.allowedUrls && currentActiveSession.allowedUrls.length > 0))) {
    console.log('[SESSION] User clicked Open Task: Reopening / focusing browser window for active session.');
    executeUrlTask(currentActiveSession);
    return true;
  }
  return false;
});

function stopFocusSessionInternal() {
  console.log('[SESSION] Stopping active focus session and releasing all desktop & browser restrictions.');

  if (currentActiveSession) {
    const targetNow = getBackgroundTargetNow();
    const y = targetNow.getFullYear();
    const m = String(targetNow.getMonth() + 1).padStart(2, '0');
    const d = String(targetNow.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    if (currentActiveSession.id) {
      triggeredTasksForToday.add(`${todayStr}_task_${currentActiveSession.id}`);
      if (currentActiveSession.start_time) {
        triggeredTasksForToday.add(`${todayStr}_task_${currentActiveSession.id}_${currentActiveSession.start_time}`);
      }
      triggeredTasksForToday.add(`${todayStr}_namaz_${currentActiveSession.id}`);
    }
  }

  currentActiveSession = null;
  dbManager.setSetting('active_session_state', '');

  // 1. Immediately stop desktop active window watchdog (releases Notepad, Folders, etc.)
  if (activeSessionWatchdog) {
    clearInterval(activeSessionWatchdog);
    activeSessionWatchdog = null;
  }

  // 2. Immediately stop Chrome Extension URL restrictions (releases all browser tabs & navigation)
  extensionServer.stopSession();

  // 3. Immediately close the launched task browser window
  browserProfiles.closeTaskBrowser();

  // 3. Hide blur overlay
  if (blurOverlayWindow && !blurOverlayWindow.isDestroyed()) {
    blurOverlayWindow.webContents.send('stop-overlay');
    blurOverlayWindow.hide();
  }

  // 4. Hide floating taskbar widget
  if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
    taskbarWidgetWindow.hide();
  }

  // 5. Reset Tray tooltip
  if (tray) {
    tray.setToolTip('Day Arc - Time Management & Focus');
  }

  // 6. Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session-stopped');
  }

  return true;
}

ipcMain.handle('stop-focus-session', async () => {
  return stopFocusSessionInternal();
});

ipcMain.handle('install-browser-extensions', async () => {
  return browserInstaller.installAll();
});

ipcMain.handle('open-extension-folder', async () => {
  const extPath = browserInstaller.extensionPath;
  if (fs.existsSync(extPath)) {
    shell.openPath(extPath);
    return { success: true, path: extPath };
  }
  return { success: false, path: extPath };
});

ipcMain.handle('record-focus-session', async (event, session) => {
  dbManager.recordFocusSession(session);
  return true;
});

ipcMain.handle('get-stats-today', async () => {
  return dbManager.getStatsToday();
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('open-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('app-window-relock');
  }
  return true;
});

ipcMain.handle('set-taskbar-preview', (event, titleText, tooltipText) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(titleText || 'Day Arc');
  }
  if (tray) {
    tray.setToolTip(tooltipText || titleText || 'Day Arc - Time Management & Focus');
  }
  return true;
});

ipcMain.handle('update-taskbar-countdown', (event, data) => {
  // If an active focus session is currently running, backgroundCountdownService manages the widget countdown smoothly
  if (currentActiveSession && currentActiveSession.endTime && currentActiveSession.endTime > Date.now()) {
    return true;
  }

  if (!taskbarWidgetWindow || taskbarWidgetWindow.isDestroyed()) {
    createTaskbarWidgetWindow();
  }

  if (widgetHideTimeout) {
    clearTimeout(widgetHideTimeout);
    widgetHideTimeout = null;
  }

  if (data && data.isStartingNow) {
    if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
      if (!taskbarWidgetWindow.isVisible()) {
        taskbarWidgetWindow.showInactive();
      }
      taskbarWidgetWindow.webContents.send('update-taskbar-widget-data', data);
      widgetHideTimeout = setTimeout(() => {
        if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed() && (!currentActiveSession || currentActiveSession.endTime <= Date.now())) {
          taskbarWidgetWindow.hide();
        }
      }, 3500);
    }
    return true;
  }

  if (data && data.diffSecs <= 300 && data.diffSecs > 0) {
    if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
      if (!taskbarWidgetWindow.isVisible()) {
        taskbarWidgetWindow.showInactive();
      }
      taskbarWidgetWindow.webContents.send('update-taskbar-widget-data', data);
    }
  } else {
    if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed() && taskbarWidgetWindow.isVisible()) {
      taskbarWidgetWindow.hide();
    }
  }
  return true;
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
  return true;
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('reset-all-data', async () => {
  console.log('[RESET] Full Day Arc user data wipe requested...');
  // 1. Reset database tables and state
  dbManager.resetAllData();

  // 2. Stop any active focus session
  currentActiveSession = null;
  triggeredTasksForToday.clear();
  if (activeSessionWatchdog) {
    clearInterval(activeSessionWatchdog);
    activeSessionWatchdog = null;
  }
  extensionServer.stopSession();

  // 3. Hide overlay and taskbar widget
  if (blurOverlayWindow && !blurOverlayWindow.isDestroyed()) {
    blurOverlayWindow.hide();
  }
  if (taskbarWidgetWindow && !taskbarWidgetWindow.isDestroyed()) {
    taskbarWidgetWindow.hide();
  }
  if (tray) {
    tray.setToolTip('Day Arc - Time Management & Focus');
  }

  // 4. Broadcast reset to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session-stopped');
  }

  return true;
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (activeSessionWatchdog) clearInterval(activeSessionWatchdog);
  dbManager.persistNow();
  extensionServer.stop();
});

app.on('window-all-closed', () => {
  const runInBackground = dbManager.getSetting('run_in_background') !== '0';
  if (process.platform !== 'darwin' && !runInBackground) {
    app.quit();
  }
});
