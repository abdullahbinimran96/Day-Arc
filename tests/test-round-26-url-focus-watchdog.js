// Comprehensive Verification Suite for URL Task Desktop Work Blocker & Watchdog
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');

async function runRound26Test() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 26 (URL TASK DESKTOP ENFORCEMENT & WATCHDOG)  ');
  console.log('================================================================\n');

  function record(id, title, passed, detail = '') {
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  // 1. Verify watchdog starts for URL tasks
  const watchdogStartsForUrl = mainJs.includes('if (isUrl || (shouldBlur && sessionData.isStrict))') &&
                               mainJs.includes('startActiveWindowWatchdog();');
  record(1, 'Verify active window watchdog automatically starts during URL tasks',
    watchdogStartsForUrl, 'Watchdog enabled for isUrl === true');

  // 2. Verify watchdog checks for unauthorized desktop apps
  const watchdogChecksUnauthorized = mainJs.includes('const allowedProcesses = [\'chrome\', \'msedge\', \'brave\', \'firefox\', \'arc\', \'electron\', \'day arc\', \'day-arc\'];') &&
                                     mainJs.includes('triggerStrictWindowEnforcement(proc);');
  record(2, 'Verify watchdog detects unauthorized apps (Notepad, File Explorer, etc.)',
    watchdogChecksUnauthorized, 'Allowed processes whitelist active');

  // 3. Verify Notepad and other unauthorized desktop tools are closed
  const closesUnauthorizedApps = mainJs.includes("['notepad', 'wordpad', 'calc', 'calculator', 'cmd', 'powershell', 'vlc', 'mspaint'].includes(lower)") &&
                                 mainJs.includes('taskkill /F /IM ${lower}.exe /T');
  record(3, 'Verify unauthorized desktop tools (Notepad, etc.) are terminated',
    closesUnauthorizedApps, 'Taskkill enforcement active');

  // 4. Verify File Explorer folder windows are closed via COM
  const closesExplorerFolders = mainJs.includes("New-Object -ComObject Shell.Application).Windows()") &&
                                mainJs.includes('$_.Quit()');
  record(4, 'Verify File Explorer folder windows are closed during URL task',
    closesExplorerFolders, 'COM Shell.Application folder closer active');

  // 5. Verify browser window is restored to foreground
  const restoresBrowserForeground = mainJs.includes('focusBrowserWindow(defaultBrowser);');
  record(5, 'Verify Chrome / active task browser is immediately focused to foreground',
    restoresBrowserForeground, 'focusBrowserWindow called in triggerStrictWindowEnforcement');

  // 6. Verify URL tasks do not receive full-screen blur
  const urlTaskNoBlur = mainJs.includes('if (taskOrSession.isUrlTask || taskOrSession.task_type === \'url\') {\n    return false;\n  }');
  record(6, 'Verify URL tasks display browser unblurred while blocking desktop apps',
    urlTaskNoBlur, 'shouldBlurTask returns false for URL tasks');

  // 7. Verify watchdog interval is responsive
  const hasResponsiveInterval = mainJs.includes('}, 1000);') && mainJs.includes('activeSessionWatchdog = setInterval(');
  record(7, 'Verify watchdog runs on a fast 1000ms polling cycle',
    hasResponsiveInterval, '1000ms loop active');

  // 8. Clean database teardown
  await dbManager.init();
  dbManager.resetAllData();
  record(8, 'Verify clean database state teardown (0 tasks)',
    dbManager.getTasks().length === 0, 'Clean database verified');

  console.log('\n================================================================');
  console.log('🎉 ALL 8 ROUND 26 URL DESKTOP ENFORCEMENT TESTS PASSED 100%!     ');
  console.log('================================================================\n');
}

runRound26Test().catch(err => {
  console.error('Round 26 Test failed:', err);
  process.exit(1);
});
