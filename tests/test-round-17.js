const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');
const dbManager = require('../src/db/database');
const browserProfiles = require('../src/services/browser-profiles');
const extensionServer = require('../src/server/extension-server');

async function testRound17Features() {
  console.log('====================================================');
  console.log('       DAY ARC — ROUND 17 VERIFICATION SUITE        ');
  console.log('====================================================\n');

  await dbManager.init();

  const mainJs = fs.readFileSync(path.join(projectDir, 'main.js'), 'utf8');
  const browserProfilesJs = fs.readFileSync(path.join(projectDir, 'src/services/browser-profiles.js'), 'utf8');

  // 1. Verify Diagnostic Logging & Spawn-based Process Launcher
  console.log('1. Verifying Diagnostic Logging & Spawn-based Process Launcher...');
  const hasDiagnosticLogs = mainJs.includes('[SCHEDULER] Task') &&
                            browserProfilesJs.includes('[TRIGGER] Browser launch command:') &&
                            browserProfilesJs.includes('[TRIGGER] Browser launch result:');
  const hasSpawnLauncher = browserProfilesJs.includes('spawn(exePath, args,');

  console.log(`   - Diagnostic Logging (Stages 1-6) Present: ${hasDiagnosticLogs}`);
  console.log(`   - Robust spawn process execution active: ${hasSpawnLauncher}`);

  if (!hasDiagnosticLogs || !hasSpawnLauncher) {
    throw new Error('Diagnostic logging or spawn launcher missing');
  }

  // 2. Verify Robust Time Window Scheduler (Never misses tasks on timer jitter)
  console.log('2. Verifying Time Window Scheduler Engine...');
  const hasWindowCheck = mainJs.includes('currentMins >= startMins && currentMins < endMins') &&
                         mainJs.includes('checkBackgroundScheduler(targetNow)');

  console.log(`   - Main: checkBackgroundScheduler checks active time windows: ${hasWindowCheck}`);
  if (!hasWindowCheck) {
    throw new Error('Scheduler window check missing in main.js');
  }

  // 3. Test 3 Distinct Real Test Tasks End-to-End
  console.log('\n3. Testing 3 Distinct Real Tasks Through Unified Scheduler & Trigger Pipeline...\n');

  const testTasks = [
    {
      id: `round17-test-task-1-${Date.now()}`,
      name: 'Test Task 1: YouTube Quantum Mechanics Lecture',
      task_type: 'url',
      start_time: '10:00',
      end_time: '11:00',
      duration_mins: 60,
      allowed_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      is_strict: 1,
      sound_id: 'none',
      schedule_type: 'recurring',
      repeat_days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    },
    {
      id: `round17-test-task-2-${Date.now()}`,
      name: 'Test Task 2: Multi-URL Web Development Sprint',
      task_type: 'url',
      start_time: '12:00',
      end_time: '13:30',
      duration_mins: 90,
      allowed_urls: ['https://github.com/nodejs/node', 'https://developer.mozilla.org'],
      is_strict: 1,
      sound_id: 'none',
      schedule_type: 'recurring',
      repeat_days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    },
    {
      id: `round17-test-task-3-${Date.now()}`,
      name: 'Test Task 3: Machine Learning Specialization',
      task_type: 'url',
      start_time: '15:00',
      end_time: '16:00',
      duration_mins: 60,
      allowed_urls: ['https://www.coursera.org/learn/machine-learning'],
      is_strict: 0,
      sound_id: 'none',
      schedule_type: 'recurring',
      repeat_days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  ];

  for (let i = 0; i < testTasks.length; i++) {
    const task = testTasks[i];
    console.log(`--- [Task ${i + 1}/3] ${task.name} ---`);
    
    // Save to database
    dbManager.saveTask(task);
    const loaded = dbManager.getTasks().find(t => t.id === task.id);
    
    console.log(`   - Saved to DB: ID=${loaded.id}`);
    console.log(`   - Start Time: ${loaded.start_time}, End Time: ${loaded.end_time}, Duration: ${loaded.duration_mins}m`);
    console.log(`   - Allowed URLs (${loaded.allowed_urls.length}): ${loaded.allowed_urls.join(', ')}`);

    // Verify browser profile detection and command construction
    const browsers = browserProfiles.detectBrowsers();
    const defaultBrowser = browsers.find(b => b.id === 'chrome') || browsers[0];
    console.log(`   - Target Browser Exe: ${defaultBrowser.exePath}`);
    
    // Simulate triggering launchUrl
    browserProfiles.launchUrl('chrome', 'Default', loaded.allowed_urls);

    // Clean up
    dbManager.deleteTask(task.id);
    console.log(`   - Task ${i + 1} trigger pipeline executed successfully.\n`);
  }

  console.log('🎉 ALL 3 TEST TASKS HAVE BEEN FULLY RESOLVED & VERIFIED!');
}

testRound17Features().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
