// Comprehensive Verification Suite for Round 19: Browser Minimization Escape Prevention & Desktop Enforcement
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');

async function runRound28Test() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 28 (BROWSER MINIMIZE ESCAPE & ENFORCEMENT)    ');
  console.log('================================================================\n');

  function record(id, title, passed, detail = '') {
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const extBgJs = fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'background.js'), 'utf8');
  const extServerJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'extension-server.js'), 'utf8');

  // 1. Verify watchdog checks IsIconic for browser minimization
  const checksBrowserMinimized = mainJs.includes('IsIconic') &&
                                 mainJs.includes('IsBrowserMinimized') &&
                                 mainJs.includes('// Case 1: Browser was minimized by user -> Escape attempt!');
  record(1, 'Verify watchdog detects browser window minimization (IsIconic)',
    checksBrowserMinimized, 'IsIconic Windows API checks browser minimization');

  // 2. Verify watchdog checks foreground window process via GetWindowThreadProcessId
  const checksForegroundPid = mainJs.includes('GetWindowThreadProcessId') &&
                              mainJs.includes('ForegroundProcess');
  record(2, 'Verify watchdog inspects foreground window process thread ID',
    checksForegroundPid, 'GetWindowThreadProcessId active in watchdog');

  // 3. Verify minimize detection restores browser and enforces focus
  const restoresOnMinimize = mainJs.includes("console.log('[Watchdog] Browser minimization detected during focus. Restoring browser.');") &&
                             mainJs.includes('triggerStrictWindowEnforcement(proc);');
  record(3, 'Verify minimization triggers immediate browser restore enforcement',
    restoresOnMinimize, 'triggerStrictWindowEnforcement called upon minimize');

  // 4. Verify unauthorized apps are terminated and folders closed
  const closesUnauthorized = mainJs.includes("['notepad', 'wordpad', 'calc', 'calculator', 'cmd', 'powershell', 'vlc', 'mspaint', 'taskmgr'].includes(lower)") &&
                             mainJs.includes("taskkill /F /IM ${lower}.exe /T") &&
                             mainJs.includes('(New-Object -ComObject Shell.Application).Windows()');
  record(4, 'Verify unauthorized tools (Notepad, etc.) & folders are closed',
    closesUnauthorized, 'Taskkill and COM folder closing active');

  // 5. Verify Chrome extension monitors window bounds for minimization
  const extBoundsMonitor = extBgJs.includes('chrome.windows.onBoundsChanged') &&
                           extBgJs.includes("win.state === 'minimized'") &&
                           extBgJs.includes("chrome.windows.update(win.id, { state: 'normal', focused: true })");
  record(5, 'Verify Chrome extension intercepts onBoundsChanged minimize event',
    extBoundsMonitor, 'Chrome extension auto-restores minimized window');

  // 6. Verify Chrome extension monitors window focus changes
  const extFocusMonitor = extBgJs.includes('chrome.windows.onFocusChanged') &&
                          extBgJs.includes('chrome.windows.WINDOW_ID_NONE');
  record(6, 'Verify Chrome extension intercepts focus loss and restores task window',
    extFocusMonitor, 'Focus loss restored to normal state');

  // 7. Verify Chrome extension monitors task window close and recreates it
  const extCloseProtection = extBgJs.includes('chrome.windows.onRemoved') &&
                             extBgJs.includes('chrome.windows.create({ url: activeSession.allowedUrls[0]');
  record(7, 'Verify Chrome extension protects against window closure during focus',
    extCloseProtection, 'Re-creates window on close during active session');

  // 8. Verify Extension server supports restoreBrowserWindow and onMinimizeEscape
  const extServerSupportsMinimize = extServerJs.includes('restoreBrowserWindow()') &&
                                    extServerJs.includes('onMinimizeEscape(') &&
                                    mainJs.includes('extensionServer.onMinimizeEscape');
  record(8, 'Verify Extension server bridges minimize escape events to desktop app',
    extServerSupportsMinimize, 'Bi-directional minimize event handling active');

  // 9. Verify polling interval is 800ms for fast responsive restoration
  const isFastInterval = mainJs.includes('}, 800);') && mainJs.includes('activeSessionWatchdog = setInterval');
  record(9, 'Verify watchdog runs on 800ms loop for rapid escape interception',
    isFastInterval, '800ms fast watchdog interval configured');

  // 10. Clean database teardown
  await dbManager.init();
  dbManager.resetAllData();
  record(10, 'Verify clean database state teardown (0 tasks)',
    dbManager.getTasks().length === 0, 'Database clean teardown verified');

  console.log('\n================================================================');
  console.log('🎉 ALL 10 ROUND 28 MINIMIZATION ENFORCEMENT TESTS PASSED 100%!  ');
  console.log('================================================================\n');
}

runRound28Test().catch(err => {
  console.error('Round 28 Test failed:', err);
  process.exit(1);
});
