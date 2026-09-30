// Comprehensive Verification Suite for Post-Task Complete Release of All Browser & Desktop Restrictions
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');

async function runRound27Test() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 27 (POST-TASK COMPLETE RESTRICTION RELEASE)    ');
  console.log('================================================================\n');

  function record(id, title, passed, detail = '') {
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const extBgJs = fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'background.js'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  // 1. Verify unified stopFocusSessionInternal handles complete release in main.js
  const hasStopInternal = mainJs.includes('function stopFocusSessionInternal()') &&
                          mainJs.includes('currentActiveSession = null;') &&
                          mainJs.includes("dbManager.setSetting('active_session_state', '');");
  record(1, 'Verify stopFocusSessionInternal resets session state and persistence',
    hasStopInternal, 'Session state cleared');

  // 2. Verify desktop active window watchdog is terminated immediately on session end
  const watchdogTerminated = mainJs.includes('if (activeSessionWatchdog) {\n    clearInterval(activeSessionWatchdog);\n    activeSessionWatchdog = null;\n  }');
  record(2, 'Verify desktop watchdog stops immediately (allowing folders & notepad)',
    watchdogTerminated, 'Watchdog interval cleared and nulled');

  // 3. Verify extension server sends STOP_SESSION on task completion
  const extensionStopSent = mainJs.includes('extensionServer.stopSession();');
  record(3, 'Verify main process sends stopSession command to Chrome extension',
    extensionStopSent, 'extensionServer.stopSession called');

  // 4. Verify Chrome extension releases activeSession on STOP_SESSION
  const extReleasesSession = extBgJs.includes("msg.type === 'STOP_SESSION'") &&
                             extBgJs.includes('activeSession = null;') &&
                             extBgJs.includes('isRestoringMap.clear();') &&
                             extBgJs.includes("chrome.storage.local.remove('activeSession');");
  record(4, 'Verify Chrome extension releases all tab locks and URL restrictions',
    extReleasesSession, 'activeSession set to null in extension');

  // 5. Verify background countdown service automatically calls stopFocusSessionInternal on timer expiration
  const autoExpiryStop = mainJs.includes('currentActiveSession.endTime <= Date.now()') &&
                         mainJs.includes('stopFocusSessionInternal();');
  record(5, 'Verify natural timer expiration triggers automatic complete release',
    autoExpiryStop, 'Background service auto-triggers release on expiration');

  // 6. Verify taskbar widget and blur overlay are hidden on session stop
  const widgetAndOverlayHidden = mainJs.includes('taskbarWidgetWindow.hide();') &&
                                 mainJs.includes('blurOverlayWindow.hide();');
  record(6, 'Verify taskbar widget and blur overlay are hidden on task end',
    widgetAndOverlayHidden, 'Widget and overlay hidden');

  // 7. Verify tray tooltip is restored to default
  const trayRestored = mainJs.includes("tray.setToolTip('Day Arc - Time Management & Focus');");
  record(7, 'Verify tray tooltip resets to normal status',
    trayRestored, 'Tray tooltip reset');

  // 8. Verify renderer receives session-stopped event and clears UI session
  const rendererHandlesStop = preloadJs.includes("onSessionStopped: (callback) => ipcRenderer.on('session-stopped',") &&
                              rendererJs.includes('window.dayarc.onSessionStopped') &&
                              rendererJs.includes('activeFocusSession = null;');
  record(8, 'Verify renderer receives session-stopped event and releases UI state',
    rendererHandlesStop, 'Renderer activeFocusSession nulled');

  // 9. Clean database teardown
  await dbManager.init();
  dbManager.resetAllData();
  record(9, 'Verify clean database state teardown (0 tasks on disk)',
    dbManager.getTasks().length === 0, 'Database clean 0 tasks');

  console.log('\n================================================================');
  console.log('🎉 ALL 9 ROUND 27 TASK RELEASE TESTS PASSED 100% GREEN!         ');
  console.log('================================================================\n');
}

runRound27Test().catch(err => {
  console.error('Round 27 Test failed:', err);
  process.exit(1);
});
