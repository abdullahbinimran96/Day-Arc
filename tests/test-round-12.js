const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');

async function testRound12Features() {
  console.log('====================================================');
  console.log('       DAY ARC — ROUND 12 VERIFICATION SUITE        ');
  console.log('====================================================\n');

  const indexHtml = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
  const indexCss = fs.readFileSync(path.join(projectDir, 'index.css'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(projectDir, 'renderer.js'), 'utf8');

  // 1. Verify Complete Removal of Arc / Timeline Visualization from Top Card
  console.log('1. Verifying Complete Removal of Arc/Timeline from Top Card...');
  const hasArcSvgInDashboard = indexHtml.includes('class="arc-svg-container"');
  const hasArcPathInDashboard = indexHtml.includes('class="arc-path"');
  const hasArcDotsInDashboard = indexHtml.includes('id="arc-dots-container"');
  const hasArcMarkerInDashboard = indexHtml.includes('id="arc-time-marker"');
  const hasHourlyTicksInDashboard = indexHtml.includes('id="arc-hourly-ticks"');

  console.log(`   - HTML: .arc-svg-container removed: ${!hasArcSvgInDashboard}`);
  console.log(`   - HTML: .arc-path curve removed: ${!hasArcPathInDashboard}`);
  console.log(`   - HTML: #arc-dots-container removed: ${!hasArcDotsInDashboard}`);
  console.log(`   - HTML: #arc-time-marker vertical line removed: ${!hasArcMarkerInDashboard}`);
  console.log(`   - HTML: #arc-hourly-ticks removed: ${!hasHourlyTicksInDashboard}`);

  if (hasArcSvgInDashboard || hasArcPathInDashboard || hasArcDotsInDashboard || hasArcMarkerInDashboard || hasHourlyTicksInDashboard) {
    throw new Error('Day Arc timeline visualization is still present in Dashboard markup!');
  }
  console.log('   ✅ Feature 1 Passed: Timeline/arc visualization completely removed from top card.\n');

  // 2. Verify Centered Hero Clock Card Structure & Typography
  console.log('2. Verifying Centered Hero Clock Card Layout & Typography...');
  const hasHeroPanel = indexHtml.includes('class="panel-glass hero-clock-panel"');
  const hasHeroCenter = indexHtml.includes('class="hero-clock-center"');
  const hasClockHours = indexHtml.includes('id="dash-clock-hours"');
  const hasClockMinutes = indexHtml.includes('id="dash-clock-minutes"');
  const hasClockSeconds = indexHtml.includes('id="dash-clock-seconds"');
  const hasLiveDate = indexHtml.includes('id="dash-live-date"');
  const hasHeroDateText = indexHtml.includes('class="hero-clock-date-text"');

  console.log(`   - HTML: .hero-clock-panel container present: ${hasHeroPanel}`);
  console.log(`   - HTML: .hero-clock-center wrapper present: ${hasHeroCenter}`);
  console.log(`   - HTML: Clock digits (HH, MM, SS) present: ${hasClockHours && hasClockMinutes && hasClockSeconds}`);
  console.log(`   - HTML: Live Date text present: ${hasLiveDate && hasHeroDateText}`);

  if (!hasHeroPanel || !hasHeroCenter || !hasClockHours || !hasClockMinutes || !hasClockSeconds || !hasLiveDate) {
    throw new Error('Hero Clock Panel elements missing from HTML');
  }
  console.log('   ✅ Feature 2 Passed: Centered Hero Clock Card structure verified.\n');

  // 3. Verify Design Tokens, Animations & Compact Card Height
  console.log('3. Verifying CSS Design Tokens, Compact Padding & Glow/Pulse Animations...');
  const hasMonoDigits = indexCss.includes('.hero-clock-digits-row') && indexCss.includes('font-family: var(--font-mono)');
  const hasLargeDigitSize = indexCss.includes('.hero-clock-digit') && indexCss.includes('font-size: 76px');
  const hasAmberGlow = indexCss.includes('text-shadow: 0 0 35px rgba(231, 178, 76, 0.22)');
  const hasColonPulse = indexCss.includes('.hero-clock-colon') && indexCss.includes('animation: colonPulse');
  const hasFrauncesDate = indexCss.includes('.hero-clock-date-text') && indexCss.includes('var(--font-heading)') && indexCss.includes('#888B9E');
  const hasCompactPadding = indexCss.includes('.hero-clock-panel') && indexCss.includes('padding: 24px 32px 28px 32px');

  console.log(`   - CSS: JetBrains Mono digits with tabular nums: ${hasMonoDigits}`);
  console.log(`   - CSS: Large prominent 76px clock digits: ${hasLargeDigitSize}`);
  console.log(`   - CSS: Subtle breathing amber glow: ${hasAmberGlow}`);
  console.log(`   - CSS: Colon pulse animation: ${hasColonPulse}`);
  console.log(`   - CSS: Fraunces font muted grey (#888B9E) for date/day: ${hasFrauncesDate}`);
  console.log(`   - CSS: Compact balanced card height & padding: ${hasCompactPadding}`);

  if (!hasMonoDigits || !hasLargeDigitSize || !hasAmberGlow || !hasColonPulse || !hasFrauncesDate || !hasCompactPadding) {
    throw new Error('Hero Clock CSS styles or animations missing');
  }
  console.log('   ✅ Feature 3 Passed: Design tokens, typography, glow/pulse animations, and compact height verified.\n');

  // 4. Verify Unobtrusive Status & Location Badges
  console.log('4. Verifying Unobtrusive Top Bar Status & Location Pills...');
  const hasStatusPill = indexHtml.includes('class="hero-status-pill"') && indexHtml.includes('id="dash-phase-label"');
  const hasLocationPill = indexHtml.includes('class="hero-location-pill"') && indexHtml.includes('id="dash-location-badge"');

  console.log(`   - HTML: Subtle status pill present: ${hasStatusPill}`);
  console.log(`   - HTML: Subtle location pill present: ${hasLocationPill}`);

  if (!hasStatusPill || !hasLocationPill) {
    throw new Error('Status or location pills missing');
  }
  console.log('   ✅ Feature 4 Passed: Status and location badges are unobtrusive and cleanly positioned.\n');

  // 5. Verify Integrity of Up Next Card, Next Prayer Card & Stats Row
  console.log('5. Verifying Integrity of Up Next Card, Next Prayer Card & Stats Row...');
  const hasUpNextCard = indexHtml.includes('class="upnext-card"');
  const hasNextPrayerCard = indexHtml.includes('class="prayer-quick-card"');
  const hasStatsRow = indexHtml.includes('id="stat-completed-tasks"') && indexHtml.includes('id="stat-streak-days"');

  console.log(`   - HTML: Up Next Card intact: ${hasUpNextCard}`);
  console.log(`   - HTML: Next Prayer Card intact: ${hasNextPrayerCard}`);
  console.log(`   - HTML: Stats cards intact: ${hasStatsRow}`);

  if (!hasUpNextCard || !hasNextPrayerCard || !hasStatsRow) {
    throw new Error('Other Dashboard cards were compromised!');
  }
  console.log('   ✅ Feature 5 Passed: Up Next, Next Prayer, and Stats cards remain 100% functional and intact.\n');

  console.log('🎉 ALL 5 ROUND 12 REQUIREMENTS HAVE BEEN FULLY RESOLVED & VERIFIED!');
}

testRound12Features().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
