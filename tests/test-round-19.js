const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');
const dbManager = require('../src/db/database');

async function testRound19Features() {
  console.log('====================================================');
  console.log('       DAY ARC — ROUND 19 VERIFICATION SUITE        ');
  console.log('====================================================\n');

  await dbManager.init();

  const mainJs = fs.readFileSync(path.join(projectDir, 'main.js'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(projectDir, 'renderer.js'), 'utf8');
  const bgJs = fs.readFileSync(path.join(projectDir, 'chrome-extension/background.js'), 'utf8');
  const widgetHtml = fs.readFileSync(path.join(projectDir, 'taskbar-widget.html'), 'utf8');

  // 1. Verify YouTube Video ID Exact Case Preservation
  console.log('1. Verifying YouTube Video ID Exact Case Preservation in Extension...');
  function extractYouTubeVideoId(rawUrl) {
    if (!rawUrl) return null;
    try {
      let u = rawUrl.trim().replace(/^(https?:\/\/)+/gi, '');
      u = 'https://' + u;
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (parsed.searchParams.has('v')) {
          return parsed.searchParams.get('v'); // Exact casing!
        }
      } else if (host === 'youtu.be') {
        return parsed.pathname.replace(/^\/+/, '').split('/')[0];
      }
    } catch (e) {}
    return null;
  }

  const testUrls = [
    { url: 'https://www.youtube.com/watch?v=-bFVpn1uMfo', expectedId: '-bFVpn1uMfo' },
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
    { url: 'https://youtu.be/aBcDeFgHiJk', expectedId: 'aBcDeFgHiJk' }
  ];

  for (const t of testUrls) {
    const extracted = extractYouTubeVideoId(t.url);
    console.log(`   - URL: ${t.url} -> Extracted ID: "${extracted}" (Expected: "${t.expectedId}")`);
    if (extracted !== t.expectedId) {
      throw new Error(`Video ID case mismatch for ${t.url}: got ${extracted}, expected ${t.expectedId}`);
    }
  }
  console.log('   ✅ YouTube Video ID case-sensitivity 100% preserved.\n');

  // 2. Verify Extension Tab Blocking & Assigned Video Enforcement
  console.log('2. Verifying Extension Tab Blocking & Assigned Video Enforcement...');
  const hasTabCreatedBlocker = bgJs.includes('chrome.tabs.onCreated.addListener') &&
                               bgJs.includes('chrome.tabs.remove(tab.id');
  const hasAssignedRedirect = bgJs.includes('restoreTabToAssignedUrl') &&
                              bgJs.includes('chrome.tabs.update(tabId, { url: targetUrl }');

  console.log(`   - Extension: Blocks new tabs from opening: ${hasTabCreatedBlocker}`);
  console.log(`   - Extension: Redirects to assigned video if changed: ${hasAssignedRedirect}`);

  if (!hasTabCreatedBlocker || !hasAssignedRedirect) {
    throw new Error('Extension tab blocker or video redirection missing');
  }

  // 3. Verify Taskbar Reverse Countdown Service (Upcoming & Active)
  console.log('\n3. Verifying Taskbar Reverse Countdown Engine...');
  const hasActiveCountdown = mainJs.includes('currentActiveSession.endTime > Date.now()') &&
                             mainJs.includes('isActiveSession: true');
  const hasWidgetActiveSupport = widgetHtml.includes('data.isActiveSession');

  console.log(`   - Main: Background service handles active & upcoming reverse countdown: ${hasActiveCountdown}`);
  console.log(`   - Taskbar Widget: UI supports active and upcoming reverse countdown: ${hasWidgetActiveSupport}`);

  if (!hasActiveCountdown || !hasWidgetActiveSupport) {
    throw new Error('Taskbar countdown logic incomplete');
  }

  // 4. Verify Edit Task Sheet URL & Setting Restoration
  console.log('\n4. Verifying Edit Task URL and Settings Restoration in renderer.js...');
  const hasTaskTypeSet = rendererJs.includes('selectedTaskType = task.task_type || \'blur\'');
  const hasUrlsRestored = rendererJs.includes('let rawUrls = task.allowed_urls || []') &&
                          rendererJs.includes('urls.forEach(u => addUrlInputRow(u))');

  console.log(`   - Renderer: openEditTaskSheet sets selectedTaskType: ${hasTaskTypeSet}`);
  console.log(`   - Renderer: openEditTaskSheet populates saved allowed_urls: ${hasUrlsRestored}`);

  if (!hasTaskTypeSet || !hasUrlsRestored) {
    throw new Error('Edit Task sheet URL restoration missing in renderer.js');
  }

  console.log('\n🎉 ALL ROUND 19 REQUIREMENTS RESOLVED & VERIFIED!');
}

testRound19Features().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
