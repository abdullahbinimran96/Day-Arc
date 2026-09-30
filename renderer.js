// Day Arc Main Renderer Script
// Manages Dashboard (Celestial Sun/Moon/Stars, Hourly Ticks, 12h/24h Formats),
// Namaz Schedule, Daily & Time Management (Day/Week/Calendar, Date Picker, Search & Highlight),
// Bookmarks, Sounds Library, Private Tab, Settings & Taskbar Previews.

document.addEventListener('DOMContentLoaded', async () => {
  // Global State
  let settings = {};
  let namazSettings = [];
  let tasksList = [];
  let bookmarksList = [];
  let soundsList = [];
  let privateBlocklist = [];
  let activeFocusSession = null;
  let activeFocusTimer = null;
  let currentActivePanel = 'dashboard';
  let isPrivateUnlocked = false;
  let privateIdleTimer = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingTimer = null;
  let recordingSeconds = 0;
  let recordedAudioBase64 = null;
  let editingPrayerKey = null;

  // Calendar & Week Navigation State
  let currentTasksView = 'day'; // 'day' or 'week'
  let currentWeekOffset = 0;    // 0 = current week, -1 = last week, +1 = next week
  let highlightedSearchedDate = null;
  let selectedScheduleMode = 'recurring'; // 'recurring' or 'specific'

  // Global fix: Immediate input focus on first click across entire app
  document.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      target.focus();
    }
  });

  // Initialize App
  await loadAllData();
  setupNavigation();
  setupDashboard();
  setupNamaz();
  setupTasks();
  setupBookmarks();
  setupSounds();
  setupPrivateTab();
  setupSettings();
  setupFocusOverlay();
  startLiveClock();

  // Round 10: Auto-resume active task or namaz enforcement on computer startup / reboot
  setTimeout(() => {
    checkAndResumeActiveSessionOnStartup(getTargetNow());
  }, 500);

  // Listen to events from Main / Chrome Extension
  if (window.dayarc) {
    if (window.dayarc.onViolation) {
      window.dayarc.onViolation((data) => {
        console.warn('URL Violation received from Chrome Extension:', data);
        if (activeFocusSession && activeFocusSession.isStrict) {
          showFocusOverlay(activeFocusSession, true);
        }
      });
    }

    if (window.dayarc.onSecurityBlocked) {
      window.dayarc.onSecurityBlocked((data) => {
        console.log('Site blocked by Day Arc Security:', data.url);
      });
    }

    if (window.dayarc.onSessionStartedBackground) {
      window.dayarc.onSessionStartedBackground((sessionData) => {
        console.log('[Renderer] Session started by background service:', sessionData);
        activeFocusSession = {
          ...sessionData,
          name: sessionData.taskName || sessionData.name,
          startTime: Date.now(),
          endTime: sessionData.endTime || (Date.now() + (sessionData.duration_mins || 25) * 60 * 1000)
        };
        if (sessionData.isUrlTask) {
          const overlay = document.getElementById('focus-overlay');
          if (overlay) overlay.classList.add('hidden');
        } else {
          showFocusOverlay(activeFocusSession);
        }
        renderDashboard();
      });
    }

    if (window.dayarc.onSessionStopped) {
      window.dayarc.onSessionStopped(() => {
        console.log('[Renderer] Session stopped. Releasing all focus restrictions.');
        if (activeFocusTimer) clearInterval(activeFocusTimer);
        activeFocusTimer = null;
        activeFocusSession = null;
        const overlay = document.getElementById('focus-overlay');
        if (overlay) overlay.classList.add('hidden');
        if (window.soundEngine) window.soundEngine.stopCurrent();
        renderDashboard();
      });
    }
  }

  // --- TIMEZONE & TIME FORMAT HELPERS (Issues 1 & 2) ---
  function getTargetNow() {
    const gmtOffset = parseFloat(settings.gmt_offset !== undefined && settings.gmt_offset !== null ? settings.gmt_offset : '5');
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const targetMs = utcMs + (gmtOffset * 3600000);
    return new Date(targetMs);
  }

  // Formats any 24h "HH:MM" or "HH:MM:SS" time string into 12h (AM/PM) or 24h based on settings.time_format
  function formatTimeDisplay(timeStr, includeSeconds = false) {
    if (!timeStr || timeStr === '--:--' || timeStr === '--:--:--') return timeStr || '--:--';
    const is12h = settings.time_format !== '24h';
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;

    const h = parts[0];
    const m = parts[1];
    const s = parts[2] !== undefined ? parts[2] : null;

    if (!is12h) {
      if (includeSeconds && s !== null) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const isPm = h >= 12;
    let dispH = h % 12;
    if (dispH === 0) dispH = 12;
    const dispM = String(m).padStart(2, '0');
    const ampm = isPm ? 'PM' : 'AM';

    if (includeSeconds && s !== null) {
      const dispS = String(s).padStart(2, '0');
      return `${dispH}:${dispM}:${dispS} ${ampm}`;
    }

    return `${dispH}:${dispM} ${ampm}`;
  }

  // --- DATA LOADING ---
  async function loadAllData() {
    if (!window.dayarc) return;
    try {
      settings = await window.dayarc.getSettings();
      namazSettings = await window.dayarc.getNamazSettings();
      tasksList = await window.dayarc.getTasks();
      bookmarksList = await window.dayarc.getBookmarks();
      soundsList = await window.dayarc.getSounds();
      privateBlocklist = await window.dayarc.getPrivateBlocklist();
    } catch (e) {
      console.error('Error loading initial data:', e);
    }
  }

  // --- 1. SIDEBAR NAVIGATION ---
  window.switchPanel = switchPanel;

  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const panelId = item.getAttribute('data-panel');
      const btn = item.querySelector('.nav-btn');

      const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panelId) {
          switchPanel(panelId);
        }
      };

      item.addEventListener('click', clickHandler);
      if (btn) btn.addEventListener('click', clickHandler);
    });
  }

  function switchPanel(panelId) {
    if (currentActivePanel === 'private-tab' && panelId !== 'private-tab') {
      lockPrivateTab();
    }

    currentActivePanel = panelId;

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const btn = item.querySelector('.nav-btn');
      const indicator = item.querySelector('.active-indicator');
      const isTarget = item.getAttribute('data-panel') === panelId;

      if (isTarget) {
        btn.classList.add('active');
        if (indicator) indicator.classList.remove('hidden');
      } else {
        btn.classList.remove('active');
        if (indicator) indicator.classList.add('hidden');
      }
    });

    const panels = document.querySelectorAll('.panel-view');
    panels.forEach(p => p.classList.add('hidden'));

    const target = document.getElementById(`panel-${panelId}`);
    if (target) {
      target.classList.remove('hidden');
    }

    if (panelId === 'dashboard') renderDashboard();
    if (panelId === 'namaz') renderNamazPanel();
    if (panelId === 'tasks') renderTasksPanel();
    if (panelId === 'bookmarks') renderBookmarksPanel();
    if (panelId === 'sounds') renderSoundsPanel();
    if (panelId === 'private-tab') renderPrivateTab();
    if (panelId === 'settings') renderSettingsPanel();
  }

  // --- 2. LIVE CLOCK, DASHBOARD, HOURLY TICKS & DIGITAL CLOCK HERO (Round 11) ---
  function startLiveClock() {
    renderArcHourlyMarkers();

    setInterval(() => {
      const targetNow = getTargetNow();
      updateDashboardDigitalClock(targetNow);
      updateArcMarkerPosition(targetNow);
      checkUpNextCountdown(targetNow);
      checkScheduledTasks(targetNow);
    }, 1000);

    const targetNow = getTargetNow();
    updateDashboardDigitalClock(targetNow);
  }

  function setupDashboard() {
    renderDashboard();

    const btnStartUpnext = document.getElementById('btn-start-upnext');
    if (btnStartUpnext) {
      btnStartUpnext.addEventListener('click', () => {
        const nextItem = getNextUpcomingItem();
        if (nextItem) {
          startSession(nextItem);
        } else {
          switchPanel('tasks');
          openAddTaskSheet();
        }
      });
    }

    const btnQuickFocus = document.getElementById('btn-quick-focus');
    if (btnQuickFocus) {
      btnQuickFocus.addEventListener('click', () => {
        startQuickFocus(25);
      });
    }
  }

  async function renderDashboard() {
    renderArcTimeline();
    renderArcHourlyMarkers();
    updateDashboardDigitalClock(getTargetNow());

    // 1. Up Next Item
    const nextItem = getNextUpcomingItem();
    const upnextTitle = document.getElementById('upnext-title');
    const upnextCountdown = document.getElementById('upnext-countdown');
    const upnextDurationText = document.getElementById('upnext-duration-text');
    const upnextBlurDesc = document.getElementById('upnext-blur-desc');
    const btnStartUpnext = document.getElementById('btn-start-upnext');

    if (nextItem) {
      if (upnextTitle) upnextTitle.textContent = nextItem.name;
      if (upnextDurationText) upnextDurationText.textContent = `${nextItem.duration_mins || 30} min`;
      if (btnStartUpnext) btnStartUpnext.innerHTML = `<span class="material-symbols-outlined" style="font-size: 20px; font-variation-settings: 'FILL' 1;">play_arrow</span> Start Session`;

      const diffMins = getMinutesUntil(nextItem.time);
      if (upnextCountdown) {
        const hh = Math.floor(Math.max(0, diffMins) / 60);
        const mm = Math.max(0, diffMins) % 60;
        upnextCountdown.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
      }
      if (upnextBlurDesc) {
        upnextBlurDesc.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">visibility_off</span> Screen will blur for <span id="upnext-duration-text" style="color: #EDEDF3; margin-left: 3px;">${nextItem.duration_mins || 30} min</span>`;
      }
    } else {
      if (upnextTitle) upnextTitle.textContent = 'No Upcoming Tasks';
      if (upnextCountdown) upnextCountdown.textContent = '--:--';
      if (upnextDurationText) upnextDurationText.textContent = '0 min';
      if (btnStartUpnext) btnStartUpnext.innerHTML = `<span class="material-symbols-outlined" style="font-size: 20px; font-variation-settings: 'FILL' 1;">add</span> Add Task`;
      if (upnextBlurDesc) {
        upnextBlurDesc.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">event_available</span> No scheduled focus sessions`;
      }
    }

    // 2. Next Prayer Card (Manual Schedule Only - Issue 2 & 4)
    const nextPrayer = getNextUpcomingPrayer();
    const nextPrayerName = document.getElementById('dash-next-prayer-name');
    const nextPrayerTime = document.getElementById('dash-next-prayer-time');
    const nextPrayerCountdown = document.getElementById('dash-next-prayer-countdown');

    if (nextPrayer && nextPrayer.time !== '--:--') {
      if (nextPrayerName) nextPrayerName.textContent = nextPrayer.name;
      if (nextPrayerTime) nextPrayerTime.textContent = formatTimeDisplay(nextPrayer.time);
      const diffMins = getMinutesUntil(nextPrayer.time);
      const hh = Math.floor(diffMins / 60);
      const mm = diffMins % 60;
      if (nextPrayerCountdown) {
        if (diffMins === 0) {
          nextPrayerCountdown.textContent = 'Prayer time is active now';
        } else {
          nextPrayerCountdown.textContent = `Starts in ${hh > 0 ? `${hh}h ` : ''}${mm} mins`;
        }
      }
    } else {
      if (nextPrayerName) nextPrayerName.textContent = 'No Prayer Scheduled';
      if (nextPrayerTime) nextPrayerTime.textContent = '--:--';
      if (nextPrayerCountdown) nextPrayerCountdown.textContent = 'Configure prayer times in Namaz tab';
    }

    // 3. Update Stats
    if (window.dayarc) {
      try {
        const stats = await window.dayarc.getStatsToday();
        const totalScheduledToday = tasksList.length;
        const statCompleted = document.getElementById('stat-completed-tasks');
        const statStreak = document.getElementById('stat-streak-days');
        const statFocus = document.getElementById('stat-focus-time');

        if (statCompleted) statCompleted.textContent = `${stats.completedToday} / ${totalScheduledToday}`;
        if (statStreak) statStreak.textContent = `${stats.streakDays} Days`;
        if (statFocus) {
          const h = Math.floor(stats.focusMinutesToday / 60);
          const m = stats.focusMinutesToday % 60;
          statFocus.textContent = `${h}h ${m}m`;
        }
      } catch (e) {}
    }

    // 4. Update Location badge with active GMT offset
    const dashLocation = document.getElementById('dash-location-badge');
    if (dashLocation) {
      const gmt = settings.gmt_offset || '5';
      dashLocation.textContent = `${settings.city || 'Karachi'}, ${settings.country || 'PK'} (GMT${parseFloat(gmt) >= 0 ? '+' : ''}${gmt})`;
    }
  }

  // --- DIGITAL CLOCK HERO: HIGH-PRECISION LIVE CLOCK & METADATA (Round 11) ---
  function updateDashboardDigitalClock(targetNow) {
    const is12h = settings.time_format !== '24h';
    const hours24 = targetNow.getHours();
    const minutes = targetNow.getMinutes();
    const seconds = targetNow.getSeconds();

    let displayHours = hours24;
    let ampm = '';

    if (is12h) {
      ampm = hours24 >= 12 ? 'PM' : 'AM';
      displayHours = hours24 % 12;
      if (displayHours === 0) displayHours = 12;
    }

    const hhStr = String(displayHours).padStart(2, '0');
    const mmStr = String(minutes).padStart(2, '0');
    const ssStr = String(seconds).padStart(2, '0');

    // 1. Digital Clock Elements (JetBrains Mono & Amber/Teal Accents)
    const clockHours = document.getElementById('dash-clock-hours');
    const clockMinutes = document.getElementById('dash-clock-minutes');
    const clockSeconds = document.getElementById('dash-clock-seconds');
    const clockAmpm = document.getElementById('dash-clock-ampm');

    if (clockHours) clockHours.textContent = hhStr;
    if (clockMinutes) clockMinutes.textContent = mmStr;
    if (clockSeconds) clockSeconds.textContent = ssStr;

    if (clockAmpm) {
      if (is12h) {
        clockAmpm.textContent = ampm;
        clockAmpm.style.display = 'inline-block';
      } else {
        clockAmpm.style.display = 'none';
      }
    }

    // Top Header Live Clock
    const topClock = document.getElementById('top-live-clock');
    if (topClock) {
      const rawTimeStr = `${String(hours24).padStart(2, '0')}:${mmStr}:${ssStr}`;
      topClock.textContent = formatTimeDisplay(rawTimeStr, true);
    }

    // 2. Date & Day Formatted Cleanly (e.g. "Wednesday, August 19")
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateStr = targetNow.toLocaleDateString('en-US', dateOptions);
    const liveDateEl = document.getElementById('dash-live-date');
    if (liveDateEl) liveDateEl.textContent = dateStr;

    // 3. Current Focus Phase Label
    const phaseLabel = document.getElementById('dash-phase-label');
    if (phaseLabel) {
      if (activeFocusSession) {
        phaseLabel.textContent = `ACTIVE: ${activeFocusSession.name.toUpperCase()}`;
      } else {
        phaseLabel.textContent = (hours24 >= 9 && hours24 < 18) ? 'DEEP FOCUS PHASE' : 'RELAX & REST PHASE';
      }
    }

    // 4. Location Badge with GMT Offset
    const locationBadge = document.getElementById('dash-location-badge');
    if (locationBadge) {
      const gmt = settings.gmt_offset || '5';
      locationBadge.textContent = `${settings.city || 'Karachi'}, ${settings.country || 'Pakistan'} (GMT${parseFloat(gmt) >= 0 ? '+' : ''}${gmt})`;
    }
  }

  // --- HOURLY TICKS ACROSS 24H (Section 2) ---
  function renderArcHourlyMarkers() {
    const ticksGroup = document.getElementById('arc-hourly-ticks');
    if (!ticksGroup) return;
    ticksGroup.innerHTML = '';

    const is12h = settings.time_format !== '24h';

    // 24 Hour Ticks across 1000px width
    for (let h = 0; h <= 24; h++) {
      const x = (h / 24.0) * 1000.0;
      const isMajor = h % 6 === 0; // 0, 6, 12, 18, 24
      const isMid = h % 3 === 0;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x.toFixed(1));
      line.setAttribute('x2', x.toFixed(1));
      line.setAttribute('y1', isMajor ? '135' : (isMid ? '139' : '142'));
      line.setAttribute('y2', '146');
      line.setAttribute('class', isMajor ? 'hour-tick-major' : 'hour-tick');
      ticksGroup.appendChild(line);

      if (isMajor && h <= 24) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x.toFixed(1));
        text.setAttribute('y', '156');
        text.setAttribute('class', 'hour-label');

        if (is12h) {
          if (h === 0 || h === 24) text.textContent = '12 AM';
          else if (h === 6) text.textContent = '6 AM';
          else if (h === 12) text.textContent = '12 PM';
          else if (h === 18) text.textContent = '6 PM';
        } else {
          text.textContent = `${String(h).padStart(2, '0')}:00`;
        }
        ticksGroup.appendChild(text);
      }
    }
  }

  function renderArcTimeline() {
    const dotsContainer = document.getElementById('arc-dots-container');
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';

    const targetNow = getTargetNow();
    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const isFriday = targetNow.getDay() === 5;

    const points = [];

    // Prayers: ONLY plot points for prayers with manual times set! (Jumma on Friday, Zuhr on other days)
    const prayers = isFriday ? ['fajr', 'jumma', 'asr', 'maghrib', 'isha'] : ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
    prayers.forEach(p => {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
      if (setting && setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        const [h, m] = setting.override_time.split(':').map(Number);
        points.push({
          type: 'namaz',
          name: p.charAt(0).toUpperCase() + p.slice(1),
          mins: h * 60 + m,
          color: 'amber'
        });
      }
    });

    // Tasks (teal dots)
    tasksList.forEach(t => {
      if (t.start_time && /^\d{1,2}:\d{2}$/.test(t.start_time)) {
        const [h, m] = t.start_time.split(':').map(Number);
        points.push({
          type: 'task',
          name: t.name,
          mins: h * 60 + m,
          color: 'teal'
        });
      }
    });

    // Plot on SVG Curve
    points.forEach(pt => {
      const x = (pt.mins / 1440.0) * 1000.0;
      const y = 110.0 - 120.0 * Math.sin((Math.PI * x) / 1000.0);
      const isPast = pt.mins < currentMins;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x.toFixed(1));
      circle.setAttribute('cy', y.toFixed(1));
      circle.setAttribute('r', '5');
      circle.setAttribute('class', pt.color === 'amber' ? 'dot-amber' : 'dot-teal');
      if (isPast) circle.setAttribute('opacity', '0.3');

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const timeFormatted = formatTimeDisplay(`${String(Math.floor(pt.mins / 60)).padStart(2, '0')}:${String(pt.mins % 60).padStart(2, '0')}`);
      title.textContent = `${pt.name} (${timeFormatted})`;
      circle.appendChild(title);

      dotsContainer.appendChild(circle);
    });
  }

  function updateArcMarkerPosition(targetNow) {
    const marker = document.getElementById('arc-time-marker');
    if (!marker) return;
    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes() + targetNow.getSeconds() / 60.0;
    const x = (currentMins / 1440.0) * 1000.0;
    const y = 110.0 - 120.0 * Math.sin((Math.PI * x) / 1000.0);

    marker.setAttribute('transform', `translate(${x.toFixed(1)}, 0)`);
    const markerCircle = marker.querySelector('circle');
    if (markerCircle) markerCircle.setAttribute('cy', y.toFixed(1));
  }

  // --- 3. "UP NEXT" 5-MINUTE COUNTDOWN & WINDOWS TASKBAR STATUS (Section 3) ---
  function checkUpNextCountdown(targetNow) {
    if (activeFocusSession) return;
    const nextItem = getNextUpcomingItem();
    if (!nextItem || !nextItem.time || nextItem.time === '--:--') {
      if (window.dayarc && window.dayarc.setTaskbarPreview) {
        window.dayarc.setTaskbarPreview('Day Arc', 'Day Arc - Time Management & Focus');
      }
      return;
    }

    const currentSecs = targetNow.getHours() * 3600 + targetNow.getMinutes() * 60 + targetNow.getSeconds();
    const [th, tm] = nextItem.time.split(':').map(Number);
    let targetSecs = th * 3600 + tm * 60;
    if (targetSecs < currentSecs) targetSecs += 86400;

    const diffSecs = targetSecs - currentSecs;
    const upnextCountdown = document.getElementById('upnext-countdown');

    // Section 3 & Round 14: Countdown begins 5 minutes before scheduled start time! (300 seconds)
    if (diffSecs <= 300 && diffSecs > 0) {
      const mm = Math.floor(diffSecs / 60);
      const ss = diffSecs % 60;
      const countStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

      if (upnextCountdown) {
        upnextCountdown.textContent = countStr;
        upnextCountdown.style.color = '#E7B24C';
        upnextCountdown.style.animation = 'pulseGlow 2s infinite';
      }

      // Windows Taskbar & Title Preview Update (Section 3)
      if (window.dayarc && window.dayarc.setTaskbarPreview) {
        const previewText = `Day Arc — Next: ${nextItem.name} in ${countStr}`;
        window.dayarc.setTaskbarPreview(previewText, previewText);
      }

      // Windows Taskbar Left-Side 5-Minute Countdown Widget (Round 14)
      if (window.dayarc && window.dayarc.updateTaskbarCountdown) {
        window.dayarc.updateTaskbarCountdown({
          taskName: nextItem.name,
          countStr: countStr,
          diffSecs: diffSecs,
          isStartingNow: false
        });
      }
    } else if (diffSecs === 0) {
      if (window.dayarc && window.dayarc.updateTaskbarCountdown) {
        window.dayarc.updateTaskbarCountdown({
          taskName: nextItem.name,
          countStr: '00:00',
          diffSecs: 0,
          isStartingNow: true
        });
      }
    } else {
      if (upnextCountdown) {
        const hh = Math.floor(Math.max(0, diffSecs) / 3600);
        const mm = Math.floor((Math.max(0, diffSecs) % 3600) / 60);
        upnextCountdown.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
        upnextCountdown.style.color = '#EDEDF3';
        upnextCountdown.style.animation = 'none';
      }

      if (window.dayarc && window.dayarc.setTaskbarPreview) {
        window.dayarc.setTaskbarPreview('Day Arc', 'Day Arc - Time Management & Focus');
      }

      if (window.dayarc && window.dayarc.updateTaskbarCountdown) {
        window.dayarc.updateTaskbarCountdown({
          taskName: '',
          countStr: '',
          diffSecs: 9999,
          isStartingNow: false
        });
      }
    }
  }

  function getNextUpcomingItem() {
    const targetNow = getTargetNow();
    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const isFriday = targetNow.getDay() === 5;

    let candidates = [];

    // Prayers: only if user has manually set time and prayer is enabled (Jumma on Friday, Zuhr on other days)
    const prayerKeys = isFriday ? ['fajr', 'jumma', 'asr', 'maghrib', 'isha'] : ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
    prayerKeys.forEach(p => {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
      if (setting && setting.is_enabled && setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        const [h, m] = setting.override_time.split(':').map(Number);
        const mins = h * 60 + m;
        if (mins >= currentMins) {
          candidates.push({
            id: `namaz-${p}`,
            name: `Namaz: ${p.charAt(0).toUpperCase() + p.slice(1)}`,
            time: setting.override_time,
            mins: mins,
            duration_mins: setting.duration_mins || (p === 'jumma' ? 45 : 15),
            task_type: 'blur',
            is_strict: true,
            sound_id: settings.azaan_sound_id || null
          });
        }
      }
    });

    // Tasks (both recurring and specific date)
    const todayStr = formatLocalDateStr(targetNow);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = dayNames[targetNow.getDay()];

    tasksList.forEach(t => {
      const matchesDate = t.specific_date ? t.specific_date === todayStr : (t.repeat_days || []).includes(currentDayName);
      if (matchesDate && t.start_time && /^\d{1,2}:\d{2}$/.test(t.start_time)) {
        const [h, m] = t.start_time.split(':').map(Number);
        const mins = h * 60 + m;
        if (mins >= currentMins) {
          candidates.push({
            ...t,
            time: t.start_time,
            mins: mins
          });
        }
      }
    });

    candidates.sort((a, b) => a.mins - b.mins);
    return candidates[0] || null;
  }

  function getNextUpcomingPrayer() {
    const targetNow = getTargetNow();
    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const isFriday = targetNow.getDay() === 5;
    const prayerKeys = isFriday ? ['fajr', 'jumma', 'asr', 'maghrib', 'isha'] : ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];

    for (const p of prayerKeys) {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
      if (setting && setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        const [h, m] = setting.override_time.split(':').map(Number);
        if (h * 60 + m >= currentMins) {
          return {
            name: p.charAt(0).toUpperCase() + p.slice(1),
            time: setting.override_time
          };
        }
      }
    }

    // Next day first available
    for (const p of prayerKeys) {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
      if (setting && setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        return {
          name: p.charAt(0).toUpperCase() + p.slice(1),
          time: setting.override_time
        };
      }
    }

    return { name: 'Prayer', time: '--:--' };
  }

  function getMinutesUntil(timeStr) {
    if (!timeStr || timeStr === '--:--') return 0;
    const targetNow = getTargetNow();
    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const [h, m] = timeStr.split(':').map(Number);
    let targetMins = h * 60 + m;
    if (targetMins < currentMins) targetMins += 1440;
    return targetMins - currentMins;
  }

  // --- 4. NAMAZ PANEL (Manual Only & Azaan Sound Picker) ---
  function setupNamaz() {
    renderNamazPanel();

    const btnPreview = document.getElementById('btn-preview-azaan');
    if (btnPreview) {
      btnPreview.addEventListener('click', () => {
        const sound = soundsList.find(s => s.id === (settings.azaan_sound_id || 'bundled-azaan-voice')) || soundsList[0];
        if (sound && window.soundEngine) {
          window.soundEngine.play(sound);
        }
      });
    }

    const btnChangeAzaan = document.getElementById('btn-change-azaan-sound');
    const modalSelectAzaan = document.getElementById('modal-select-azaan');
    if (btnChangeAzaan && modalSelectAzaan) {
      btnChangeAzaan.addEventListener('click', () => {
        openAzaanPickerModal();
      });
    }

    document.querySelectorAll('#modal-select-azaan .modal-close').forEach(btn => {
      btn.addEventListener('click', () => modalSelectAzaan.classList.add('hidden'));
    });

    const modalOverride = document.getElementById('modal-override-namaz');
    const formOverride = document.getElementById('form-override-namaz');
    const btnResetAuto = document.getElementById('btn-reset-namaz-auto');

    document.querySelectorAll('#modal-override-namaz .modal-close').forEach(btn => {
      btn.addEventListener('click', () => modalOverride.classList.add('hidden'));
    });

    if (formOverride) {
      formOverride.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editingPrayerKey) return;

        const customTime = document.getElementById('input-override-time').value.trim();
        let setting = namazSettings.find(s => s.prayer_name.toLowerCase() === editingPrayerKey);
        if (!setting) {
          setting = {
            prayer_name: editingPrayerKey.charAt(0).toUpperCase() + editingPrayerKey.slice(1),
            duration_mins: 15,
            is_enabled: 1,
            override_time: customTime,
            after_azaan_action: 'resume'
          };
        } else {
          setting.override_time = customTime || null;
        }

        await saveNamazSetting(setting);
        modalOverride.classList.add('hidden');
        renderNamazPanel();
        renderDashboard();
      });
    }

    if (btnResetAuto) {
      btnResetAuto.addEventListener('click', async () => {
        if (!editingPrayerKey) return;
        const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === editingPrayerKey);
        if (setting) {
          setting.override_time = null;
          await saveNamazSetting(setting);
          modalOverride.classList.add('hidden');
          renderNamazPanel();
          renderDashboard();
        }
      });
    }
  }

  function renderNamazPanel() {
    const container = document.getElementById('namaz-prayers-container');
    if (!container) return;
    container.innerHTML = '';

    const targetNow = getTargetNow();
    const isFriday = targetNow.getDay() === 5;

    const cityLabel = document.getElementById('namaz-city-label');
    if (cityLabel) {
      const gmt = settings.gmt_offset || '5';
      const daySuffix = isFriday ? ' • FRIDAY SCHEDULE (JUMMA ACTIVE)' : '';
      cityLabel.textContent = `${(settings.city || 'Karachi').toUpperCase()}, ${(settings.country || 'Pakistan').toUpperCase()} (GMT${parseFloat(gmt) >= 0 ? '+' : ''}${gmt})${daySuffix}`;
    }

    const azaanNameLabel = document.getElementById('namaz-active-sound-name');
    if (azaanNameLabel) {
      const activeSound = soundsList.find(s => s.id === (settings.azaan_sound_id || 'bundled-azaan-voice'));
      azaanNameLabel.textContent = activeSound ? activeSound.name : 'Azaan Voice (Bundled)';
    }

    // Daily active prayers: on Friday Jumma replaces Zuhr; on other days Zuhr is active
    const prayers = isFriday
      ? [
          { key: 'fajr', name: 'Fajr' },
          { key: 'jumma', name: 'Jumma (Friday Prayer)' },
          { key: 'asr', name: 'Asr' },
          { key: 'maghrib', name: 'Maghrib' },
          { key: 'isha', name: 'Isha' }
        ]
      : [
          { key: 'fajr', name: 'Fajr' },
          { key: 'zuhr', name: 'Zuhr' },
          { key: 'asr', name: 'Asr' },
          { key: 'maghrib', name: 'Maghrib' },
          { key: 'isha', name: 'Isha' }
        ];

    const nextUpcoming = getNextUpcomingPrayer();

    prayers.forEach(p => {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p.key) || {
        prayer_name: p.name,
        duration_mins: p.key === 'jumma' ? 45 : (p.key === 'zuhr' ? 30 : 15),
        is_enabled: 1,
        override_time: null,
        after_azaan_action: 'resume'
      };

      const hasTimeSet = !!setting.override_time;
      const displayTime = hasTimeSet ? formatTimeDisplay(setting.override_time) : '--:--';
      const isUpcoming = nextUpcoming && nextUpcoming.name.toLowerCase() === p.key && hasTimeSet;

      const row = document.createElement('div');
      row.className = `prayer-item-row ${isUpcoming ? 'upcoming' : ''}`;

      row.innerHTML = `
        <div class="prayer-row-main">
          <div class="prayer-left-info">
            <div class="prayer-time-text ${isUpcoming ? 'upcoming' : ''}" style="${!hasTimeSet ? 'opacity: 0.45;' : ''}">
              ${displayTime}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 class="prayer-name-heading ${isUpcoming ? 'upcoming' : ''}">${p.name}</h3>
                ${isUpcoming ? '<span class="badge-amber" style="font-size: 10px;">UPCOMING</span>' : ''}
                ${p.key === 'jumma' ? '<span class="badge-amber" style="font-size: 9px; font-weight: 800;">FRIDAY ONLY</span>' : ''}
                ${hasTimeSet ? '<span style="font-size: 10px; color: #4FD6C4; font-family: var(--font-mono); font-weight: 700;">(Manual)</span>' : '<span style="font-size: 10px; color: #888B9E;">(Not set)</span>'}
              </div>
              <button class="btn-edit-override">
                <span class="material-symbols-outlined" style="font-size: 13px;">${hasTimeSet ? 'edit' : 'add'}</span>
                ${hasTimeSet ? 'Edit prayer time' : 'Set prayer time'}
              </button>
            </div>
          </div>

          <div class="prayer-right-controls">
            <div class="dur-pill-group">
              <button class="dur-btn ${setting.duration_mins === 15 ? 'active' : ''}" data-dur="15">15m</button>
              <button class="dur-btn ${setting.duration_mins === 30 ? 'active' : ''}" data-dur="30">30m</button>
              <button class="dur-btn ${setting.duration_mins === 45 ? 'active' : ''}" data-dur="45">45m</button>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined prayer-eye-icon" style="font-size: 18px; color: ${setting.is_enabled ? '#E7B24C' : '#888B9E'};">visibility_off</span>
              <label class="toggle-switch">
                <input type="checkbox" class="prayer-enable-toggle" ${setting.is_enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;

      const durBtns = row.querySelectorAll('.dur-btn');
      durBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const dur = parseInt(btn.getAttribute('data-dur'));
          setting.duration_mins = dur;
          await saveNamazSetting(setting);
          renderNamazPanel();
        });
      });

      const toggle = row.querySelector('.prayer-enable-toggle');
      const eyeIcon = row.querySelector('.prayer-eye-icon');
      if (toggle) {
        toggle.addEventListener('change', async (e) => {
          e.stopPropagation();
          setting.is_enabled = toggle.checked ? 1 : 0;
          if (eyeIcon) eyeIcon.style.color = toggle.checked ? '#E7B24C' : '#888B9E';
          await saveNamazSetting(setting);
          renderDashboard();
        });
      }

      const editBtn = row.querySelector('.btn-edit-override');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openNamazOverrideModal(p.key, p.name, setting.override_time);
        });
      }

      container.appendChild(row);
    });

    // If not Friday, provide an extra card to pre-configure Friday Jumma time
    if (!isFriday) {
      const jummaSetting = namazSettings.find(s => s.prayer_name.toLowerCase() === 'jumma') || {
        prayer_name: 'Jumma',
        duration_mins: 45,
        is_enabled: 1,
        override_time: null
      };

      const jummaRow = document.createElement('div');
      jummaRow.className = 'prayer-item-row';
      jummaRow.style.opacity = '0.75';
      jummaRow.style.borderStyle = 'dashed';

      const hasJummaTime = !!jummaSetting.override_time;
      const displayJummaTime = hasJummaTime ? formatTimeDisplay(jummaSetting.override_time) : '--:--';

      jummaRow.innerHTML = `
        <div class="prayer-row-main">
          <div class="prayer-left-info">
            <div class="prayer-time-text" style="${!hasJummaTime ? 'opacity: 0.45;' : ''}">
              ${displayJummaTime}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 class="prayer-name-heading">Jumma</h3>
                <span class="badge-amber" style="font-size: 9px; font-weight: 800;">FRIDAYS ONLY (REPLACES ZUHR)</span>
                ${hasJummaTime ? '<span style="font-size: 10px; color: #4FD6C4; font-family: var(--font-mono); font-weight: 700;">(Manual)</span>' : '<span style="font-size: 10px; color: #888B9E;">(Not set)</span>'}
              </div>
              <button class="btn-edit-override">
                <span class="material-symbols-outlined" style="font-size: 13px;">${hasJummaTime ? 'edit' : 'add'}</span>
                ${hasJummaTime ? 'Edit Friday Jumma time' : 'Set Friday Jumma time'}
              </button>
            </div>
          </div>

          <div class="prayer-right-controls">
            <div class="dur-pill-group">
              <button class="dur-btn ${jummaSetting.duration_mins === 15 ? 'active' : ''}" data-dur="15">15m</button>
              <button class="dur-btn ${jummaSetting.duration_mins === 30 ? 'active' : ''}" data-dur="30">30m</button>
              <button class="dur-btn ${jummaSetting.duration_mins === 45 ? 'active' : ''}" data-dur="45">45m</button>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined prayer-eye-icon" style="font-size: 18px; color: ${jummaSetting.is_enabled ? '#E7B24C' : '#888B9E'};">visibility_off</span>
              <label class="toggle-switch">
                <input type="checkbox" class="prayer-enable-toggle" ${jummaSetting.is_enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;

      const durBtns = jummaRow.querySelectorAll('.dur-btn');
      durBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const dur = parseInt(btn.getAttribute('data-dur'));
          jummaSetting.duration_mins = dur;
          await saveNamazSetting(jummaSetting);
          renderNamazPanel();
        });
      });

      const toggle = jummaRow.querySelector('.prayer-enable-toggle');
      const eyeIcon = jummaRow.querySelector('.prayer-eye-icon');
      if (toggle) {
        toggle.addEventListener('change', async (e) => {
          e.stopPropagation();
          jummaSetting.is_enabled = toggle.checked ? 1 : 0;
          if (eyeIcon) eyeIcon.style.color = toggle.checked ? '#E7B24C' : '#888B9E';
          await saveNamazSetting(jummaSetting);
          renderDashboard();
        });
      }

      const editBtn = jummaRow.querySelector('.btn-edit-override');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openNamazOverrideModal('jumma', 'Jumma', jummaSetting.override_time);
        });
      }

      container.appendChild(jummaRow);
    }
  }

  function openNamazOverrideModal(key, name, currentOverride) {
    editingPrayerKey = key;
    const modal = document.getElementById('modal-override-namaz');
    const title = document.getElementById('override-modal-title');
    const customTimeInput = document.getElementById('input-override-time');

    if (modal) {
      if (title) title.textContent = `Set ${name} Prayer Time`;
      if (customTimeInput) {
        customTimeInput.value = currentOverride || '13:00';
        setTimeout(() => customTimeInput.focus(), 50);
      }
      modal.classList.remove('hidden');
    }
  }

  function openAzaanPickerModal() {
    const modal = document.getElementById('modal-select-azaan');
    const listContainer = document.getElementById('azaan-sound-options-list');
    if (!modal || !listContainer) return;

    listContainer.innerHTML = '';
    const currentSelectedId = settings.azaan_sound_id || 'bundled-azaan-voice';

    soundsList.forEach(sound => {
      const isSelected = sound.id === currentSelectedId;
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '10px 14px';
      item.style.background = isSelected ? 'rgba(231,178,76,0.12)' : '#11121B';
      item.style.border = isSelected ? '1px solid #E7B24C' : '1px solid var(--border)';
      item.style.borderRadius = '8px';
      item.style.cursor = 'pointer';

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <button type="button" class="btn-picker-preview icon-btn" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border);">
            <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
          </button>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: #EDEDF3;">
              ${sound.name}
              ${sound.id.startsWith('bundled-') ? '<span style="font-size: 9px; color: #4FD6C4; margin-left: 6px; font-weight: 700;">(Bundled)</span>' : ''}
            </div>
            <div style="font-family: var(--font-mono); font-size: 10px; color: #888B9E;">${sound.duration}</div>
          </div>
        </div>

        <div>
          ${isSelected 
            ? '<span class="material-symbols-outlined" style="color: #E7B24C; font-size: 20px;">check_circle</span>'
            : '<button type="button" class="dur-btn btn-choose-azaan" style="padding: 4px 10px; font-size: 11px;">Select</button>'
          }
        </div>
      `;

      item.querySelector('.btn-picker-preview').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.soundEngine) {
          window.soundEngine.play(sound);
        }
      });

      const chooseHandler = async () => {
        settings.azaan_sound_id = sound.id;
        if (window.dayarc) {
          await window.dayarc.setSetting('azaan_sound_id', sound.id);
        }
        modal.classList.add('hidden');
        renderNamazPanel();
      };

      item.addEventListener('click', chooseHandler);
      const chooseBtn = item.querySelector('.btn-choose-azaan');
      if (chooseBtn) chooseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chooseHandler();
      });

      listContainer.appendChild(item);
    });

    modal.classList.remove('hidden');
  }

  async function saveNamazSetting(setting) {
    if (!window.dayarc) return;
    await window.dayarc.updateNamazSetting(
      setting.prayer_name,
      setting.duration_mins,
      setting.is_enabled,
      setting.override_time,
      setting.after_azaan_action
    );
    namazSettings = await window.dayarc.getNamazSettings();
  }

  // --- 5. DAILY & TIME MANAGEMENT (Custom Date Picker, Segmented Inputs & Week Sync - Round 8) ---
  function formatLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseLocalDateSafe(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
    return new Date();
  }

  let activeDatePickerTarget = 'search'; // 'search' or 'task'
  let datePickerViewingDate = new Date();

  function openCustomDatePicker(anchorElem, targetType, initialDateStr) {
    const popover = document.getElementById('custom-date-picker-popover');
    if (!popover) return;

    activeDatePickerTarget = targetType;
    if (initialDateStr) {
      datePickerViewingDate = parseLocalDateSafe(initialDateStr);
    } else {
      datePickerViewingDate = getTargetNow();
    }

    if (anchorElem) {
      const rect = anchorElem.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;
      if (left + 265 > window.innerWidth) {
        left = window.innerWidth - 275;
      }
      if (top + 280 > window.innerHeight) {
        top = Math.max(10, rect.top - 280);
      }
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }

    renderCustomDatePicker();
    popover.classList.remove('hidden');
  }

  function closeCustomDatePicker() {
    const popover = document.getElementById('custom-date-picker-popover');
    if (popover) popover.classList.add('hidden');
  }

  function renderCustomDatePicker() {
    const title = document.getElementById('dp-month-year-title');
    const grid = document.getElementById('dp-days-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const year = datePickerViewingDate.getFullYear();
    const month = datePickerViewingDate.getMonth();

    if (title) {
      title.textContent = datePickerViewingDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const todayStr = formatLocalDateStr(getTargetNow());
    let currentSelectedStr = '';
    if (activeDatePickerTarget === 'search') {
      const d = document.getElementById('search-date-day')?.value;
      const m = document.getElementById('search-date-month')?.value;
      const y = document.getElementById('search-date-year')?.value;
      if (d && m && y) currentSelectedStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else {
      currentSelectedStr = document.getElementById('input-task-date')?.value || '';
    }

    const firstDay = new Date(year, month, 1, 12, 0, 0);
    const startDayIndex = (firstDay.getDay() + 6) % 7; // Mon = 0 .. Sun = 6
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Previous month padding
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dp-day-btn other-month';
      btn.textContent = dayNum;
      btn.addEventListener('click', () => {
        datePickerViewingDate.setMonth(datePickerViewingDate.getMonth() - 1);
        datePickerViewingDate.setDate(dayNum);
        selectDateFromPicker(formatLocalDateStr(datePickerViewingDate));
      });
      grid.appendChild(btn);
    }

    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const cellDate = new Date(year, month, d, 12, 0, 0);
      const dateStr = formatLocalDateStr(cellDate);
      const isToday = (dateStr === todayStr);
      const isSelected = (dateStr === currentSelectedStr || dateStr === highlightedSearchedDate);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dp-day-btn ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
      btn.textContent = d;
      btn.addEventListener('click', () => {
        selectDateFromPicker(dateStr);
      });
      grid.appendChild(btn);
    }

    // Next month padding
    const remainingSlots = 42 - (startDayIndex + totalDaysInMonth);
    for (let i = 1; i <= remainingSlots && (startDayIndex + totalDaysInMonth + i - 1) % 7 !== 0; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dp-day-btn other-month';
      btn.textContent = i;
      btn.addEventListener('click', () => {
        datePickerViewingDate.setMonth(datePickerViewingDate.getMonth() + 1);
        datePickerViewingDate.setDate(i);
        selectDateFromPicker(formatLocalDateStr(datePickerViewingDate));
      });
      grid.appendChild(btn);
    }
  }

  function selectDateFromPicker(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    const dayStr = String(d).padStart(2, '0');
    const monthStr = String(m).padStart(2, '0');
    const yearStr = String(y);

    if (activeDatePickerTarget === 'search') {
      const sD = document.getElementById('search-date-day');
      const sM = document.getElementById('search-date-month');
      const sY = document.getElementById('search-date-year');
      if (sD) sD.value = dayStr;
      if (sM) sM.value = monthStr;
      if (sY) sY.value = yearStr;

      handleDateSearchByComponents(yearStr, monthStr, dayStr);
    } else {
      const tD = document.getElementById('task-date-day');
      const tM = document.getElementById('task-date-month');
      const tY = document.getElementById('task-date-year');
      const hiddenInput = document.getElementById('input-task-date');
      if (tD) tD.value = dayStr;
      if (tM) tM.value = monthStr;
      if (tY) tY.value = yearStr;
      if (hiddenInput) hiddenInput.value = dateStr;

      // Sync Week View immediately in the background!
      syncWeekViewToDate(dateStr);
    }
    closeCustomDatePicker();
  }

  function syncWeekViewToDate(dateStr) {
    if (!dateStr) return;
    const target = parseLocalDateSafe(dateStr);
    const targetNow = getTargetNow();

    const nowDayIdx = (targetNow.getDay() + 6) % 7; // Mon=0..Sun=6
    const nowMon = new Date(targetNow.getFullYear(), targetNow.getMonth(), targetNow.getDate(), 12, 0, 0);
    nowMon.setDate(nowMon.getDate() - nowDayIdx);

    const targetDayIdx = (target.getDay() + 6) % 7;
    const targetMon = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 12, 0, 0);
    targetMon.setDate(targetMon.getDate() - targetDayIdx);

    const diffDays = Math.round((targetMon.getTime() - nowMon.getTime()) / (24 * 60 * 60 * 1000));
    currentWeekOffset = Math.round(diffDays / 7);
    highlightedSearchedDate = dateStr;

    renderWeekGrid();
  }

  function handleDateSearchByComponents(year, month, day) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    syncWeekViewToDate(dateStr);

    const btnWeek = document.getElementById('btn-view-week');
    if (btnWeek) btnWeek.click();
  }

  function setupTasks() {
    renderTasksPanel();

    // 2-Way Switcher: Day / Week
    const btnDay = document.getElementById('btn-view-day');
    const btnWeek = document.getElementById('btn-view-week');
    const viewDay = document.getElementById('tasks-day-view');
    const viewWeek = document.getElementById('tasks-week-view');

    function setTaskViewMode(mode) {
      currentTasksView = mode;
      if (btnDay) btnDay.classList.toggle('active', mode === 'day');
      if (btnWeek) btnWeek.classList.toggle('active', mode === 'week');

      if (viewDay) viewDay.classList.toggle('hidden', mode !== 'day');
      if (viewWeek) viewWeek.classList.toggle('hidden', mode !== 'week');

      if (mode === 'day') renderDaySchedule();
      if (mode === 'week') renderWeekGrid();
    }

    if (btnDay) btnDay.addEventListener('click', () => setTaskViewMode('day'));
    if (btnWeek) btnWeek.addEventListener('click', () => setTaskViewMode('week'));

    // Week Navigation (Previous / Next Week)
    const btnWeekPrev = document.getElementById('btn-week-prev');
    const btnWeekNext = document.getElementById('btn-week-next');

    if (btnWeekPrev) {
      btnWeekPrev.addEventListener('click', () => {
        currentWeekOffset--;
        renderWeekGrid();
      });
    }

    if (btnWeekNext) {
      btnWeekNext.addEventListener('click', () => {
        currentWeekOffset++;
        renderWeekGrid();
      });
    }

    // Segmented Date Search Inputs (DD / MM / YYYY)
    const sDay = document.getElementById('search-date-day');
    const sMonth = document.getElementById('search-date-month');
    const sYear = document.getElementById('search-date-year');
    const btnSearchPicker = document.getElementById('btn-open-search-picker');

    function triggerSegmentedSearch() {
      const d = sDay?.value.trim();
      const m = sMonth?.value.trim();
      let y = sYear?.value.trim();
      if (!y) y = String(getTargetNow().getFullYear());
      if (d && m) {
        handleDateSearchByComponents(y, m, d);
      }
    }

    if (sDay) {
      sDay.addEventListener('input', () => {
        if (sDay.value.length === 2 && sMonth) sMonth.focus();
      });
      sDay.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSegmentedSearch(); });
    }
    if (sMonth) {
      sMonth.addEventListener('input', () => {
        if (sMonth.value.length === 2 && sYear) sYear.focus();
      });
      sMonth.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !sMonth.value && sDay) sDay.focus();
        if (e.key === 'Enter') triggerSegmentedSearch();
      });
    }
    if (sYear) {
      sYear.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !sYear.value && sMonth) sMonth.focus();
        if (e.key === 'Enter') triggerSegmentedSearch();
      });
    }

    if (btnSearchPicker) {
      btnSearchPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        const curDateStr = (sYear?.value && sMonth?.value && sDay?.value)
          ? `${sYear.value}-${sMonth.value.padStart(2, '0')}-${sDay.value.padStart(2, '0')}`
          : formatLocalDateStr(getTargetNow());
        openCustomDatePicker(btnSearchPicker, 'search', curDateStr);
      });
    }

    // Add Task Specific Date Segmented Inputs & Custom Picker
    const tDay = document.getElementById('task-date-day');
    const tMonth = document.getElementById('task-date-month');
    const tYear = document.getElementById('task-date-year');
    const btnTaskDatePicker = document.getElementById('btn-open-task-date-picker');

    function updateTaskDateFromSegments() {
      const d = tDay?.value.trim();
      const m = tMonth?.value.trim();
      let y = tYear?.value.trim();
      if (!y) y = String(getTargetNow().getFullYear());
      if (d && m) {
        const fullDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        const hiddenInput = document.getElementById('input-task-date');
        if (hiddenInput) hiddenInput.value = fullDateStr;
        // Sync Week View immediately!
        syncWeekViewToDate(fullDateStr);
      }
    }

    if (tDay) {
      tDay.addEventListener('input', () => {
        if (tDay.value.length === 2 && tMonth) tMonth.focus();
        updateTaskDateFromSegments();
      });
    }
    if (tMonth) {
      tMonth.addEventListener('input', () => {
        if (tMonth.value.length === 2 && tYear) tYear.focus();
        updateTaskDateFromSegments();
      });
      tMonth.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !tMonth.value && tDay) tDay.focus();
      });
    }
    if (tYear) {
      tYear.addEventListener('input', () => updateTaskDateFromSegments());
      tYear.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !tYear.value && tMonth) tMonth.focus();
      });
    }

    if (btnTaskDatePicker) {
      btnTaskDatePicker.addEventListener('click', (e) => {
        e.stopPropagation();
        const curDateStr = document.getElementById('input-task-date')?.value || formatLocalDateStr(getTargetNow());
        openCustomDatePicker(btnTaskDatePicker, 'task', curDateStr);
      });
    }

    // Custom Date Picker Modal Navigation & Buttons
    const dpPrevMonth = document.getElementById('dp-btn-prev-month');
    const dpNextMonth = document.getElementById('dp-btn-next-month');
    const dpBtnToday = document.getElementById('dp-btn-today');
    const dpBtnTomorrow = document.getElementById('dp-btn-tomorrow');
    const dpBtnClose = document.getElementById('dp-btn-close');

    if (dpPrevMonth) {
      dpPrevMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        datePickerViewingDate.setMonth(datePickerViewingDate.getMonth() - 1);
        renderCustomDatePicker();
      });
    }
    if (dpNextMonth) {
      dpNextMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        datePickerViewingDate.setMonth(datePickerViewingDate.getMonth() + 1);
        renderCustomDatePicker();
      });
    }
    if (dpBtnToday) {
      dpBtnToday.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDateFromPicker(formatLocalDateStr(getTargetNow()));
      });
    }
    if (dpBtnTomorrow) {
      dpBtnTomorrow.addEventListener('click', (e) => {
        e.stopPropagation();
        const tom = getTargetNow();
        tom.setDate(tom.getDate() + 1);
        selectDateFromPicker(formatLocalDateStr(tom));
      });
    }
    if (dpBtnClose) {
      dpBtnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCustomDatePicker();
      });
    }

    // Close Custom Date Picker when clicking outside
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('custom-date-picker-popover');
      if (popover && !popover.classList.contains('hidden')) {
        if (!e.target.closest('#custom-date-picker-popover') && 
            !e.target.closest('#btn-open-search-picker') && 
            !e.target.closest('#btn-open-task-date-picker')) {
          closeCustomDatePicker();
        }
      }
    });

    // Schedule Mode Toggle in Add Task Sheet (Recurring vs Specific Date)
    const btnSchedRec = document.getElementById('btn-sched-recurring');
    const btnSchedSpec = document.getElementById('btn-sched-specific');
    const secRec = document.getElementById('section-task-repeat-days');
    const secSpec = document.getElementById('section-task-specific-date');

    if (btnSchedRec && btnSchedSpec) {
      btnSchedRec.addEventListener('click', () => {
        selectedScheduleMode = 'recurring';
        btnSchedRec.classList.add('active');
        btnSchedSpec.classList.remove('active');
        secRec.classList.remove('hidden');
        secSpec.classList.add('hidden');
      });

      btnSchedSpec.addEventListener('click', () => {
        selectedScheduleMode = 'specific';
        btnSchedSpec.classList.add('active');
        btnSchedRec.classList.remove('active');
        secSpec.classList.remove('hidden');
        secRec.classList.add('hidden');
        const hiddenInput = document.getElementById('input-task-date');
        if (hiddenInput && !hiddenInput.value) {
          const todayStr = formatLocalDateStr(getTargetNow());
          hiddenInput.value = todayStr;
          const parts = todayStr.split('-');
          if (tDay) tDay.value = parts[2];
          if (tMonth) tMonth.value = parts[1];
          if (tYear) tYear.value = parts[0];
          syncWeekViewToDate(todayStr);
        }
      });
    }

    // Side Sheet Controls
    const btnOpenAdd = document.getElementById('btn-open-add-task');
    const btnCloseAdd = document.getElementById('btn-close-task-sheet');
    const btnCancelAdd = document.getElementById('btn-cancel-task');
    const btnDeleteSheet = document.getElementById('btn-delete-task-sheet');
    const taskSheet = document.getElementById('add-task-sheet');

    if (btnOpenAdd) {
      btnOpenAdd.addEventListener('click', () => {
        openAddTaskSheet();
      });
    }
    if (btnCloseAdd) btnCloseAdd.addEventListener('click', () => taskSheet.classList.add('hidden'));
    if (btnCancelAdd) btnCancelAdd.addEventListener('click', () => taskSheet.classList.add('hidden'));

    if (btnDeleteSheet) {
      btnDeleteSheet.addEventListener('click', async () => {
        const taskId = document.getElementById('input-task-id')?.value;
        const taskName = document.getElementById('input-task-name')?.value || 'this task';
        if (!taskId) return;
        if (confirm(`Are you sure you want to delete "${taskName}"?`)) {
          if (window.dayarc) {
            await window.dayarc.deleteTask(taskId);
            tasksList = await window.dayarc.getTasks();
            taskSheet.classList.add('hidden');
            renderTasksPanel();
            renderDashboard();
          }
        }
      });
    }

    // Task Type Selection (Blur vs URL)
    const btnTypeBlur = document.getElementById('btn-type-blur');
    const btnTypeUrl = document.getElementById('btn-type-url');
    const allowedUrlsSection = document.getElementById('allowed-urls-section');
    let selectedTaskType = 'blur';

    if (btnTypeBlur && btnTypeUrl) {
      btnTypeBlur.addEventListener('click', () => {
        selectedTaskType = 'blur';
        btnTypeBlur.classList.add('active');
        btnTypeUrl.classList.remove('active');
        allowedUrlsSection.classList.add('hidden');
      });

      btnTypeUrl.addEventListener('click', () => {
        selectedTaskType = 'url';
        btnTypeUrl.classList.add('active');
        btnTypeBlur.classList.remove('active');
        allowedUrlsSection.classList.remove('hidden');
        if (document.querySelectorAll('.allowed-url-input').length === 0) {
          addUrlInputRow('');
        }
      });
    }

    const btnAddUrlRow = document.getElementById('btn-add-url-row');
    const allowedUrlsList = document.getElementById('allowed-urls-list');

    function addUrlInputRow(initialVal = '') {
      let cleanVal = initialVal ? initialVal.replace(/^(https?:\/\/)+/gi, '') : '';
      if (cleanVal.length > 0) cleanVal = 'https://' + cleanVal;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.background = '#11121B';
      row.style.border = '1px solid var(--border)';
      row.style.borderRadius = '8px';
      row.style.padding = '6px 10px';
      row.innerHTML = `
        <span class="material-symbols-outlined" style="color: #4FD6C4; font-size: 16px;">language</span>
        <input type="text" value="${cleanVal}" placeholder="https://youtube.com/watch?v=..." class="allowed-url-input" style="flex: 1; background: transparent; border: none; font-family: var(--font-mono); font-size: 12px; color: #EDEDF3; outline: none;">
        <button type="button" class="btn-remove-url icon-btn" style="width: 24px; height: 24px;">
          <span class="material-symbols-outlined" style="font-size: 16px; color: #888B9E;">delete</span>
        </button>
      `;
      const input = row.querySelector('.allowed-url-input');
      input.addEventListener('blur', () => {
        let v = input.value.trim();
        if (v.length > 0) {
          let clean = v.replace(/^(https?:\/\/)+/gi, '').trim();
          if (clean.length > 0) input.value = 'https://' + clean;
        }
      });
      row.querySelector('.btn-remove-url').addEventListener('click', () => row.remove());
      allowedUrlsList.appendChild(row);
      setTimeout(() => input.focus(), 50);
    }

    if (btnAddUrlRow) btnAddUrlRow.addEventListener('click', () => addUrlInputRow());

    const dayPills = document.querySelectorAll('.day-pill');
    dayPills.forEach(pill => pill.addEventListener('click', () => pill.classList.toggle('active')));

    const btnEveryday = document.getElementById('btn-everyday-shortcut');
    if (btnEveryday) btnEveryday.addEventListener('click', () => dayPills.forEach(p => p.classList.add('active')));

    // Live Duration Calculation & Validation for Start Time + End Time (Round 13)
    const timeStartInput = document.getElementById('input-task-time');
    const timeEndInput = document.getElementById('input-task-end-time');
    const durationBadge = document.getElementById('task-calculated-duration-badge');
    const validationError = document.getElementById('task-time-validation-error');
    const btnSubmitTask = document.getElementById('btn-submit-task');

    function updateTaskDurationPreview() {
      if (!timeStartInput || !timeEndInput) return 0;
      const startVal = timeStartInput.value;
      const endVal = timeEndInput.value;

      if (!startVal || !endVal || !/^\d{1,2}:\d{2}$/.test(startVal) || !/^\d{1,2}:\d{2}$/.test(endVal)) {
        if (validationError) validationError.classList.remove('hidden');
        if (durationBadge) {
          durationBadge.textContent = 'Invalid Time';
          durationBadge.style.color = '#ffb4ab';
          durationBadge.style.borderColor = 'rgba(255, 180, 171, 0.4)';
          durationBadge.style.background = 'rgba(255, 180, 171, 0.1)';
        }
        if (btnSubmitTask) {
          btnSubmitTask.disabled = true;
          btnSubmitTask.style.opacity = '0.5';
          btnSubmitTask.style.cursor = 'not-allowed';
        }
        return 0;
      }

      const [sh, sm] = startVal.split(':').map(Number);
      const [eh, em] = endVal.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const diffMins = endMins - startMins;

      if (diffMins <= 0) {
        // Validation Error: End Time is earlier than or equal to Start Time
        if (validationError) validationError.classList.remove('hidden');
        if (durationBadge) {
          durationBadge.textContent = '0 min';
          durationBadge.style.color = '#ffb4ab';
          durationBadge.style.borderColor = 'rgba(255, 180, 171, 0.4)';
          durationBadge.style.background = 'rgba(255, 180, 171, 0.1)';
        }
        if (btnSubmitTask) {
          btnSubmitTask.disabled = true;
          btnSubmitTask.style.opacity = '0.5';
          btnSubmitTask.style.cursor = 'not-allowed';
        }
        return 0;
      } else {
        // Valid Time Range
        if (validationError) validationError.classList.add('hidden');
        if (durationBadge) {
          const hoursPart = Math.floor(diffMins / 60);
          const minsPart = diffMins % 60;
          let label = `${diffMins} min`;
          if (hoursPart > 0) {
            label = `${hoursPart}h${minsPart > 0 ? ` ${minsPart}m` : ''} (${diffMins} min)`;
          }
          durationBadge.textContent = label;
          durationBadge.style.color = '#4FD6C4';
          durationBadge.style.borderColor = 'rgba(79, 214, 196, 0.3)';
          durationBadge.style.background = 'rgba(79, 214, 196, 0.12)';
        }
        if (btnSubmitTask) {
          btnSubmitTask.disabled = false;
          btnSubmitTask.style.opacity = '1';
          btnSubmitTask.style.cursor = 'pointer';
        }
        return diffMins;
      }
    }

    if (timeStartInput) {
      timeStartInput.addEventListener('input', updateTaskDurationPreview);
      timeStartInput.addEventListener('change', updateTaskDurationPreview);
    }
    if (timeEndInput) {
      timeEndInput.addEventListener('input', updateTaskDurationPreview);
      timeEndInput.addEventListener('change', updateTaskDurationPreview);
    }

    // Add / Edit Task Form Submission
    const formAddTask = document.getElementById('form-add-task');
    if (formAddTask) {
      formAddTask.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('input-task-id')?.value || null;
        const name = document.getElementById('input-task-name').value.trim();
        const startTime = document.getElementById('input-task-time').value;
        const endTime = document.getElementById('input-task-end-time').value;
        const durationMins = updateTaskDurationPreview();

        if (durationMins <= 0) {
          alert('Validation Error: End time must be after start time.');
          return;
        }

        const isStrict = document.getElementById('check-strict-mode').checked;
        const soundId = document.getElementById('select-task-sound').value;

        const allowedUrls = Array.from(document.querySelectorAll('.allowed-url-input'))
          .map(inp => inp.value.trim())
          .map(u => {
            let clean = u.replace(/^(https?:\/\/)+/gi, '').trim();
            return clean.length > 0 ? 'https://' + clean : '';
          })
          .filter(v => v.length > 8);

        if (selectedTaskType === 'url' && allowedUrls.length === 0) {
          alert('Validation Error: URL Tasks require at least one valid allowed URL.');
          return;
        }

        const repeatDays = Array.from(document.querySelectorAll('.day-pill.active'))
          .map(p => p.getAttribute('data-day'));

        const specificDate = selectedScheduleMode === 'specific' 
          ? document.getElementById('input-task-date').value || null 
          : null;

        const taskData = {
          name,
          start_time: startTime,
          end_time: endTime,
          duration_mins: durationMins,
          task_type: selectedTaskType,
          allowed_urls: allowedUrls,
          repeat_days: selectedScheduleMode === 'recurring' ? repeatDays : [],
          specific_date: specificDate,
          is_strict: isStrict ? 1 : 0,
          sound_id: soundId || null
        };
        if (taskId) {
          taskData.id = taskId;
        }

        if (window.dayarc) {
          await window.dayarc.saveTask(taskData);
          tasksList = await window.dayarc.getTasks();
        }

        if (formAddTask && typeof formAddTask.reset === 'function') {
          formAddTask.reset();
        }
        allowedUrlsList.innerHTML = '';
        taskSheet.classList.add('hidden');
        renderTasksPanel();
        renderDashboard();
      });
    }
  }

  // Helper: Open Add Task Sheet with Optional Prefilled Time and Date
  function openAddTaskSheet(time, dateStr) {
    const taskSheet = document.getElementById('add-task-sheet');
    const sheetTitle = document.getElementById('task-sheet-title');
    const btnSubmit = document.getElementById('btn-submit-task');
    const btnDelete = document.getElementById('btn-delete-task-sheet');
    const idInput = document.getElementById('input-task-id');
    const nameInput = document.getElementById('input-task-name');
    const timeInput = document.getElementById('input-task-time');
    const endTimeInput = document.getElementById('input-task-end-time');
    const btnTypeBlur = document.getElementById('btn-type-blur');
    const btnTypeUrl = document.getElementById('btn-type-url');
    const allowedUrlsSection = document.getElementById('allowed-urls-section');
    const allowedUrlsList = document.getElementById('allowed-urls-list');
    const btnSchedRec = document.getElementById('btn-sched-recurring');
    const btnSchedSpec = document.getElementById('btn-sched-specific');
    const secRec = document.getElementById('section-task-repeat-days');
    const secSpec = document.getElementById('section-task-specific-date');
    const dateInput = document.getElementById('input-task-date');
    const tD = document.getElementById('task-date-day');
    const tM = document.getElementById('task-date-month');
    const tY = document.getElementById('task-date-year');
    const strictCheck = document.getElementById('check-strict-mode');
    const soundSelect = document.getElementById('select-task-sound');

    if (sheetTitle) sheetTitle.textContent = 'Add Task';
    if (btnSubmit) btnSubmit.textContent = 'Save Task';
    if (btnDelete) btnDelete.classList.add('hidden');
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';

    const startVal = time || '14:00';
    if (timeInput) timeInput.value = startVal;

    // Default End Time is 1 hour after Start Time (or 23:59 if starting late)
    if (endTimeInput) {
      const [sh, sm] = startVal.split(':').map(Number);
      const endTotal = (sh * 60 + sm + 60) % 1440;
      const eh = Math.floor(endTotal / 60);
      const em = endTotal % 60;
      if (sh * 60 + sm + 60 >= 1440) {
        endTimeInput.value = '23:59';
      } else {
        endTimeInput.value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      }
    }

    // Default to Blur
    if (btnTypeBlur) btnTypeBlur.classList.add('active');
    if (btnTypeUrl) btnTypeUrl.classList.remove('active');
    if (allowedUrlsSection) allowedUrlsSection.classList.add('hidden');
    if (allowedUrlsList) allowedUrlsList.innerHTML = '';

    if (dateStr) {
      selectedScheduleMode = 'specific';
      if (btnSchedSpec) btnSchedSpec.classList.add('active');
      if (btnSchedRec) btnSchedRec.classList.remove('active');
      if (secSpec) secSpec.classList.remove('hidden');
      if (secRec) secRec.classList.add('hidden');
      if (dateInput) dateInput.value = dateStr;

      const parts = dateStr.split('-');
      if (tY) tY.value = parts[0];
      if (tM) tM.value = parts[1];
      if (tD) tD.value = parts[2];
      syncWeekViewToDate(dateStr);
    } else {
      selectedScheduleMode = 'recurring';
      if (btnSchedRec) btnSchedRec.classList.add('active');
      if (btnSchedSpec) btnSchedSpec.classList.remove('active');
      if (secRec) secRec.classList.remove('hidden');
      if (secSpec) secSpec.classList.add('hidden');
      const dayPills = document.querySelectorAll('.day-pill');
      dayPills.forEach(p => p.classList.add('active'));
    }

    if (strictCheck) strictCheck.checked = true;
    if (soundSelect) soundSelect.value = '';

    if (taskSheet) taskSheet.classList.remove('hidden');
    
    // Trigger validation and duration calculation
    if (timeInput) {
      const evt = new Event('input');
      timeInput.dispatchEvent(evt);
    }

    if (nameInput) setTimeout(() => nameInput.focus(), 60);
  }

  // Helper: Open Edit Task Sheet with Existing Task Data
  function openEditTaskSheet(task) {
    if (!task) return;
    const taskSheet = document.getElementById('add-task-sheet');
    const sheetTitle = document.getElementById('task-sheet-title');
    const btnSubmit = document.getElementById('btn-submit-task');
    const btnDelete = document.getElementById('btn-delete-task-sheet');
    const idInput = document.getElementById('input-task-id');
    const nameInput = document.getElementById('input-task-name');
    const timeInput = document.getElementById('input-task-time');
    const endTimeInput = document.getElementById('input-task-end-time');
    const btnTypeBlur = document.getElementById('btn-type-blur');
    const btnTypeUrl = document.getElementById('btn-type-url');
    const allowedUrlsSection = document.getElementById('allowed-urls-section');
    const allowedUrlsList = document.getElementById('allowed-urls-list');
    const btnSchedRec = document.getElementById('btn-sched-recurring');
    const btnSchedSpec = document.getElementById('btn-sched-specific');
    const secRec = document.getElementById('section-task-repeat-days');
    const secSpec = document.getElementById('section-task-specific-date');
    const dateInput = document.getElementById('input-task-date');
    const tD = document.getElementById('task-date-day');
    const tM = document.getElementById('task-date-month');
    const tY = document.getElementById('task-date-year');
    const strictCheck = document.getElementById('check-strict-mode');
    const soundSelect = document.getElementById('select-task-sound');

    if (sheetTitle) sheetTitle.textContent = 'Edit Task';
    if (btnSubmit) btnSubmit.textContent = 'Save Changes';
    if (btnDelete) btnDelete.classList.remove('hidden');
    if (idInput) idInput.value = task.id;
    if (nameInput) nameInput.value = task.name;
    if (timeInput) timeInput.value = task.start_time;

    // Calculate or set End Time
    if (endTimeInput) {
      if (task.end_time) {
        endTimeInput.value = task.end_time;
      } else {
        const [sh, sm] = (task.start_time || '12:00').split(':').map(Number);
        const duration = parseInt(task.duration_mins) || 30;
        const endTotal = (sh * 60 + sm + duration) % 1440;
        const eh = Math.floor(endTotal / 60);
        const em = endTotal % 60;
        endTimeInput.value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      }
    }

    // Task Type
    selectedTaskType = task.task_type || 'blur';
    const isUrl = selectedTaskType === 'url';
    if (isUrl) {
      if (btnTypeUrl) btnTypeUrl.classList.add('active');
      if (btnTypeBlur) btnTypeBlur.classList.remove('active');
      if (allowedUrlsSection) allowedUrlsSection.classList.remove('hidden');
      if (allowedUrlsList) {
        allowedUrlsList.innerHTML = '';
        let rawUrls = task.allowed_urls || [];
        if (typeof rawUrls === 'string') {
          try { rawUrls = JSON.parse(rawUrls); } catch(e) { rawUrls = [rawUrls]; }
        }
        const urls = (Array.isArray(rawUrls) ? rawUrls : [rawUrls]).map(u => {
          let clean = (u || '').replace(/^(https?:\/\/)+/gi, '').trim();
          return clean.length > 0 ? 'https://' + clean : '';
        }).filter(u => u.length > 0);

        if (urls.length === 0) {
          addUrlInputRow('');
        } else {
          urls.forEach(u => addUrlInputRow(u));
        }
      }
    } else {
      if (btnTypeBlur) btnTypeBlur.classList.add('active');
      if (btnTypeUrl) btnTypeUrl.classList.remove('active');
      if (allowedUrlsSection) allowedUrlsSection.classList.add('hidden');
      if (allowedUrlsList) allowedUrlsList.innerHTML = '';
    }

    // Schedule Mode
    if (task.specific_date) {
      selectedScheduleMode = 'specific';
      if (btnSchedSpec) btnSchedSpec.classList.add('active');
      if (btnSchedRec) btnSchedRec.classList.remove('active');
      if (secSpec) secSpec.classList.remove('hidden');
      if (secRec) secRec.classList.add('hidden');
      if (dateInput) dateInput.value = task.specific_date;

      const parts = task.specific_date.split('-');
      if (tY) tY.value = parts[0];
      if (tM) tM.value = parts[1];
      if (tD) tD.value = parts[2];
      syncWeekViewToDate(task.specific_date);
    } else {
      selectedScheduleMode = 'recurring';
      if (btnSchedRec) btnSchedRec.classList.add('active');
      if (btnSchedSpec) btnSchedSpec.classList.remove('active');
      if (secRec) secRec.classList.remove('hidden');
      if (secSpec) secSpec.classList.add('hidden');

      const dayPills = document.querySelectorAll('.day-pill');
      const repDays = task.repeat_days || [];
      dayPills.forEach(p => {
        const d = p.getAttribute('data-day');
        p.classList.toggle('active', repDays.includes(d));
      });
    }

    if (strictCheck) strictCheck.checked = (task.is_strict === 1);
    if (soundSelect) soundSelect.value = task.sound_id || '';

    if (taskSheet) taskSheet.classList.remove('hidden');

    // Trigger validation and duration calculation for Edit Task
    if (timeInput) {
      const evt = new Event('input');
      timeInput.dispatchEvent(evt);
    }

    if (nameInput) setTimeout(() => nameInput.focus(), 60);
  }

  function renderTasksPanel() {
    renderDaySchedule();
    renderWeekGrid();

    const soundSelect = document.getElementById('select-task-sound');
    if (soundSelect) {
      soundSelect.innerHTML = '<option value="">None</option>';
      soundsList.forEach(s => {
        soundSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.duration})</option>`;
      });
    }
  }

  function renderDaySchedule() {
    const todayList = document.getElementById('today-tasks-list');
    const dayLabel = document.getElementById('day-view-date-label');
    if (!todayList) return;
    todayList.innerHTML = '';

    const targetNow = getTargetNow();
    const todayStr = formatLocalDateStr(targetNow);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = dayNames[targetNow.getDay()];
    const isFriday = targetNow.getDay() === 5;

    if (dayLabel) {
      dayLabel.textContent = targetNow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }

    const todayTasks = tasksList.filter(t => {
      if (t.specific_date) return t.specific_date === todayStr;
      return (t.repeat_days || []).includes(currentDayName);
    });

    // Build unified chronological timeline for today: ALL 5 PRAYERS + ALL SCHEDULED TASKS (Round 10)
    const timelineItems = [];

    // 1. Add Namaz Prayers for today (Fajr, Jumma/Zuhr, Asr, Maghrib, Isha)
    const prayerKeys = isFriday
      ? [
          { key: 'fajr', name: 'Fajr', icon: 'wb_twilight' },
          { key: 'jumma', name: 'Jumma (Friday Prayer)', icon: 'mosque' },
          { key: 'asr', name: 'Asr', icon: 'wb_sunny' },
          { key: 'maghrib', name: 'Maghrib', icon: 'nights_stay' },
          { key: 'isha', name: 'Isha', icon: 'dark_mode' }
        ]
      : [
          { key: 'fajr', name: 'Fajr', icon: 'wb_twilight' },
          { key: 'zuhr', name: 'Zuhr', icon: 'wb_sunny' },
          { key: 'asr', name: 'Asr', icon: 'wb_sunny' },
          { key: 'maghrib', name: 'Maghrib', icon: 'nights_stay' },
          { key: 'isha', name: 'Isha', icon: 'dark_mode' }
        ];

    // 1. Add configured & enabled Namaz Prayers only
    prayerKeys.forEach((p, idx) => {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p.key);
      if (!setting || setting.is_enabled === 0 || setting.is_enabled === '0' || setting.is_enabled === false) {
        return;
      }
      if (!setting.override_time) {
        return;
      }

      let startMins = 9999 + idx;
      if (setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        const [h, m] = setting.override_time.split(':').map(Number);
        startMins = h * 60 + m;
      }

      timelineItems.push({
        type: 'namaz',
        prayerKey: p.key,
        name: p.name,
        icon: p.icon,
        time: setting.override_time,
        startMins: startMins,
        duration_mins: setting.duration_mins || (p.key === 'jumma' ? 45 : 15),
        is_enabled: true,
        setting: setting
      });
    });

    // 2. Add Scheduled Tasks
    todayTasks.forEach(task => {
      if (task.is_enabled === 0) return;
      let startMins = 0;
      if (task.start_time && /^\d{1,2}:\d{2}$/.test(task.start_time)) {
        const [h, m] = task.start_time.split(':').map(Number);
        startMins = h * 60 + m;
      }
      timelineItems.push({
        type: 'task',
        task: task,
        name: task.name,
        time: task.start_time,
        startMins: startMins,
        duration_mins: task.duration_mins || 30
      });
    });

    // Sort chronologically by startMins
    timelineItems.sort((a, b) => a.startMins - b.startMins);

    if (timelineItems.length === 0) {
      todayList.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: #888B9E;">
          <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.35; margin-bottom: 12px; display: block;">event_busy</span>
          <h3 class="font-fraunces" style="font-size: 16px; color: #EDEDF3; margin-bottom: 4px;">No tasks yet</h3>
          <p style="font-size: 12px; color: #888B9E;">Click "+ Add Task" to schedule your daily focus sessions.</p>
        </div>
      `;
      return;
    }

    // Render cards
    timelineItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'task-item-card';
      card.style.cursor = 'pointer';

      if (item.type === 'namaz') {
        const hasTime = !!item.time;
        const displayTime = hasTime ? formatTimeDisplay(item.time) : '--:--';
        
        let endTimeDisplay = '';
        if (hasTime) {
          const [th, tm] = item.time.split(':').map(Number);
          const endTotalMins = (th * 60 + tm + item.duration_mins) % 1440;
          const endH = Math.floor(endTotalMins / 60);
          const endM = endTotalMins % 60;
          endTimeDisplay = ` – ${formatTimeDisplay(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`)}`;
        }

        card.style.borderLeft = '3px solid #E7B24C';
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="task-time-badge" style="background: rgba(231, 178, 76, 0.15); color: #E7B24C; border: 1px solid rgba(231, 178, 76, 0.3);">
              ${displayTime}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h4 class="font-fraunces" style="font-size: 16px; color: #EDEDF3;">${item.name}</h4>
                <span class="badge-amber" style="font-size: 10px; display: inline-flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 12px;">${item.icon}</span> Namaz
                </span>
                ${item.is_enabled ? '<span style="font-size: 10px; color: #4FD6C4; font-weight: 700;">AUTO-BLUR</span>' : '<span style="font-size: 10px; color: #888B9E;">OFF</span>'}
              </div>
              <p style="font-size: 12px; color: #888B9E; margin-top: 2px;">
                ${hasTime ? `Window: ${displayTime}${endTimeDisplay} • ` : ''}Duration: ${item.duration_mins} min • ${hasTime ? '<span style="color: #4FD6C4;">Manual Time Set</span>' : '<span style="color: #E7B24C;">Time Not Set (Click to set)</span>'}
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn-edit-prayer-time dur-btn" style="padding: 6px 12px; font-size: 11px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">edit</span> ${hasTime ? 'Edit Time' : 'Set Time'}
            </button>
          </div>
        `;

        card.addEventListener('click', () => {
          openNamazOverrideModal(item.prayerKey, item.name, item.time);
        });

        todayList.appendChild(card);
      } else {
        // Task Item
        const task = item.task;
        const isUrl = task.task_type === 'url';
        const typeBadge = isUrl 
          ? '<span class="badge-url"><span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">link</span> URL Task</span>'
          : '<span class="badge-blur"><span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">visibility_off</span> Blur only</span>';

        const [th, tm] = (task.start_time || '12:00').split(':').map(Number);
        const duration = parseInt(task.duration_mins) || 30;
        const endTotalMins = (th * 60 + tm + duration) % 1440;
        const endH = Math.floor(endTotalMins / 60);
        const endM = endTotalMins % 60;
        const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        const timeRangeFormatted = `${formatTimeDisplay(task.start_time)} – ${formatTimeDisplay(endTimeStr)}`;

        card.style.borderLeft = isUrl ? '3px solid #4FD6C4' : '3px solid #6C7293';
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="task-time-badge">${formatTimeDisplay(task.start_time)}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h4 class="font-fraunces" style="font-size: 16px; color: #EDEDF3;">${task.name}</h4>
                ${typeBadge}
                ${task.is_strict ? '<span style="font-size: 10px; color: #ffb4ab; font-weight: 700;">STRICT</span>' : ''}
                ${task.specific_date ? '<span style="font-size: 10px; color: #4FD6C4; font-weight: 700; font-family: var(--font-mono);">(Specific Date)</span>' : ''}
              </div>
              <p style="font-size: 12px; color: #888B9E; margin-top: 2px;">
                Time: <strong style="color: #EDEDF3;">${timeRangeFormatted}</strong> (${task.duration_mins} min) • ${task.specific_date ? `Date: ${task.specific_date}` : `Repeats: ${(task.repeat_days || []).join(', ')}`}
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn-edit-task dur-btn" style="padding: 6px 12px; font-size: 11px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">edit</span> Edit
            </button>
            <button class="btn-delete-task icon-btn">
              <span class="material-symbols-outlined" style="font-size: 18px; color: #888B9E;">delete</span>
            </button>
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-delete-task')) return;
          openEditTaskSheet(task);
        });

        card.querySelector('.btn-delete-task').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete task "${task.name}"?`)) {
            if (window.dayarc) {
              await window.dayarc.deleteTask(task.id);
              tasksList = await window.dayarc.getTasks();
              renderTasksPanel();
              renderDashboard();
            }
          }
        });

        todayList.appendChild(card);
      }
    });
  }

  // --- INTERACTIVE WEEK VIEW WITH CLICKABLE TILES (Round 9) ---
  function renderWeekGrid() {
    const gridBody = document.getElementById('week-grid-body');
    const headerCols = document.getElementById('week-columns-header');
    const monthHeading = document.getElementById('week-month-heading');
    const periodLabel = document.getElementById('week-period-label');
    if (!gridBody || !headerCols) return;

    gridBody.innerHTML = '';
    headerCols.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 11px;">TIME</div>';

    const targetNow = getTargetNow();
    const startOfWeek = new Date(targetNow.getFullYear(), targetNow.getMonth(), targetNow.getDate(), 12, 0, 0);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek + (currentWeekOffset * 7));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // 1. Month and Date Range in Week Header
    const startMonthName = startOfWeek.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endMonthName = endOfWeek.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthHeadingStr = (startMonthName === endMonthName)
      ? startMonthName
      : `${startOfWeek.toLocaleDateString('en-US', { month: 'short' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;

    if (monthHeading) monthHeading.textContent = monthHeadingStr;

    if (periodLabel) {
      const opts = { month: 'short', day: 'numeric' };
      periodLabel.textContent = `${startOfWeek.toLocaleDateString('en-US', opts)} – ${endOfWeek.toLocaleDateString('en-US', opts)}, ${endOfWeek.getFullYear()}`;
    }

    const weekDays = [];
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayStr = formatLocalDateStr(targetNow);

    // 2. Build Day Headers with Actual Dates & Search Highlight
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = formatLocalDateStr(d);
      const isToday = (dateStr === todayStr);
      const dayName = dayKeys[i];
      const isSearched = (highlightedSearchedDate === dateStr);
      const label = `${dayName}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      weekDays.push({ date: d, dateStr, dayName, isToday, isSearched, label });

      const colHeader = document.createElement('div');
      colHeader.className = `week-col-header ${isSearched ? 'week-header-highlighted' : ''}`;
      colHeader.style.padding = '8px 2px';
      colHeader.style.borderRadius = '6px';
      colHeader.style.transition = 'all 0.2s ease';
      colHeader.style.color = isSearched ? '#E7B24C' : (isToday ? '#4FD6C4' : '#888B9E');
      colHeader.style.fontWeight = (isSearched || isToday) ? '800' : '600';

      let badgeHtml = '';
      if (isToday) badgeHtml += ' <span style="font-size: 8px; background: #4FD6C4; color: #11121B; padding: 1px 4px; border-radius: 4px; font-weight: 800; margin-left: 2px;">TODAY</span>';
      if (isSearched) badgeHtml += ' <span style="font-size: 8px; background: #E7B24C; color: #11121B; padding: 1px 4px; border-radius: 4px; font-weight: 800; margin-left: 2px;">TARGET</span>';

      colHeader.innerHTML = `<span>${label}</span>${badgeHtml}`;
      headerCols.appendChild(colHeader);
    }

    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

    // 3. Time column
    const timeCol = document.createElement('div');
    timeCol.style.display = 'flex';
    timeCol.style.flexDirection = 'column';
    timeCol.style.fontFamily = 'var(--font-mono)';
    timeCol.style.fontSize = '10px';
    timeCol.style.color = '#888B9E';
    timeCol.style.borderRight = '1px solid rgba(255,255,255,0.06)';
    timeCol.style.textAlign = 'center';

    hours.forEach(h => {
      timeCol.innerHTML += `<div style="height: 52px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.04);">${formatTimeDisplay(h)}</div>`;
    });
    gridBody.appendChild(timeCol);

    // 4. Clickable Empty Tiles for Each Day (Opens Add Task)
    weekDays.forEach(wd => {
      const col = document.createElement('div');
      col.className = 'week-day-column' + (wd.isSearched ? ' week-col-highlighted' : '');
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.position = 'relative';
      col.style.borderRight = '1px solid rgba(255,255,255,0.04)';
      if (wd.isToday && !wd.isSearched) {
        col.style.backgroundColor = 'rgba(79, 214, 196, 0.03)';
      }

      // Generate clickable hourly tiles (Empty tile -> Add Task)
      hours.forEach(h => {
        const tile = document.createElement('div');
        tile.className = 'week-time-slot-tile';
        tile.setAttribute('data-date', wd.dateStr);
        tile.setAttribute('data-time', h);
        tile.title = `Click to add new task on ${wd.label} at ${formatTimeDisplay(h)}`;

        tile.addEventListener('click', (e) => {
          if (e.target.closest('.week-task-block')) return; // Existing task blocks handle their own edit click

          // Visual selection glow
          document.querySelectorAll('.week-time-slot-tile').forEach(t => t.classList.remove('selected-tile'));
          tile.classList.add('selected-tile');

          // Open Add Task Sheet prefilled with this tile's hour and date
          openAddTaskSheet(h, wd.dateStr);
        });

        col.appendChild(tile);
      });

      // 5. Render Scheduled Tasks Over Grid as Single Merged Blocks (Round 10)
      tasksList.forEach(t => {
        const matchesDate = t.specific_date ? t.specific_date === wd.dateStr : (t.repeat_days || []).includes(wd.dayName);
        if (matchesDate && t.start_time) {
          const [h, m] = t.start_time.split(':').map(Number);
          const startMins = h * 60 + m;
          const gridStartMins = 8 * 60; // Grid starts at 08:00
          const offsetMins = startMins - gridStartMins;
          const duration = parseInt(t.duration_mins) || 30;

          if (offsetMins >= 0 && offsetMins < 13 * 60) {
            const topPx = (offsetMins / 60.0) * 52.0;
            // Height spans across multiple hour rows seamlessly as a merged single event block (e.g. 120 mins = 104px)
            const heightPx = Math.max(36, (duration / 60.0) * 52.0);

            // Calculate formatted start and end time (e.g. "2:00 PM – 4:00 PM")
            const endTotalMins = (startMins + duration) % 1440;
            const endH = Math.floor(endTotalMins / 60);
            const endM = endTotalMins % 60;
            const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            const timeRangeFormatted = `${formatTimeDisplay(t.start_time)} – ${formatTimeDisplay(endTimeStr)}`;

            const block = document.createElement('div');
            block.className = 'week-task-block';
            block.style.position = 'absolute';
            block.style.left = '3px';
            block.style.right = '3px';
            block.style.top = `${topPx}px`;
            block.style.height = `${heightPx}px`;
            block.style.borderRadius = '8px';
            block.style.padding = '5px 7px';
            block.style.fontSize = '10px';
            block.style.fontWeight = '600';
            block.style.cursor = 'pointer';
            block.style.overflow = 'hidden';
            block.style.zIndex = '5';
            block.title = `Click to edit "${t.name}" (${timeRangeFormatted}, ${duration}m)`;

            if (t.task_type === 'url') {
              block.style.background = 'linear-gradient(135deg, rgba(79, 214, 196, 0.28) 0%, rgba(79, 214, 196, 0.16) 100%)';
              block.style.border = '1px solid rgba(79, 214, 196, 0.55)';
              block.style.boxShadow = '0 2px 8px rgba(79, 214, 196, 0.15)';
              block.style.color = '#4FD6C4';
            } else {
              block.style.background = 'linear-gradient(135deg, rgba(231, 178, 76, 0.28) 0%, rgba(231, 178, 76, 0.16) 100%)';
              block.style.border = '1px solid rgba(231, 178, 76, 0.55)';
              block.style.boxShadow = '0 2px 8px rgba(231, 178, 76, 0.15)';
              block.style.color = '#E7B24C';
            }

            block.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
                <div class="truncate" style="font-weight: 700; font-size: 11px; line-height: 1.2;">${t.name}</div>
                <span style="font-size: 8.5px; opacity: 0.85; font-family: var(--font-mono); background: rgba(0,0,0,0.35); padding: 1px 4px; border-radius: 4px; white-space: nowrap;">${duration}m</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 9.5px; opacity: 0.92; margin-top: 3px; color: #EDEDF3; font-weight: 500;">
                ${timeRangeFormatted}
              </div>
            `;
            block.addEventListener('click', (ev) => {
              ev.stopPropagation(); // DO NOT trigger parent tile click, DO NOT trigger startSession!
              openEditTaskSheet(t); // Open prefilled Edit sheet
            });
            col.appendChild(block);
          }
        }
      });

      gridBody.appendChild(col);
    });
  }

  // --- 6. BOOKMARKS PANEL ---
  function setupBookmarks() {
    renderBookmarksPanel();

    const searchInput = document.getElementById('input-bookmark-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderBookmarksGrid(searchInput.value.trim());
      });
    }

    const btnOpenModal = document.getElementById('btn-open-add-bookmark');
    const modalBm = document.getElementById('modal-add-bookmark');
    if (btnOpenModal && modalBm) {
      btnOpenModal.addEventListener('click', () => {
        populateBookmarkFolderDropdown();
        modalBm.classList.remove('hidden');
        const urlInput = document.getElementById('input-bm-url');
        if (urlInput) setTimeout(() => urlInput.focus(), 50);
      });
    }

    document.querySelectorAll('#modal-add-bookmark .modal-close').forEach(btn => {
      btn.addEventListener('click', () => modalBm.classList.add('hidden'));
    });

    const folderSelect = document.getElementById('select-bm-folder');
    const newFolderInput = document.getElementById('input-bm-new-folder');
    if (folderSelect && newFolderInput) {
      folderSelect.addEventListener('change', () => {
        if (folderSelect.value === '__new__') {
          newFolderInput.classList.remove('hidden');
          newFolderInput.focus();
        } else {
          newFolderInput.classList.add('hidden');
        }
      });
    }

    const formAddBm = document.getElementById('form-add-bookmark');
    if (formAddBm) {
      formAddBm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let rawUrl = document.getElementById('input-bm-url').value.trim();
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
          rawUrl = 'https://' + rawUrl;
        }

        let folder = folderSelect.value;
        if (folder === '__new__') {
          folder = newFolderInput.value.trim() || 'General';
        }

        let autoTitle = rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        if (autoTitle.length > 35) {
          autoTitle = autoTitle.substring(0, 32) + '...';
        }

        const newBm = {
          title: autoTitle,
          url: rawUrl,
          folder: folder || 'General',
          tags: [],
          icon: 'bookmark'
        };

        if (window.dayarc) {
          await window.dayarc.saveBookmark(newBm);
          bookmarksList = await window.dayarc.getBookmarks();
        }

        formAddBm.reset();
        newFolderInput.classList.add('hidden');
        modalBm.classList.add('hidden');
        renderBookmarksPanel();
      });
    }
  }

  function populateBookmarkFolderDropdown() {
    const folderSelect = document.getElementById('select-bm-folder');
    if (!folderSelect) return;

    const existingFolders = new Set(['General']);
    bookmarksList.forEach(b => {
      if (b.folder) existingFolders.add(b.folder);
    });

    folderSelect.innerHTML = '';
    existingFolders.forEach(f => {
      folderSelect.innerHTML += `<option value="${f}">${f}</option>`;
    });
    folderSelect.innerHTML += '<option value="__new__">+ New Folder...</option>';
  }

  function renderBookmarksPanel() {
    renderBookmarkCollections();
    renderBookmarksGrid();
  }

  function renderBookmarkCollections() {
    const colList = document.getElementById('bookmark-collections-list');
    if (!colList) return;
    colList.innerHTML = '';

    const folderMap = { 'All Bookmarks': bookmarksList.length };
    bookmarksList.forEach(b => {
      const f = b.folder || 'General';
      folderMap[f] = (folderMap[f] || 0) + 1;
    });

    for (const [folder, count] of Object.entries(folderMap)) {
      const btn = document.createElement('button');
      btn.className = 'collection-btn';
      btn.innerHTML = `
        <span>${folder}</span>
        <span style="font-family: var(--font-mono); font-size: 11px; color: #888B9E;">${count}</span>
      `;
      btn.addEventListener('click', () => {
        if (folder === 'All Bookmarks') renderBookmarksGrid();
        else renderBookmarksGrid('', folder);
      });
      colList.appendChild(btn);
    }
  }

  function renderBookmarksGrid(searchQuery = '', filterFolder = '') {
    const grid = document.getElementById('bookmarks-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let list = bookmarksList;

    if (filterFolder && filterFolder !== 'All Bookmarks') {
      list = list.filter(b => b.folder === filterFolder);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.url.toLowerCase().includes(q) ||
        (b.folder || '').toLowerCase().includes(q)
      );
    }

    if (list.length === 0) {
      grid.innerHTML = '<p style="grid-column: span 3; font-size: 12px; color: #888B9E; padding: 32px; text-align: center;">No bookmarks found.</p>';
      return;
    }

    list.forEach(bm => {
      const card = document.createElement('div');
      card.className = 'bookmark-card';

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #11121B; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: #4FD6C4;">
              <span class="material-symbols-outlined" style="font-size: 18px;">${bm.icon || 'bookmark'}</span>
            </div>
            <span class="badge-url" style="font-size: 9px;">${bm.folder || 'General'}</span>
          </div>

          <h4 class="font-fraunces truncate" style="font-size: 15px; color: #EDEDF3;">${bm.title}</h4>
          <p class="truncate font-mono" style="font-size: 11px; color: #888B9E; margin-top: 4px;">${bm.url}</p>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04);">
          <span style="font-size: 10px; color: #4FD6C4; font-family: var(--font-mono);">Click to open</span>
          <button class="btn-delete-bm icon-btn" style="width: 24px; height: 24px;">
            <span class="material-symbols-outlined" style="font-size: 16px; color: #888B9E;">delete</span>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-delete-bm')) {
          if (window.dayarc) {
            window.dayarc.launchBrowserUrl(settings.default_browser, settings.default_profile, [bm.url]);
          }
        }
      });

      card.querySelector('.btn-delete-bm').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete bookmark "${bm.title}"?`)) {
          if (window.dayarc) {
            await window.dayarc.deleteBookmark(bm.id);
            bookmarksList = await window.dayarc.getBookmarks();
            renderBookmarksPanel();
          }
        }
      });

      grid.appendChild(card);
    });
  }

  // --- 7. SOUNDS LIBRARY (Strictly Resources & User Uploads - Section 6) ---
  function setupSounds() {
    renderSoundsPanel();

    const btnOpenAdd = document.getElementById('btn-open-add-sound');
    const modalSound = document.getElementById('modal-add-sound');
    if (btnOpenAdd && modalSound) {
      btnOpenAdd.addEventListener('click', () => modalSound.classList.remove('hidden'));
    }

    document.querySelectorAll('#modal-add-sound .modal-close').forEach(btn => {
      btn.addEventListener('click', () => modalSound.classList.add('hidden'));
    });

    const tabRecord = document.getElementById('btn-sound-tab-record');
    const tabUpload = document.getElementById('btn-sound-tab-upload');
    const recordView = document.getElementById('sound-record-view');
    const uploadView = document.getElementById('sound-upload-view');

    if (tabRecord && tabUpload) {
      tabRecord.addEventListener('click', () => {
        tabRecord.classList.add('active');
        tabUpload.classList.remove('active');
        recordView.classList.remove('hidden');
        uploadView.classList.add('hidden');
      });

      tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabRecord.classList.remove('active');
        uploadView.classList.remove('hidden');
        recordView.classList.add('hidden');
      });
    }

    const btnToggleRec = document.getElementById('btn-toggle-recording');
    const recLabel = document.getElementById('mic-status-label');
    const recTimer = document.getElementById('recording-time');
    const btnSaveRec = document.getElementById('btn-save-recorded-sound');

    if (btnToggleRec) {
      btnToggleRec.addEventListener('click', async () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(audioBlob);
              reader.onloadend = () => {
                recordedAudioBase64 = reader.result;
                if (btnSaveRec) btnSaveRec.disabled = false;
                recLabel.textContent = 'Recording finished. Enter a name and save.';
              };
            };

            mediaRecorder.start();
            recordingSeconds = 0;
            recLabel.textContent = 'Recording in progress... Click to stop.';

            recordingTimer = setInterval(() => {
              recordingSeconds++;
              const mm = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
              const ss = String(recordingSeconds % 60).padStart(2, '0');
              if (recTimer) recTimer.textContent = `${mm}:${ss}`;
            }, 1000);

          } catch (err) {
            alert('Microphone unavailable: ' + err.message);
          }
        } else {
          mediaRecorder.stop();
          clearInterval(recordingTimer);
        }
      });
    }

    if (btnSaveRec) {
      btnSaveRec.addEventListener('click', async () => {
        const name = document.getElementById('input-record-name').value.trim() || 'Voice Note';
        const mm = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const ss = String(recordingSeconds % 60).padStart(2, '0');

        const newSound = {
          name,
          duration: `${mm}:${ss}`,
          audio_data: recordedAudioBase64,
          is_builtin: 0,
          used_in: ['Tasks']
        };

        if (window.dayarc) {
          await window.dayarc.saveSound(newSound);
          soundsList = await window.dayarc.getSounds();
        }

        modalSound.classList.add('hidden');
        renderSoundsPanel();
      });
    }

    const btnSaveUpload = document.getElementById('btn-save-uploaded-sound');
    if (btnSaveUpload) {
      btnSaveUpload.addEventListener('click', async () => {
        const name = document.getElementById('input-upload-sound-name').value.trim() || 'Custom Audio';
        const fileInput = document.getElementById('input-sound-file');

        if (!fileInput.files || fileInput.files.length === 0) {
          alert('Please select an audio file.');
          return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          const newSound = {
            name,
            duration: '01:00',
            audio_data: e.target.result,
            is_builtin: 0,
            used_in: ['Tasks', 'Namaz']
          };

          if (window.dayarc) {
            await window.dayarc.saveSound(newSound);
            soundsList = await window.dayarc.getSounds();
          }

          modalSound.classList.add('hidden');
          renderSoundsPanel();
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function renderSoundsPanel() {
    const listContainer = document.getElementById('sounds-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (soundsList.length === 0) {
      listContainer.innerHTML = '<p style="font-size: 12px; color: #888B9E; padding: 24px; text-align: center;">No custom audio found in resources/Sounds/ or user library.</p>';
      return;
    }

    soundsList.forEach(sound => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '50px 1fr 80px 120px';
      row.style.alignItems = 'center';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.04)';

      row.innerHTML = `
        <div style="text-align: center;">
          <button class="btn-play-sound icon-btn" style="width: 32px; height: 32px; margin: 0 auto; border: 1px solid var(--border); border-radius: 50%;">
            <span class="material-symbols-outlined" style="font-size: 18px;">play_arrow</span>
          </button>
        </div>
        <div style="font-size: 13px; font-weight: 500; color: #EDEDF3;">
          ${sound.name}
          ${sound.id.startsWith('bundled-') ? '<span style="font-size: 9px; color: #4FD6C4; margin-left: 6px; font-weight: 700;">(Bundled)</span>' : ''}
        </div>
        <div style="font-family: var(--font-mono); font-size: 12px; color: #888B9E; text-align: right;">
          ${sound.duration}
        </div>
        <div style="padding-left: 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; gap: 4px; overflow: hidden;">
            ${(sound.used_in || []).map(u => `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #11121B; color: #888B9E; border: 1px solid var(--border);">${u}</span>`).join('')}
          </div>
          ${!sound.is_builtin ? `
            <button class="btn-delete-sound icon-btn" style="width: 24px; height: 24px;">
              <span class="material-symbols-outlined" style="font-size: 16px; color: #888B9E;">delete</span>
            </button>
          ` : ''}
        </div>
      `;

      const playBtn = row.querySelector('.btn-play-sound');
      playBtn.addEventListener('click', () => {
        if (window.soundEngine) {
          if (window.soundEngine.currentPlayingId === sound.id) {
            window.soundEngine.stopCurrent();
            playBtn.querySelector('span').textContent = 'play_arrow';
          } else {
            document.querySelectorAll('.btn-play-sound span').forEach(s => s.textContent = 'play_arrow');
            playBtn.querySelector('span').textContent = 'pause';

            window.soundEngine.play(
              sound,
              () => {},
              () => {
                playBtn.querySelector('span').textContent = 'play_arrow';
              }
            );
          }
        }
      });

      const delBtn = row.querySelector('.btn-delete-sound');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (confirm(`Delete sound "${sound.name}"?`)) {
            if (window.dayarc) {
              await window.dayarc.deleteSound(sound.id);
              soundsList = await window.dayarc.getSounds();
              renderSoundsPanel();
            }
          }
        });
      }

      listContainer.appendChild(row);
    });
  }

  // --- 8. PRIVATE TAB ---
  function setupPrivateTab() {
    renderPrivateTab();

    const formSetup = document.getElementById('form-private-setup');
    if (formSetup) {
      formSetup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = document.getElementById('input-setup-pwd').value;
        const confirmPwd = document.getElementById('input-setup-confirm-pwd').value;
        const recovery = document.getElementById('input-setup-recovery').value.trim();

        if (pwd !== confirmPwd) {
          alert('Passwords do not match.');
          return;
        }

        if (window.dayarc) {
          await window.dayarc.setSetting('private_tab_password_hash', hashString(pwd));
          await window.dayarc.setSetting('private_tab_recovery_code', hashString(recovery));
          settings = await window.dayarc.getSettings();
        }

        isPrivateUnlocked = true;
        renderPrivateTab();
        startPrivateIdleTimer();
      });
    }

    const formUnlock = document.getElementById('form-private-unlock');
    if (formUnlock) {
      formUnlock.addEventListener('submit', (e) => {
        e.preventDefault();
        const entered = document.getElementById('input-private-unlock-pwd').value;
        const savedHash = settings.private_tab_password_hash;

        if (hashString(entered) === savedHash) {
          isPrivateUnlocked = true;
          document.getElementById('input-private-unlock-pwd').value = '';
          renderPrivateTab();
          startPrivateIdleTimer();
        } else {
          alert('Incorrect password.');
        }
      });
    }

    const btnForgot = document.getElementById('btn-forgot-pwd');
    const modalForgot = document.getElementById('modal-change-pwd');
    if (btnForgot && modalForgot) {
      btnForgot.addEventListener('click', () => {
        modalForgot.classList.remove('hidden');
        setTimeout(() => document.getElementById('input-reset-recovery').focus(), 50);
      });
    }

    document.querySelectorAll('#modal-change-pwd .modal-close').forEach(btn => {
      btn.addEventListener('click', () => modalForgot.classList.add('hidden'));
    });

    const formReset = document.getElementById('form-reset-pwd');
    if (formReset) {
      formReset.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('input-reset-recovery').value.trim();
        const newPwd = document.getElementById('input-reset-new-pwd').value;
        const confirmNew = document.getElementById('input-reset-confirm-pwd').value;

        if (hashString(code) !== settings.private_tab_recovery_code) {
          alert('Incorrect recovery code.');
          return;
        }

        if (newPwd !== confirmNew) {
          alert('New passwords do not match.');
          return;
        }

        if (window.dayarc) {
          await window.dayarc.setSetting('private_tab_password_hash', hashString(newPwd));
          settings = await window.dayarc.getSettings();
        }

        alert('Password updated successfully.');
        modalForgot.classList.add('hidden');
        formReset.reset();
      });
    }

    const btnRelock = document.getElementById('btn-relock-private');
    if (btnRelock) {
      btnRelock.addEventListener('click', () => lockPrivateTab());
    }

    const formAddBlocked = document.getElementById('form-add-blocked-site');
    if (formAddBlocked) {
      formAddBlocked.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-blocked-site');
        const domain = input.value.trim();
        if (domain && window.dayarc) {
          await window.dayarc.addBlockedDomain(domain);
          privateBlocklist = await window.dayarc.getPrivateBlocklist();
          input.value = '';
          renderBlockedDomainsList();
        }
      });
    }

    const checkAdult = document.getElementById('check-adult-blocker');
    if (checkAdult) {
      checkAdult.checked = settings.block_adult_content === '1';
      checkAdult.addEventListener('change', async () => {
        if (window.dayarc) {
          await window.dayarc.setSetting('block_adult_content', checkAdult.checked ? '1' : '0');
          settings.block_adult_content = checkAdult.checked ? '1' : '0';
        }
      });
    }
  }

  function renderPrivateTab() {
    const setupCard = document.getElementById('private-setup-card');
    const lockCard = document.getElementById('private-lock-card');
    const unlockedView = document.getElementById('private-unlocked-content');

    const hasPassword = !!settings.private_tab_password_hash;

    if (!hasPassword) {
      setupCard.classList.remove('hidden');
      lockCard.classList.add('hidden');
      unlockedView.classList.add('hidden');
      setTimeout(() => {
        const inp = document.getElementById('input-setup-pwd');
        if (inp && typeof inp.focus === 'function') inp.focus();
      }, 50);
    } else if (!isPrivateUnlocked) {
      setupCard.classList.add('hidden');
      lockCard.classList.remove('hidden');
      unlockedView.classList.add('hidden');
      setTimeout(() => {
        const inp = document.getElementById('input-private-unlock-pwd');
        if (inp) {
          inp.value = '';
          if (typeof inp.focus === 'function') inp.focus();
        }
      }, 50);
    } else {
      setupCard.classList.add('hidden');
      lockCard.classList.add('hidden');
      unlockedView.classList.remove('hidden');
      renderBlockedDomainsList();
    }
  }

  function renderBlockedDomainsList() {
    const list = document.getElementById('blocked-domains-list');
    if (!list) return;
    list.innerHTML = '';

    if (privateBlocklist.length === 0) {
      list.innerHTML = '<p style="font-size: 12px; color: #888B9E; padding: 12px 0; text-align: center;">No custom blocked domains. Type a domain above to block it.</p>';
      return;
    }

    privateBlocklist.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '10px 14px';
      row.style.background = '#11121B';
      row.style.border = '1px solid var(--border)';
      row.style.borderRadius = '8px';
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="material-symbols-outlined" style="color: #ffb4ab; font-size: 16px;">block</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: #EDEDF3;">${item.domain}</span>
        </div>
        <button class="btn-remove-blk icon-btn" title="Delete from blocklist" style="width: 28px; height: 28px; color: #ffb4ab;">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
        </button>
      `;

      row.querySelector('.btn-remove-blk').addEventListener('click', async () => {
        if (window.dayarc) {
          await window.dayarc.removeBlockedDomain(item.id);
          privateBlocklist = await window.dayarc.getPrivateBlocklist();
          renderBlockedDomainsList();
        }
      });

      list.appendChild(row);
    });
  }

  function startPrivateIdleTimer() {
    if (privateIdleTimer) clearTimeout(privateIdleTimer);
    privateIdleTimer = setTimeout(() => lockPrivateTab(), 3 * 60 * 1000);
  }

  function lockPrivateTab() {
    isPrivateUnlocked = false;
    if (privateIdleTimer) clearTimeout(privateIdleTimer);
    if (currentActivePanel === 'private-tab') renderPrivateTab();
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `h_${hash}`;
  }

  // --- 9. SETTINGS PANEL (Time Format Toggle 12h/24h - Section 2) ---
  function setupSettings() {
    renderSettingsPanel();

    const checkAutoStart = document.getElementById('setting-auto-start');
    if (checkAutoStart) {
      checkAutoStart.checked = settings.auto_start !== '0';
      checkAutoStart.addEventListener('change', async () => {
        if (window.dayarc) await window.dayarc.setAutoStart(checkAutoStart.checked);
      });
    }

    const checkRunBg = document.getElementById('setting-run-background');
    if (checkRunBg) {
      checkRunBg.checked = settings.run_in_background !== '0';
      checkRunBg.addEventListener('change', async () => {
        if (window.dayarc) {
          await window.dayarc.setSetting('run_in_background', checkRunBg.checked ? '1' : '0');
          settings.run_in_background = checkRunBg.checked ? '1' : '0';
        }
      });
    }

    const checkBlurEnforce = document.getElementById('setting-blur-enforcement');
    if (checkBlurEnforce) {
      checkBlurEnforce.checked = settings.blur_enforcement_enabled !== '0';
      checkBlurEnforce.addEventListener('change', async () => {
        if (window.dayarc) {
          await window.dayarc.setSetting('blur_enforcement_enabled', checkBlurEnforce.checked ? '1' : '0');
          settings.blur_enforcement_enabled = checkBlurEnforce.checked ? '1' : '0';
        }
      });
    }

    // Time Format Toggle (12h AM/PM vs 24h)
    const checkTimeFormat = document.getElementById('setting-time-format');
    if (checkTimeFormat) {
      checkTimeFormat.checked = settings.time_format !== '24h';
      checkTimeFormat.addEventListener('change', async () => {
        const chosenFormat = checkTimeFormat.checked ? '12h' : '24h';
        settings.time_format = chosenFormat;
        if (window.dayarc) {
          await window.dayarc.setSetting('time_format', chosenFormat);
        }
        renderDashboard();
        renderNamazPanel();
        renderTasksPanel();
      });
    }

    // City / Timezone Selector
    const citySelect = document.getElementById('setting-city-select');
    if (citySelect) {
      const cities = [
        { name: 'Karachi', country: 'Pakistan', lat: '24.8607', lng: '67.0011', gmt: '5' },
        { name: 'Lahore', country: 'Pakistan', lat: '31.5204', lng: '74.3587', gmt: '5' },
        { name: 'Islamabad', country: 'Pakistan', lat: '33.6844', lng: '73.0479', gmt: '5' },
        { name: 'London', country: 'United Kingdom', lat: '51.5074', lng: '-0.1278', gmt: '0' },
        { name: 'New York', country: 'United States', lat: '40.7128', lng: '-74.0060', gmt: '-4' },
        { name: 'Los Angeles', country: 'United States', lat: '34.0522', lng: '-118.2437', gmt: '-7' },
        { name: 'Dubai', country: 'United Arab Emirates', lat: '25.2048', lng: '55.2708', gmt: '4' },
        { name: 'Riyadh', country: 'Saudi Arabia', lat: '24.7136', lng: '46.6753', gmt: '3' },
        { name: 'Makkah', country: 'Saudi Arabia', lat: '21.3891', lng: '39.8579', gmt: '3' },
        { name: 'Tokyo', country: 'Japan', lat: '35.6762', lng: '139.6503', gmt: '9' },
        { name: 'Sydney', country: 'Australia', lat: '-33.8688', lng: '151.2093', gmt: '10' },
        { name: 'Toronto', country: 'Canada', lat: '43.6532', lng: '-79.3832', gmt: '-4' },
        { name: 'Dhaka', country: 'Bangladesh', lat: '23.8103', lng: '90.4125', gmt: '6' }
      ];

      citySelect.innerHTML = '';
      cities.forEach(c => {
        const isSel = (settings.city || 'Karachi').toLowerCase() === c.name.toLowerCase();
        citySelect.innerHTML += `<option value="${c.name}" ${isSel ? 'selected' : ''}>${c.name}, ${c.country} (GMT${parseFloat(c.gmt) >= 0 ? '+' : ''}${c.gmt})</option>`;
      });

      citySelect.addEventListener('change', async () => {
        const chosen = cities.find(c => c.name === citySelect.value);
        if (chosen && window.dayarc) {
          settings.city = chosen.name;
          settings.country = chosen.country;
          settings.lat = chosen.lat;
          settings.lng = chosen.lng;
          settings.gmt_offset = chosen.gmt;

          await window.dayarc.setSetting('city', chosen.name);
          await window.dayarc.setSetting('country', chosen.country);
          await window.dayarc.setSetting('lat', chosen.lat);
          await window.dayarc.setSetting('lng', chosen.lng);
          await window.dayarc.setSetting('gmt_offset', chosen.gmt);

          renderDashboard();
          renderNamazPanel();
          renderTasksPanel();
        }
      });
    }

    const btnChangePwd = document.getElementById('btn-settings-change-pwd');
    const modalChangePwd = document.getElementById('modal-change-pwd');
    if (btnChangePwd && modalChangePwd) {
      btnChangePwd.addEventListener('click', () => {
        modalChangePwd.classList.remove('hidden');
        setTimeout(() => document.getElementById('input-reset-recovery').focus(), 50);
      });
    }
  }

  async function renderSettingsPanel() {
    if (!window.dayarc) return;
    try {
      const browsers = await window.dayarc.getBrowsers();
      const grid = document.getElementById('detected-browsers-grid');
      const profileSelect = document.getElementById('select-browser-profile');
      if (!grid) return;

      grid.innerHTML = '';

      browsers.forEach(b => {
        const isActive = (settings.default_browser || 'chrome') === b.id;
        const card = document.createElement('div');
        card.style.padding = '14px';
        card.style.borderRadius = '10px';
        card.style.background = '#11121B';
        card.style.border = isActive ? '1px solid #E7B24C' : '1px solid var(--border)';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';
        card.style.gap = '6px';
        card.style.cursor = 'pointer';
        card.style.boxShadow = isActive ? '0 0 15px rgba(231,178,76,0.2)' : 'none';

        card.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 28px; color: ${isActive ? '#E7B24C' : '#888B9E'};">${b.icon || 'travel_explore'}</span>
          <span style="font-size: 12px; font-weight: 600; color: #EDEDF3;">${b.name}</span>
          <span style="font-family: var(--font-mono); font-size: 10px; color: #888B9E;">${(b.profiles || []).length} Profile(s)</span>
        `;

        card.addEventListener('click', async () => {
          settings.default_browser = b.id;
          await window.dayarc.setSetting('default_browser', b.id);
          renderSettingsPanel();
        });

        grid.appendChild(card);
      });

      const currentBrowser = browsers.find(b => b.id === (settings.default_browser || 'chrome')) || browsers[0];
      if (currentBrowser && profileSelect) {
        profileSelect.innerHTML = '';
        (currentBrowser.profiles || []).forEach(prof => {
          const isSel = (settings.default_profile || 'Default') === prof.id;
          profileSelect.innerHTML += `<option value="${prof.id}" ${isSel ? 'selected' : ''}>${prof.name} (${prof.id})</option>`;
        });

        profileSelect.onchange = async () => {
          settings.default_profile = profileSelect.value;
          await window.dayarc.setSetting('default_profile', profileSelect.value);
        };
      }
    } catch (e) {
      console.error('Error rendering browser settings:', e);
    }
  }

  // --- 10. FOCUS & BLUR OVERLAY ---
  function setupFocusOverlay() {
    const btnStop = document.getElementById('btn-stop-overlay');
    if (btnStop) btnStop.addEventListener('click', () => stopFocusSession());
  }

  function startQuickFocus(durationMins = 25) {
    const session = {
      name: 'Deep Focus Session',
      duration_mins: durationMins,
      task_type: 'blur',
      is_strict: 0,
      sound_id: null
    };
    startSession(session);
  }

  async function startSession(taskOrPrayer) {
    activeFocusSession = {
      ...taskOrPrayer,
      startTime: Date.now(),
      endTime: Date.now() + (taskOrPrayer.duration_mins || 25) * 60 * 1000
    };

    let soundObj = null;
    if (taskOrPrayer.sound_id && taskOrPrayer.sound_id !== 'none' && window.soundEngine) {
      soundObj = soundsList.find(s => s.id === taskOrPrayer.sound_id) || null;
    }

    if (taskOrPrayer.task_type === 'url' && taskOrPrayer.allowed_urls && taskOrPrayer.allowed_urls.length > 0) {
      if (window.dayarc) {
        window.dayarc.launchBrowserUrl(
          settings.default_browser,
          settings.default_profile,
          taskOrPrayer.allowed_urls
        );
      }
    }

    if (window.dayarc) {
      await window.dayarc.startFocusSession({
        id: taskOrPrayer.id,
        taskName: taskOrPrayer.name,
        allowedUrls: taskOrPrayer.allowed_urls || [],
        isStrict: !!taskOrPrayer.is_strict,
        isUrlTask: taskOrPrayer.task_type === 'url',
        duration_mins: taskOrPrayer.duration_mins || 25,
        endTime: activeFocusSession.endTime,
        sound: soundObj
      });
    }

    const shouldBlur = shouldBlurTask(activeFocusSession);
    const overlay = document.getElementById('focus-overlay');
    if (shouldBlur) {
      showFocusOverlay(activeFocusSession);
    } else {
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function showFocusOverlay(session, isBriefReblur = false) {
    const overlay = document.getElementById('focus-overlay');
    const overlayName = document.getElementById('overlay-task-name');
    const overlayDesc = document.getElementById('overlay-helper-desc');
    const ring = document.getElementById('overlay-progress-ring');
    const countdown = document.getElementById('overlay-countdown');
    const actions = document.getElementById('overlay-actions-container');

    if (!overlay) return;

    overlay.classList.remove('hidden');
    if (overlayName) overlayName.textContent = session.name || 'Focus Session';
    if (overlayDesc) {
      overlayDesc.textContent = session.task_type === 'url' 
        ? 'Allowed web pages are open in your browser. Navigating outside is strictly restricted.'
        : 'Screen is blurred to maintain deep uninterrupted concentration.';
    }

    if (actions) {
      actions.style.display = session.is_strict ? 'none' : 'flex';
    }

    if (activeFocusTimer) clearInterval(activeFocusTimer);

    activeFocusTimer = setInterval(() => {
      const remainingMs = session.endTime - Date.now();
      if (remainingMs <= 0) {
        stopFocusSession(true);
        return;
      }

      const totalMs = (session.duration_mins || 25) * 60 * 1000;
      const progressFraction = (totalMs - remainingMs) / totalMs;

      if (ring) {
        const offset = 339.29 * progressFraction;
        ring.style.strokeDashoffset = offset;
      }

      if (countdown) {
        const totalSecs = Math.ceil(remainingMs / 1000);
        const mm = String(Math.floor(totalSecs / 60)).padStart(2, '0');
        const ss = String(totalSecs % 60).padStart(2, '0');
        countdown.textContent = `${mm}:${ss}`;
      }
    }, 250);

    if (isBriefReblur) {
      setTimeout(() => {
        if (overlay && session.task_type === 'url') {
          overlay.classList.add('hidden');
        }
      }, 4000);
    }
  }

  async function stopFocusSession(completed = false) {
    if (activeFocusTimer) clearInterval(activeFocusTimer);
    activeFocusTimer = null;

    const overlay = document.getElementById('focus-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (window.soundEngine) window.soundEngine.stopCurrent();

    if (activeFocusSession && window.dayarc) {
      await window.dayarc.stopFocusSession();
      await window.dayarc.recordFocusSession({
        task_id: activeFocusSession.id,
        task_name: activeFocusSession.name,
        duration_mins: activeFocusSession.duration_mins || 25,
        completed: completed
      });
    }

    activeFocusSession = null;
    renderDashboard();
  }

  // Round 10: Auto-Resume Active Focus Task or Namaz Enforcement on Startup / Reboot
  function checkAndResumeActiveSessionOnStartup(targetNow) {
    if (activeFocusSession) return;
    if ((!tasksList || tasksList.length === 0) && (!namazSettings || namazSettings.length === 0) && !settings.active_session_state) {
      return;
    }

    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const todayStr = formatLocalDateStr(targetNow);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = dayNames[targetNow.getDay()];
    const isFriday = targetNow.getDay() === 5;

    // 1. Check if an active scheduled task is currently within its time window
    for (const t of tasksList) {
      const matchesDate = t.specific_date ? t.specific_date === todayStr : (t.repeat_days || []).includes(currentDayName);
      if (matchesDate && t.start_time && /^\d{1,2}:\d{2}$/.test(t.start_time)) {
        const [h, m] = t.start_time.split(':').map(Number);
        const startMins = h * 60 + m;
        const duration = parseInt(t.duration_mins) || 30;
        const endMins = startMins + duration;

        if (currentMins >= startMins && currentMins < endMins) {
          console.log(`[Auto-Resume] Resuming active scheduled task "${t.name}" on startup (${startMins} to ${endMins}, current: ${currentMins})`);
          const remainingMins = endMins - currentMins;
          startSession({
            ...t,
            duration_mins: remainingMins
          });
          return;
        }
      }
    }

    // 2. Check if a prayer window is currently active right now (Jumma on Friday, Zuhr on other days)
    const prayerKeys = isFriday ? ['fajr', 'jumma', 'asr', 'maghrib', 'isha'] : ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
    for (const p of prayerKeys) {
      const setting = namazSettings.find(s => s.prayer_name.toLowerCase() === p);
      if (setting && setting.is_enabled && setting.override_time && /^\d{1,2}:\d{2}$/.test(setting.override_time)) {
        const [h, m] = setting.override_time.split(':').map(Number);
        const startMins = h * 60 + m;
        const duration = parseInt(setting.duration_mins) || (p === 'jumma' ? 45 : 15);
        const endMins = startMins + duration;

        if (currentMins >= startMins && currentMins < endMins) {
          console.log(`[Auto-Resume] Resuming active prayer "${p}" on startup (${startMins} to ${endMins}, current: ${currentMins})`);
          const remainingMins = endMins - currentMins;
          startSession({
            name: `Namaz: ${p.charAt(0).toUpperCase() + p.slice(1)}`,
            duration_mins: remainingMins,
            task_type: 'blur',
            is_strict: 1,
            sound_id: settings.azaan_sound_id || 'bundled-azaan-voice'
          });
          return;
        }
      }
    }

    // 3. Check persisted active session state if present
    if (settings.active_session_state) {
      try {
        const saved = JSON.parse(settings.active_session_state);
        if (saved && saved.endTime && saved.endTime > Date.now()) {
          const remainingMins = Math.ceil((saved.endTime - Date.now()) / 60000);
          if (remainingMins > 0) {
            console.log(`[Auto-Resume] Resuming persisted focus session "${saved.taskName}" (${remainingMins} mins remaining)`);
            startSession({
              id: saved.id,
              name: saved.taskName,
              task_type: saved.isUrlTask ? 'url' : 'blur',
              allowed_urls: saved.allowedUrls || [],
              is_strict: saved.isStrict ? 1 : 0,
              duration_mins: remainingMins,
              sound_id: (saved.sound && saved.sound.id) || null
            });
          }
        }
      } catch (e) {
        console.error('Error resuming active session state:', e);
      }
    }
  }

  function shouldBlurTask(session) {
    if (!session) return false;
    const isNamaz = (session.id && String(session.id).startsWith('namaz-')) ||
                    session.task_type === 'namaz' ||
                    (session.name && session.name.toLowerCase().startsWith('namaz'));
    if (isNamaz) return true;
    if (session.task_type === 'url' || session.isUrlTask) return false;
    if (session.task_type === 'blur' && (session.is_strict === 1 || session.isStrict === true)) return true;
    return false;
  }

  // Reset All Day Arc Data handler in Settings
  const btnResetAllData = document.getElementById('btn-reset-all-data');
  if (btnResetAllData) {
    btnResetAllData.addEventListener('click', async () => {
      const confirmWipe = confirm(
        '⚠️ RESET ALL DAY ARC DATA?\n\n' +
        'This will permanently delete all tasks, Namaz settings, bookmarks, and private settings for a completely clean fresh-install state.\n\n' +
        'Do you want to proceed?'
      );
      if (!confirmWipe) return;

      if (window.dayarc && window.dayarc.resetAllData) {
        await window.dayarc.resetAllData();
        tasksList = [];
        bookmarksList = [];
        namazSettings = [];
        soundsList = [];
        activeFocusSession = null;
        if (activeFocusTimer) clearInterval(activeFocusTimer);
        const overlay = document.getElementById('focus-overlay');
        if (overlay) overlay.classList.add('hidden');

        // Reload fresh settings
        settings = await window.dayarc.getSettings();
        tasksList = await window.dayarc.getTasks();
        namazSettings = await window.dayarc.getNamazSettings();
        soundsList = await window.dayarc.getSounds();
        bookmarksList = await window.dayarc.getBookmarks();

        renderTasksPanel();
        renderDashboard();
        renderNamazPanel();
        renderBookmarksPanel();
        renderSoundsPanel();
        alert('Day Arc has been completely reset to a clean initial state.');
      }
    });
  }

  // Synchronize with background started sessions (Main process scheduler)
  if (window.dayarc && window.dayarc.onSessionStartedBackground) {
    window.dayarc.onSessionStartedBackground((sessionData) => {
      console.log('[Renderer] Received background focus session:', sessionData);
      activeFocusSession = {
        id: sessionData.id,
        name: sessionData.taskName,
        task_type: sessionData.isUrlTask ? 'url' : (sessionData.task_type || 'blur'),
        allowed_urls: sessionData.allowedUrls || [],
        is_strict: sessionData.isStrict ? 1 : 0,
        duration_mins: sessionData.duration_mins,
        endTime: sessionData.endTime,
        sound: sessionData.sound || null
      };

      const shouldBlur = shouldBlurTask(activeFocusSession);
      const overlay = document.getElementById('focus-overlay');
      if (shouldBlur) {
        showFocusOverlay(activeFocusSession);
      } else {
        if (overlay) overlay.classList.add('hidden');
      }

      renderDashboard();
    });
  }

  let lastTriggeredTaskKey = null;

  function checkScheduledTasks(targetNow) {
    // Background scheduler in main.js handles master triggers.
    // renderer.js checks keep UI synced in real-time.
    if (activeFocusSession) return;

    const currentMins = targetNow.getHours() * 60 + targetNow.getMinutes();
    const todayStr = formatLocalDateStr(targetNow);
    const timeKey = `${todayStr}_${currentMins}`;

    if (lastTriggeredTaskKey === timeKey) return;
  }
});
