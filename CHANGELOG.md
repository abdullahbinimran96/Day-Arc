# Day Arc — Maintenance & Release Changelog

## [2026-08-27] — Comprehensive Daily Maintenance & System Self-Checkup

### 1. Scheduler & Enforcement Audit
- **Task Timing & Edge Cases**: Verified scheduled execution of blur and multi-URL tasks. Validated midnight date-rollover modulo 1440 calculations (e.g. 23:55 + 20m = 00:15) and back-to-back continuous scheduling with 0 gap.
- **Namaz & Jumma Prayer Engine**: Verified offline calculation for daily prayers and Friday Jumma schedule using Karachi offline coordinates.
- **Minimization & Window Watchdog**: Confirmed dual-layer window enforcement (`IsIconic` Win32 API + Chrome extension `onBoundsChanged`/`onFocusChanged`) prevents browser minimization escapes during active URL focus tasks.
- **Unauthorized App/Folder Lockdown**: Verified automatic suppression/termination of unauthorized desktop tools (Notepad, Calc, CMD) and File Explorer folders during active strict tasks.
- **Taskbar Floating Widget**: Verified continuous 5-minute reverse ticker and live mm:ss countdown display without flickering or desync.

### 2. Data Integrity & Persistence
- **SQL.js Auto-Save & Disk Sync**: Verified 300ms debounced disk sync (`persistNow()`) across all CRUD operations.
- **Private Tab Security**: Confirmed SHA-256 hashing for private tab unlock passwords and recovery codes before storage.
- **Offline Blocklist**: Verified StevenBlack adult domain blocklist engine (83 compiled offline domain seeds).
- **Sound Library Integrity**: Verified audio files originate exclusively from `resources/sounds` with base64 streaming.

### 3. Startup & Platform Behavior
- **Auto-Start Registration**: Verified Windows Startup shortcut and Registry `HKCU\...\Run` keys use hidden `Day Arc.vbs` WScript runner (no console window).
- **Sleep / Wake Resilience**: Verified `powerMonitor.on('resume')` triggers immediate scheduler resynchronization.
- **Background Tray Lifecycle**: Verified "Run in background" keeps tray process alive and "Quit" terminates all processes cleanly without orphaned workers.

### 4. Performance & Resource Footprint
- **Cold Boot & Init Time**: 382.22 ms
- **Heap Used**: 6.27 MB (Heap Total: 11.73 MB)
- **Resident Set Size (RSS)**: 109.08 MB
- **Leaking Timers/Listeners**: 0 detected; interval handles properly cleared upon teardown.

### 5. UI & Error Handling
- **Panels Verified**: All 7 primary navigation views (`panel-dashboard`, `panel-namaz`, `panel-tasks`, `panel-bookmarks`, `panel-private-tab`, `panel-sounds`, `panel-settings`) validated.
- **Internationalization**: 100% standard English strings.
- **Test Suite Results**: 10/10 test suites (**174 / 174 test assertions**) passing 100% green.
- **Clean Database State**: Confirmed zero default tasks and zero pre-seeded prayers on fresh install.
