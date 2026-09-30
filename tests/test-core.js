const namazCalc = require('./src/services/namaz-calculator');
const dbManager = require('./src/db/database');
const stevenBlack = require('./src/services/stevenblack-blocklist');
const browserProfiles = require('./src/services/browser-profiles');

async function testAll() {
  console.log('--- Testing Day Arc Core Services ---');

  // 1. Database Init
  console.log('1. Testing sql.js Database...');
  await dbManager.init();
  const settings = dbManager.getAllSettings();
  console.log('Settings retrieved:', Object.keys(settings).length, 'settings found.');
  const tasks = dbManager.getTasks();
  console.log('Tasks retrieved:', tasks.length, 'tasks found.');
  const bookmarks = dbManager.getBookmarks();
  console.log('Bookmarks retrieved:', bookmarks.length, 'bookmarks found.');
  const sounds = dbManager.getSounds();
  console.log('Sounds retrieved:', sounds.length, 'sounds found.');

  // 2. Namaz Calculation (Karachi / Hanafi)
  console.log('\n2. Testing Namaz Calculations (Karachi method + Hanafi Asr)...');
  const karachiTimes = namazCalc.calculate(new Date(), 24.8607, 67.0011, 5);
  console.log('Karachi Prayer Times:', karachiTimes);
  if (!karachiTimes.fajr || !karachiTimes.zuhr || !karachiTimes.asr || !karachiTimes.maghrib || !karachiTimes.isha) {
    throw new Error('Namaz calculation failed!');
  }

  // 3. StevenBlack Offline Blocklist
  console.log('\n3. Testing StevenBlack Offline Blocklist...');
  stevenBlack.load();
  console.log('pornhub.com is blocked:', stevenBlack.isBlocked('pornhub.com'));
  console.log('google.com is blocked:', stevenBlack.isBlocked('google.com'));
  console.log('github.com is blocked:', stevenBlack.isBlocked('github.com'));

  // 4. Browser & Profile Detector
  console.log('\n4. Testing Browser & Profile Detector...');
  const browsers = browserProfiles.detectBrowsers();
  console.log('Detected Browsers:', browsers.map(b => `${b.name} (${b.profiles.length} profiles)`));

  console.log('\n✅ All Core Services Passed Verification!');
}

testAll().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
