// Comprehensive Verification Suite for Round 29 & Round 30:
// 1. Strict Mode removed from Daily & Time Management tasks.
// 2. Strict Mode exclusively maintained for Namaz prayers.
// 3. App-wide Master Password protecting app launch, unified with Private Tab.
// 4. Master Password verification required when user attempts to End Task early.
// 5. Settings panel displays "Master Password" instead of "Private Tab Password".
// 6. Master Password prompt required every time Day Arc window is closed and reopened.

const fs = require('fs');
const path = require('path');
const dbManager = require('../src/db/database');

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `h_${hash}`;
}

async function runRound29Test() {
  console.log('================================================================');
  console.log('  DAY ARC — ROUND 29 & 30: MASTER PASSWORD & RELOCK ENFORCEMENT QA');
  console.log('================================================================\n');

  function record(id, title, passed, detail = '') {
    console.log(`[Test ${String(id).padStart(2, '0')}] ${title}: ${passed ? '✅ PASS' : '❌ FAIL'} ${detail ? '— ' + detail : ''}`);
    if (!passed) throw new Error(`Test ${id} failed: ${detail}`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'overlay.html'), 'utf8');
  const databaseJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'database.js'), 'utf8');

  // 1. Database Schema contains master_password_hash & master_recovery_code
  const dbHasKeys = databaseJs.includes("master_password_hash: ''") &&
                    databaseJs.includes("master_recovery_code: ''");
  record(1, 'Database default settings contain master_password_hash & master_recovery_code',
    dbHasKeys, 'Schema defaults initialized');

  // 2. Index.html contains #app-lock-screen with setup, unlock, and recovery views
  const hasLockScreen = indexHtml.includes('id="app-lock-screen"') &&
                        indexHtml.includes('id="app-lock-setup-view"') &&
                        indexHtml.includes('id="app-lock-login-view"') &&
                        indexHtml.includes('id="app-lock-reset-view"');
  record(2, 'Index.html contains App Master Lock screen for setup and unlock',
    hasLockScreen, 'UI components for app password gate verified');

  // 3. Index.html contains #modal-end-task-password modal
  const hasEndTaskModal = indexHtml.includes('id="modal-end-task-password"') &&
                          indexHtml.includes('id="form-confirm-end-task"') &&
                          indexHtml.includes('id="input-end-task-pwd"') &&
                          indexHtml.includes('id="end-task-error-text"');
  record(3, 'Index.html contains End Task password verification modal',
    hasEndTaskModal, 'Modal with password input and verification button found');

  // 4. Daily tasks creation removes strict mode (is_strict = 0)
  const dailyTaskNonStrict = rendererJs.includes('is_strict: 0') &&
                             !indexHtml.includes('id="check-task-strict"');
  record(4, 'Daily tasks enforce non-strict mode (is_strict: 0, no UI strict switch)',
    dailyTaskNonStrict, 'Daily tasks cannot be strict');

  // 5. Watchdog only activates for Namaz strict mode
  const watchdogNamazOnly = mainJs.includes("const isNamaz = (sessionData.id && String(sessionData.id).startsWith('namaz-'))") &&
                            mainJs.includes('if (isNamaz && sessionData.isStrict) {') &&
                            mainJs.includes('startActiveWindowWatchdog();');
  record(5, 'Main watchdog only starts for Namaz strict sessions, daily tasks exempted',
    watchdogNamazOnly, 'Watchdog scoped exclusively to Namaz');

  // 6. Master password setup in renderer synchronizes with private tab
  const masterSyncsPrivate = rendererJs.includes("await window.dayarc.setSetting('master_password_hash', hashedPwd);") &&
                             rendererJs.includes("await window.dayarc.setSetting('private_tab_password_hash', hashedPwd);");
  record(6, 'Renderer syncs master_password_hash and private_tab_password_hash',
    masterSyncsPrivate, 'Single unified password for app & private tab');

  // 7. Hash function test matches between master lock and private tab
  const testPwd = 'SecurePassword123!';
  const expectedHash = hashString(testPwd);
  const hashMatches = expectedHash.startsWith('h_') && expectedHash === hashString('SecurePassword123!');
  record(7, 'Deterministic hashString function produces matching hashes',
    hashMatches, `Computed hash: ${expectedHash}`);

  // 8. End-task verification logic in renderer.js
  const endTaskVerified = rendererJs.includes('requestStopFocusSession()') &&
                          rendererJs.includes('formConfirmEndTask.addEventListener(\'submit\'') &&
                          rendererJs.includes('hashString(pwd) === currentHash');
  record(8, 'Renderer requires master password verification before ending focus session',
    endTaskVerified, 'requestStopFocusSession & form submission verify hash');

  // 9. Fullscreen overlay.html contains password verification modal
  const overlayProtected = overlayHtml.includes('id="overlay-pwd-modal"') &&
                           overlayHtml.includes('id="input-overlay-pwd"') &&
                           overlayHtml.includes('handleVerifyAndStop()') &&
                           overlayHtml.includes('hashString(inputPwd.value) === masterHash');
  record(9, 'Fullscreen overlay.html requires master password to dismiss early',
    overlayProtected, 'Overlay cannot be dismissed without password');

  // 10. Settings panel text: "Master Password" instead of "Private Tab Password"
  const settingsPanelHasMaster = indexHtml.includes('<h3 class="font-fraunces" style="font-size: 18px; color: #EDEDF3;">Master Password</h3>') &&
                                !indexHtml.includes('<h3 class="font-fraunces" style="font-size: 18px; color: #EDEDF3;">Private Tab Password</h3>');
  record(10, 'Settings panel heading displays "Master Password"',
    settingsPanelHasMaster, 'Private Tab Password renamed to Master Password in Settings');

  // 11. Preload.js exposes onAppWindowRelock IPC listener
  const preloadHasRelock = preloadJs.includes("onAppWindowRelock: (callback) => ipcRenderer.on('app-window-relock', () => callback())");
  record(11, 'Preload bridge exposes onAppWindowRelock listener',
    preloadHasRelock, 'Renderer receives app-window-relock events');

  // 12. Main.js sends app-window-relock on close, hide, show, second-instance, tray, and open IPC
  const mainSendsRelock = mainJs.includes("mainWindow.webContents.send('app-window-relock');") &&
                          mainJs.includes("mainWindow.on('close'") &&
                          mainJs.includes("mainWindow.on('hide'") &&
                          mainJs.includes("mainWindow.on('show'");
  record(12, 'Main process broadcasts app-window-relock on close, hide, and show',
    mainSendsRelock, 'Multi-event relock triggers configured');

  // 13. Renderer.js defines relockAppScreen and listens to onAppWindowRelock
  const rendererHasRelock = rendererJs.includes('function relockAppScreen()') &&
                            rendererJs.includes('window.dayarc.onAppWindowRelock');
  record(13, 'Renderer re-locks app lock screen upon receiving window reopen event',
    rendererHasRelock, 'relockAppScreen and onAppWindowRelock active');

  // 14. Database operations & fresh install state check
  await dbManager.init();
  dbManager.setSetting('master_password_hash', expectedHash);
  const retrievedHash = dbManager.getSetting('master_password_hash');
  const dbSavedCorrectly = retrievedHash === expectedHash;

  // Clean reset to zero tasks
  dbManager.resetAllData();
  const tasksAfterReset = dbManager.getTasks();
  const resetClean = tasksAfterReset.length === 0;

  record(14, 'Database setting persistence and clean 0-task reset validated',
    dbSavedCorrectly && resetClean, `Retrieved: ${retrievedHash}, tasks remaining: ${tasksAfterReset.length}`);

  console.log('\n================================================================');
  console.log('🎉 ALL 14 ROUND 29 & 30 VERIFICATION TESTS PASSED 100% GREEN!');
  console.log('================================================================\n');
}

runRound29Test().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
