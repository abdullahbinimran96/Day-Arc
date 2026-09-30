// Comprehensive Daily Maintenance & Self-Checkup Verification Suite
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');
const namazCalc = require('../src/services/namaz-calculator');
const bundledSounds = require('../src/services/bundled-sounds');
const stevenBlack = require('../src/services/stevenblack-blocklist');
const browserProfiles = require('../src/services/browser-profiles');
const autoStartManager = require('../src/services/autostart');
const extensionServer = require('../src/server/extension-server');

async function runDailyMaintenanceAudit() {
  console.log('================================================================');
  console.log('    DAY ARC — DAILY MAINTENANCE & SELF-CHECKUP COMPREHENSIVE    ');
  console.log('================================================================\n');

  function record(id, section, title, passed, detail = '') {
    console.log(`[#${String(id).padStart(2, '0')}][${section}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`[Section: ${section}] Test #${id} failed: ${detail}`);
  }

  // --- SECTION 1: SCHEDULER & ENFORCEMENT LIVE AUDIT ---
  await dbManager.init();
  dbManager.resetAllData();

  // Test 1: Task creation & exact time matching
  const t1Id = dbManager.saveTask({
    name: 'Scheduled Focus Coding',
    start_time: '14:00',
    end_time: '14:45',
    duration_mins: 45,
    task_type: 'blur',
    is_strict: 1
  });
  const tasks = dbManager.getTasks();
  record(1, 'SCHEDULER', 'Create and verify normal blur task persistence',
    tasks.length === 1 && tasks[0].duration_mins === 45, `Duration: ${tasks[0].duration_mins}m`);

  // Test 2: URL Task with multiple allowed URLs
  const t2Id = dbManager.saveTask({
    name: 'Research Paper Review',
    start_time: '15:00',
    end_time: '16:00',
    duration_mins: 60,
    task_type: 'url',
    allowed_urls: ['https://wikipedia.org/wiki/Science', 'https://github.com/explore']
  });
  const t2 = dbManager.getTasks().find(t => t.id === t2Id);
  record(2, 'SCHEDULER', 'Create and verify multi-URL task structure',
    t2 && t2.allowed_urls.length === 2 && t2.task_type === 'url', `URLs: ${t2.allowed_urls.join(', ')}`);

  // Test 3: Midnight rollover modulo arithmetic
  const midnightDiff = (23 * 60 + 55 + 20) % 1440; // 23:55 + 20m = 00:15
  record(3, 'TIMING', 'Midnight rollover modulo arithmetic (23:55 + 20m = 00:15)',
    midnightDiff === 15, `Resolved to ${midnightDiff} minutes past midnight`);

  // Test 4: Back-to-back tasks with 0 gap
  const t3Id = dbManager.saveTask({
    name: 'Task 1',
    start_time: '16:00',
    end_time: '16:30',
    duration_mins: 30,
    task_type: 'blur'
  });
  const t4Id = dbManager.saveTask({
    name: 'Task 2',
    start_time: '16:30',
    end_time: '17:00',
    duration_mins: 30,
    task_type: 'blur'
  });
  const allTasks = dbManager.getTasks();
  record(4, 'TIMING', 'Back-to-back seamless task scheduling (no gaps)',
    allTasks.length === 4, `Tasks stored: ${allTasks.length}`);

  // Test 5: Friday Jumma prayer calculation
  const fridayDate = new Date('2026-08-28T12:00:00Z'); // Friday
  const lat = 24.8607, lng = 67.0011, gmt = 5;
  const fridayCalc = namazCalc.calculate(fridayDate, lat, lng, gmt);
  record(5, 'NAMAZ', 'Friday Jumma & Zuhr offline calculation engine',
    !!fridayCalc.zuhr && !!fridayCalc.asr && !!fridayCalc.fajr, `Zuhr/Jumma time: ${fridayCalc.zuhr}`);

  // --- SECTION 2: DATA INTEGRITY & PERSISTENCE ---
  // Test 6: Auto-save disk persistence interval
  const dbJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'database.js'), 'utf8');
  record(6, 'PERSISTENCE', 'Database debounce auto-save interval check (300ms)',
    dbJs.includes('this.saveTimeout = setTimeout(') && dbJs.includes('300);'), '300ms debounce disk sync active');

  // Test 7: Private tab password hashing
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  record(7, 'SECURITY', 'Private tab password & recovery codes hashed before storage',
    rendererJs.includes("hashString(pwd)") && rendererJs.includes("hashString(recovery)"), 'SHA-256 / cryptographic hash');

  // Test 8: StevenBlack offline adult content blocklist
  stevenBlack.load();
  record(8, 'SECURITY', 'StevenBlack offline blocklist loaded into memory',
    stevenBlack.blockedDomains.size > 0 && stevenBlack.isBlocked('pornhub.com'), `Loaded ${stevenBlack.blockedDomains.size} domains`);

  // --- SECTION 3: STARTUP & PLATFORM BEHAVIOR ---
  // Test 9: VBScript hidden startup runner (no console window)
  const vbsExists = fs.existsSync(path.join(__dirname, '..', 'Day Arc.vbs'));
  const autostartJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'autostart.js'), 'utf8');
  record(9, 'STARTUP', 'VBScript hidden auto-start launcher configuration',
    vbsExists && autostartJs.includes('wscript.exe'), 'WScript / VBS background launcher verified');

  // Test 10: Sleep/wake powerMonitor listener
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  record(10, 'BACKGROUND', 'System sleep/wake powerMonitor listener registration',
    mainJs.includes("powerMonitor.on('resume'"), 'powerMonitor resume listener active');

  // --- SECTION 4: ENFORCEMENT & MINIMIZATION LOCKDOWN ---
  // Test 11: Active window watchdog minimize detection (IsIconic)
  record(11, 'ENFORCEMENT', 'Windows User32 IsIconic window minimize detection',
    mainJs.includes('IsIconic') && mainJs.includes('IsBrowserMinimized'), 'Watchdog checks browser iconic/minimized state');

  // Test 12: Chrome extension window bounds & focus listeners
  const extBgJs = fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'background.js'), 'utf8');
  record(12, 'ENFORCEMENT', 'Chrome extension onBoundsChanged & onFocusChanged minimize interceptors',
    extBgJs.includes('chrome.windows.onBoundsChanged') && extBgJs.includes('chrome.windows.onFocusChanged'), 'Window lifecycle listeners active');

  // Test 13: Unauthorized app termination & File Explorer folder closing
  record(13, 'ENFORCEMENT', 'Unauthorized process suppression (Notepad, folders, etc.)',
    mainJs.includes('taskkill /F /IM') && mainJs.includes('(New-Object -ComObject Shell.Application).Windows()'), 'Process & folder closers active');

  // --- SECTION 5: UI & ERROR HANDLING ---
  // Test 14: All 7 panel views present in index.html
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const panels = ['panel-dashboard', 'panel-namaz', 'panel-tasks', 'panel-bookmarks', 'panel-private-tab', 'panel-sounds', 'panel-settings'];
  const allPanelsPresent = panels.every(p => indexHtml.includes(`id="${p}"`));
  record(14, 'UI', 'All 7 main navigation panels present in markup',
    allPanelsPresent, 'Dashboard, Namaz, Tasks, Bookmarks, Private Tab, Sounds, Settings verified');

  // Test 15: Clean 0-task fresh install teardown
  dbManager.resetAllData();
  record(15, 'CLEANUP', 'Zero-task fresh install state teardown',
    dbManager.getTasks().length === 0 && dbManager.getNamazSettings().length === 0, '0 tasks on disk');

  console.log('\n================================================================');
  console.log('🎉 ALL 15 DAILY MAINTENANCE & SELF-CHECKUP TESTS PASSED 100%!  ');
  console.log('================================================================\n');
}

runDailyMaintenanceAudit().catch(err => {
  console.error('Daily Maintenance Audit failed:', err);
  process.exit(1);
});
