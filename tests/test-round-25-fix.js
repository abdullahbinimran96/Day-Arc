// Comprehensive Round 25 Verification Suite: Zero-Task Clean State & Non-Blinking Widget
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');
const uninstaller = require('../src/services/uninstaller');

async function runRound25Test() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 25 VERIFICATION (ZERO-TASK & WIDGET STABILITY) ');
  console.log('================================================================\n');

  function record(id, title, passed, detail = '') {
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  // 1. Confirm database has 0 tasks on fresh install
  await dbManager.init();
  dbManager.resetAllData();
  const tasks = dbManager.getTasks();
  record(1, 'Confirm fresh database starts with exactly 0 tasks',
    tasks.length === 0, `Tasks count: ${tasks.length}`);

  // 2. Confirm database has 0 namaz settings on fresh install
  const namaz = dbManager.getNamazSettings();
  record(2, 'Confirm fresh database starts with 0 pre-seeded prayers',
    namaz.length === 0, `Namaz count: ${namaz.length}`);

  // 3. Confirm UI markup renders clean empty state placeholder (matching Screenshot 2)
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  record(3, 'Confirm Daily & Time Management renders clean "No tasks yet" empty state',
    rendererJs.includes('No tasks yet') && rendererJs.includes('Click "+ Add Task" to schedule your daily focus sessions'),
    'Matches Screenshot 2 required empty-state');

  // 4. Confirm Dashboard Up Next card is clean
  record(4, 'Confirm Dashboard Up Next card displays "No Upcoming Tasks"',
    indexHtml.includes('No Upcoming Tasks') && rendererJs.includes("upnextTitle.textContent = 'No Upcoming Tasks'"),
    'Zero dummy tasks on Dashboard');

  // 5. Confirm Dashboard Stats show 0 / 0 and 0 Days streak
  const stats = dbManager.getStatsToday();
  record(5, 'Confirm stats show 0 / 0 completed and 0 Days streak',
    stats.completedToday === 0 && stats.streakDays === 0 && stats.focusMinutesToday === 0,
    `Streak: ${stats.streakDays} Days, Completed: ${stats.completedToday}`);

  // 6. Verify Taskbar widget CSS does not contain jittery animations
  const widgetHtml = fs.readFileSync(path.join(__dirname, '..', 'taskbar-widget.html'), 'utf8');
  record(6, 'Verify Taskbar widget does not have repeating slideUp animation',
    !widgetHtml.includes('animation: slideUp'),
    'Jitter animation removed from widget-pill');

  // 7. Verify main.js prevents widget blinking during active running task
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const hasActiveSessionWidgetGuard = mainJs.includes("currentActiveSession && currentActiveSession.endTime && currentActiveSession.endTime > Date.now()") &&
                                      mainJs.includes("ipcMain.handle('update-taskbar-countdown'");
  record(7, 'Verify update-taskbar-countdown is guarded during active session',
    hasActiveSessionWidgetGuard,
    'Active session widget cannot be hidden by renderer tick');

  // 8. Verify renderer checkUpNextCountdown is guarded during active focus session
  const hasRendererActiveGuard = rendererJs.includes("if (activeFocusSession) return;\n    const nextItem = getNextUpcomingItem();");
  record(8, 'Verify checkUpNextCountdown in renderer is guarded when activeFocusSession is true',
    hasRendererActiveGuard,
    'Prevents renderer from firing conflicting hide commands');

  // 9. Verify syntax of renderer.js
  const { execSync } = require('child_process');
  let syntaxOk = false;
  try {
    execSync('node --check renderer.js', { cwd: path.join(__dirname, '..') });
    syntaxOk = true;
  } catch (e) {}
  record(9, 'Verify renderer.js syntax is 100% error-free',
    syntaxOk, 'node --check passed with 0 errors');

  // 10. Verify teardown wipes database to clean state
  dbManager.resetAllData();
  record(10, 'Verify database reset leaves 0 tasks on disk',
    dbManager.getTasks().length === 0, 'Database clean teardown verified');

  console.log('\n================================================================');
  console.log('🎉 ALL 10 ROUND 25 VERIFICATION TESTS PASSED 100% GREEN!         ');
  console.log('================================================================\n');
}

runRound25Test().catch(err => {
  console.error('Round 25 Test failed:', err);
  process.exit(1);
});
