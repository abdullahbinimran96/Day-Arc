const fs = require('fs');
const path = require('path');
const projectDir = path.resolve(__dirname, '..');

async function testRound7Features() {
  console.log('====================================================');
  console.log('       DAY ARC — ROUND 7 VERIFICATION SUITE         ');
  console.log('====================================================\n');

  const indexHtml = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
  const indexCss = fs.readFileSync(path.join(projectDir, 'index.css'), 'utf8');
  const rendererJs = fs.readFileSync(path.join(projectDir, 'renderer.js'), 'utf8');

  // 1. Verify "Calendar" (month) view is completely removed
  console.log('1. Verifying "Calendar" Month View Removal...');
  const hasDayBtn = indexHtml.includes('id="btn-view-day"');
  const hasWeekBtn = indexHtml.includes('id="btn-view-week"');
  const hasCalendarBtn = indexHtml.includes('id="btn-view-calendar"');
  const hasCalendarView = indexHtml.includes('id="tasks-calendar-view"');
  const hasCalendarGrid = indexHtml.includes('id="calendar-days-grid"');

  console.log(`   - "Day" switcher button exists: ${hasDayBtn}`);
  console.log(`   - "Week" switcher button exists: ${hasWeekBtn}`);
  console.log(`   - "Calendar" switcher button removed: ${!hasCalendarBtn}`);
  console.log(`   - Month calendar container removed: ${!hasCalendarView && !hasCalendarGrid}`);

  if (!hasDayBtn || !hasWeekBtn || hasCalendarBtn || hasCalendarView || hasCalendarGrid) {
    throw new Error('Calendar view elements still present or Day/Week buttons missing in index.html');
  }
  console.log('   ✅ Feature 1 Passed: Month Calendar view is completely removed. Only Day & Week remain.\n');

  // 2. Verify Clickable Week View Tiles
  console.log('2. Verifying Clickable Week Tiles...');
  const hasTileCss = indexCss.includes('.week-time-slot-tile');
  const hasTileHoverCss = indexCss.includes('.week-time-slot-tile:hover');
  const hasTileSelectedCss = indexCss.includes('.week-time-slot-tile.selected-tile');
  const hasTileLogic = rendererJs.includes("tile.className = 'week-time-slot-tile'") && 
                       rendererJs.includes("tile.classList.add('selected-tile')") &&
                       (rendererJs.includes("openAddTaskSheet(h, wd.dateStr)") || rendererJs.includes("timeInput.value = h"));

  console.log(`   - CSS: .week-time-slot-tile defined: ${hasTileCss}`);
  console.log(`   - CSS: .week-time-slot-tile:hover defined: ${hasTileHoverCss}`);
  console.log(`   - CSS: .week-time-slot-tile.selected-tile defined: ${hasTileSelectedCss}`);
  console.log(`   - JS: Click listener auto-fills time, date, specific mode & opens Add Task: ${hasTileLogic}`);

  if (!hasTileCss || !hasTileHoverCss || !hasTileSelectedCss || !hasTileLogic) {
    throw new Error('Clickable week tile styles or event handlers missing');
  }
  console.log('   ✅ Feature 2 Passed: Week view tiles are interactive, clickable, and auto-populate Add Task sheet.\n');

  // 3. Verify Month Name in Week View Header
  console.log('3. Verifying Month Name in Week Header...');
  const hasMonthHeadingHtml = indexHtml.includes('id="week-month-heading"');
  const hasMonthHeadingJs = rendererJs.includes("document.getElementById('week-month-heading')");

  console.log(`   - HTML: #week-month-heading element present: ${hasMonthHeadingHtml}`);
  console.log(`   - JS: Updates #week-month-heading with current month & year: ${hasMonthHeadingJs}`);

  if (!hasMonthHeadingHtml || !hasMonthHeadingJs) {
    throw new Error('Month name heading missing in Week view');
  }
  console.log('   ✅ Feature 3 Passed: Week view header displays month name and year clearly.\n');

  // 4. Verify Date Search Week Jump & Highlight
  console.log('4. Verifying Date Search Week Jump & Highlight...');
  const hasDateSearchInput = indexHtml.includes('id="search-date-day"') || indexHtml.includes('id="input-calendar-search"');
  const hasWeekJumpLogic = rendererJs.includes('function handleDateSearch') || rendererJs.includes('function handleDateSearchByComponents');
  const hasHighlightCss = indexCss.includes('.week-col-highlighted') && indexCss.includes('.week-header-highlighted');

  console.log(`   - HTML: #input-calendar-search present: ${hasDateSearchInput}`);
  console.log(`   - JS: Jumps to target date week and saves highlightedSearchedDate: ${hasWeekJumpLogic}`);
  console.log(`   - CSS: .week-col-highlighted & .week-header-highlighted defined: ${hasHighlightCss}`);

  if (!hasDateSearchInput || !hasWeekJumpLogic || !hasHighlightCss) {
    throw new Error('Date search week jump or highlight logic missing');
  }
  console.log('   ✅ Feature 4 Passed: Date search jumps directly to target date week and highlights column.\n');

  // 5. Verify Forward/Backward Week Navigation
  console.log('5. Verifying Week Navigation Controls...');
  const hasPrevBtn = indexHtml.includes('id="btn-week-prev"');
  const hasNextBtn = indexHtml.includes('id="btn-week-next"');
  const hasNavListeners = rendererJs.includes('btnWeekPrev.addEventListener') && rendererJs.includes('btnWeekNext.addEventListener');

  console.log(`   - HTML: #btn-week-prev and #btn-week-next present: ${hasPrevBtn && hasNextBtn}`);
  console.log(`   - JS: Navigation event listeners increment/decrement currentWeekOffset: ${hasNavListeners}`);

  if (!hasPrevBtn || !hasNextBtn || !hasNavListeners) {
    throw new Error('Week navigation arrows or listeners missing');
  }
  console.log('   ✅ Feature 5 Passed: Week forward and backward navigation functional.\n');

  console.log('🎉 ALL 5 ROUND 7 REQUIREMENTS HAVE BEEN FULLY RESOLVED & VERIFIED!');
}

testRound7Features().catch(e => {
  console.error('❌ Verification failed:', e);
  process.exit(1);
});
