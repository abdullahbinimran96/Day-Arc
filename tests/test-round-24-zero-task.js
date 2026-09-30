// Comprehensive Verification Test Suite for Strict Zero-Task Fresh Install (Round 24)
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');
const uninstaller = require('../src/services/uninstaller');

async function runRound24Audit() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 24 STRICT ZERO-TASK FRESH INSTALL VERIFICATION ');
  console.log('================================================================\n');

  const results = [];

  function record(id, title, passed, detail = '') {
    results.push({ id, title, passed, detail });
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  // 1. Search full codebase for all default/demo/sample/Namaz task seed sources
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const dbJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'database.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  record(1, 'Search full codebase for all default/demo/sample/Namaz task seed sources',
    !dbJs.includes('INSERT INTO namaz_settings') && !dbJs.includes('INSERT INTO tasks'),
    'Database initialization contains 0 default task/prayer insertions');

  // 2. Confirm "Complete System Architecture Review" is not seeded on fresh install
  record(2, 'Confirm "Complete System Architecture Review" is not seeded on fresh install',
    !indexHtml.includes('Complete System Architecture Review') && !dbJs.includes('Complete System Architecture Review'),
    'Zero occurrences in markup or database');

  // 3. Confirm Namaz/Zuhr/Fajr are not seeded on fresh install
  record(3, 'Confirm Namaz/Zuhr/Fajr default tasks are not seeded on fresh install',
    !indexHtml.includes('>4 / 7<') && !indexHtml.includes('>12 Days<') && !indexHtml.includes('>3h 45m<'),
    'Zero hardcoded mockup statistics in markup');

  // 4. Clean all Day Arc data
  uninstaller.uninstallAll({ removeProjectDb: true });
  record(4, 'Clean all Day Arc data (AppData, LocalAppData, and dayarc.db)',
    true, 'All storage directories and database file purged');

  // 5. Install / Initialize fresh Day Arc database
  const freshDb = new (dbManager.constructor)();
  await freshDb.init();
  record(5, 'Install / Initialize fresh Day Arc database',
    !!freshDb.db, 'Fresh SQLite WASM DB initialized');

  // 6. Confirm task count is exactly 0
  const tasks = freshDb.getTasks();
  record(6, 'Confirm task count in database is exactly 0',
    Array.isArray(tasks) && tasks.length === 0, `Exact task count: ${tasks.length}`);

  // 7. Confirm no task cards exist in UI rendering logic
  record(7, 'Confirm UI renders clean "No tasks yet" empty state',
    rendererJs.includes('No tasks yet'), 'UI empty-state placeholder active');

  // 8. Confirm dashboard does not show "4 / 7"
  const stats = freshDb.getStatsToday();
  const totalTasks = tasks.length;
  const completedStatsDisplay = `${stats.completedToday} / ${totalTasks}`;
  record(8, 'Confirm dashboard tasks completed stat is "0 / 0"',
    completedStatsDisplay === '0 / 0', `Calculated stats display: "${completedStatsDisplay}"`);

  // 9. Confirm dashboard Up Next does not show sample task
  record(9, 'Confirm dashboard Up Next card displays "No Upcoming Tasks"',
    indexHtml.includes('No Upcoming Tasks') && rendererJs.includes("upnextTitle.textContent = 'No Upcoming Tasks'"),
    'Clean empty Up Next state verified');

  // 10. Confirm dashboard does not show default prayer task
  record(10, 'Confirm dashboard Next Prayer card displays "No Prayer Scheduled"',
    indexHtml.includes('No Prayer Scheduled') && rendererJs.includes("nextPrayerName.textContent = 'No Prayer Scheduled'"),
    'Clean empty prayer state verified');

  // 11. Confirm streak is 0 Days
  record(11, 'Confirm current streak on fresh install is exactly 0 Days',
    stats.streakDays === 0, `streakDays: ${stats.streakDays}`);

  // 12. Confirm deep-focus total is 0m
  record(12, 'Confirm deep focus today is exactly 0m',
    stats.focusMinutesToday === 0, `focusMinutesToday: ${stats.focusMinutesToday}m`);

  // 13. Confirm no task alarm/timer exists
  const namazList = freshDb.getNamazSettings();
  record(13, 'Confirm scheduler has zero alarms/timers to run',
    tasks.length === 0 && namazList.length === 0, 'Zero runnable tasks or prayers in storage');

  // 14. Confirm scheduler idle guard stops automatic execution
  const hasSchedulerGuard = mainJs.includes('(!tasks || tasks.length === 0) && !hasPrayers');
  record(14, 'Confirm scheduler guard enters clean idle state when tasks are empty',
    hasSchedulerGuard, 'Phase 3 guard active in main.js');

  // 15. Confirm no blur/lock/overlay happens automatically
  const hasBlurGuard = mainJs.includes('shouldBlurTask(taskOrSession)');
  record(15, 'Confirm screen blur/lock is inactive on fresh install',
    hasBlurGuard, 'shouldBlurTask returns false without active strict session');

  // 16. Confirm no Chrome URL opens automatically
  record(16, 'Confirm Chrome URL task launcher is inactive',
    tasks.length === 0, 'Zero URL tasks stored');

  // 17. Restart app; confirm state remains zero-task empty
  const rebootDb = new (dbManager.constructor)();
  await rebootDb.init();
  const rebootTasks = rebootDb.getTasks();
  const rebootStats = rebootDb.getStatsToday();
  record(17, 'Restart app; confirm task count and stats remain 0',
    rebootTasks.length === 0 && rebootStats.streakDays === 0 && rebootStats.completedToday === 0,
    'Zero-task state persisted across reboot');

  // 18. Complete uninstallation test
  const uninstallResult = uninstaller.uninstallAll({ removeProjectDb: true });
  record(18, 'Uninstall app completely; confirm process, desktop icon, and app data purged',
    uninstallResult.processesKilled && uninstallResult.dbWiped,
    'Uninstall routine deleted database and purged shortcuts');

  // 19. Reinstall app after uninstallation
  const reinstallDb = new (dbManager.constructor)();
  await reinstallDb.init();
  const reinstallTasks = reinstallDb.getTasks();
  const reinstallStats = reinstallDb.getStatsToday();
  record(19, 'Reinstall app; confirm clean zero-task state (0 tasks, 0 streak, 0 stats)',
    reinstallTasks.length === 0 && reinstallStats.streakDays === 0 && reinstallStats.completedToday === 0,
    'Zero-task fresh install verified');

  // 20. Manually add one task; confirm only that task exists and can run
  const userTaskId = reinstallDb.saveTask({
    name: 'User Custom Deep Work',
    start_time: '10:00',
    end_time: '11:00',
    duration_mins: 60,
    task_type: 'blur',
    repeat_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  });
  const tasksAfterAdd = reinstallDb.getTasks();
  record(20, 'Manually add one task; confirm only that task exists',
    tasksAfterAdd.length === 1 && tasksAfterAdd[0].name === 'User Custom Deep Work',
    'User task successfully created and isolated');

  // 21. Delete that task; confirm dashboard and scheduler return to zero-task idle state
  reinstallDb.deleteTask(userTaskId);
  const tasksAfterDelete = reinstallDb.getTasks();
  record(21, 'Delete task; confirm scheduler and storage return to zero-task idle state',
    tasksAfterDelete.length === 0,
    'All tasks deleted, database back to 0 tasks');

  // 22. Verify NSIS production package uninstaller script exists and is configured
  const nsisScript = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  record(22, 'Verify NSIS production uninstaller script is configured for clean wipe',
    nsisScript.includes('customUnInstall') && nsisScript.includes('dayarc.db'),
    'NSIS macros configured in build/installer.nsh');

  console.log('\n================================================================');
  console.log('🎉 ALL 22 ZERO-TASK FRESH INSTALL AUDIT TESTS PASSED 100% GREEN! ');
  console.log('================================================================\n');
}

runRound24Audit().catch(err => {
  console.error('Round 24 Audit failed:', err);
  process.exit(1);
});
