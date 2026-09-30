// SQLite WASM Database Layer with sql.js and persistent disk sync

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class DatabaseManager {
  constructor() {
    this.db = null;
    let targetPath = path.join(__dirname, '..', '..', 'dayarc.db');
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getPath === 'function') {
        const userDir = app.getPath('userData');
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        targetPath = path.join(userDir, 'dayarc.db');
      }
    } catch (e) {}
    this.dbPath = targetPath;
    this.saveTimeout = null;
  }

  async init() {
    if (this.db) return this.db;

    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
        console.log('Existing Day Arc database loaded from disk.');
      } catch (e) {
        console.warn('Could not read existing database, creating fresh one:', e);
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
      console.log('Created fresh Day Arc database.');
    }

    this.initTables();
    this.migrateTables();
    this.seedDefaults();
    this.persistNow();

    return this.db;
  }

  initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS namaz_settings (
        prayer_name TEXT PRIMARY KEY,
        duration_mins INTEGER DEFAULT 15,
        is_enabled INTEGER DEFAULT 0,
        override_time TEXT,
        after_azaan_action TEXT DEFAULT 'resume'
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_mins INTEGER NOT NULL,
        task_type TEXT NOT NULL, -- 'blur' or 'url'
        allowed_urls TEXT,       -- JSON array
        repeat_days TEXT,        -- JSON array e.g. ["Mon","Tue"]
        specific_date TEXT,      -- Optional 'YYYY-MM-DD'
        is_strict INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        sound_id TEXT,
        created_at TEXT,
        updated_at TEXT,
        last_run_occurrence_key TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        folder TEXT DEFAULT 'General',
        tags TEXT,               -- JSON array
        icon TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sounds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        duration TEXT NOT NULL,
        audio_data TEXT,         -- Base64 data url or path
        is_builtin INTEGER DEFAULT 0,
        used_in TEXT,            -- JSON array of categories
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS private_blocklist (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        is_regex INTEGER DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS focus_history (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        task_name TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        duration_mins INTEGER,
        completed INTEGER DEFAULT 1,
        created_at TEXT
      );
    `);
  }

  migrateTables() {
    // Add columns to tasks if missing
    try { this.db.run('ALTER TABLE tasks ADD COLUMN specific_date TEXT'); } catch (e) {}
    try { this.db.run('ALTER TABLE tasks ADD COLUMN end_time TEXT'); } catch (e) {}
    try { this.db.run('ALTER TABLE tasks ADD COLUMN is_enabled INTEGER DEFAULT 1'); } catch (e) {}
    try { this.db.run('ALTER TABLE tasks ADD COLUMN last_run_occurrence_key TEXT'); } catch (e) {}
    try { this.db.run('ALTER TABLE tasks ADD COLUMN updated_at TEXT'); } catch (e) {}

    // Clean out legacy placeholder sounds (sound-azaan-makkah, deep-rain, etc.) so only resources/sounds exist
    try {
      this.db.run("DELETE FROM sounds WHERE id IN ('sound-azaan-makkah', 'sound-azaan-madinah', 'sound-deep-rain', 'sound-binaural-focus', 'sound-gentle-bell')");
    } catch (e) {}
  }

  seedDefaults() {
    // 1. Default Core Settings Only (No tasks, No pre-seeded prayers)
    const defaultSettings = {
      auto_start: '0',
      run_in_background: '1',
      blur_enforcement_enabled: '1',
      time_format: '12h', // '12h' (AM/PM) or '24h'
      city: 'Karachi',
      country: 'Pakistan',
      lat: '24.8607',
      lng: '67.0011',
      timezone: 'Asia/Karachi',
      gmt_offset: '5',
      default_browser: 'chrome',
      default_profile: 'Default',
      azaan_sound_id: 'bundled-azaan-voice',
      block_adult_content: '0',
      idle_lock_mins: '3',
      private_tab_password_hash: '',
      private_tab_recovery_code: '',
      active_session_state: ''
    };

    for (const [key, val] of Object.entries(defaultSettings)) {
      const existing = this.getSetting(key);
      if (existing === null || existing === undefined) {
        this.setSetting(key, val, false);
      }
    }

    // Mark seed completed permanently
    this.setSetting('seed_completed', '1', false);
  }

  // --- Settings Methods ---
  getSetting(key) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    let val = null;
    if (stmt.step()) {
      val = stmt.getAsObject().value;
    }
    stmt.free();
    return val;
  }

  setSetting(key, val, schedule = true) {
    this.db.run(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(val)]
    );
    if (schedule) this.schedulePersist();
  }

  getAllSettings() {
    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const result = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result[row.key] = row.value;
    }
    stmt.free();
    return result;
  }

  // --- Namaz Methods ---
  getNamazSettings() {
    const stmt = this.db.prepare('SELECT * FROM namaz_settings ORDER BY CASE prayer_name WHEN "Fajr" THEN 1 WHEN "Zuhr" THEN 2 WHEN "Asr" THEN 3 WHEN "Maghrib" THEN 4 WHEN "Isha" THEN 5 ELSE 6 END');
    const list = [];
    while (stmt.step()) {
      list.push(stmt.getAsObject());
    }
    stmt.free();
    return list;
  }

  updateNamazSetting(prayerName, durationMins, isEnabled, overrideTime, afterAzaanAction) {
    this.db.run(
      `INSERT OR REPLACE INTO namaz_settings (prayer_name, duration_mins, is_enabled, override_time, after_azaan_action)
       VALUES (?, ?, ?, ?, ?)`,
      [
        prayerName,
        parseInt(durationMins) || 15,
        isEnabled ? 1 : 0,
        overrideTime ? overrideTime.trim() : null,
        afterAzaanAction || 'resume'
      ]
    );
    this.schedulePersist();
  }

  // --- Tasks Methods ---
  getTasks() {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY start_time ASC');
    const list = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      row.is_enabled = row.is_enabled !== undefined ? (row.is_enabled === 1 || row.is_enabled === '1' || row.is_enabled === true ? 1 : 0) : 1;
      try {
        const raw = JSON.parse(row.allowed_urls || '[]');
        row.allowed_urls = raw.map(u => {
          if (!u) return '';
          let clean = String(u).trim().replace(/^(https?:\/\/)+/gi, '');
          return clean.length > 0 ? 'https://' + clean : '';
        }).filter(u => u.length > 8);
      } catch (e) { row.allowed_urls = []; }
      try { row.repeat_days = JSON.parse(row.repeat_days || '[]'); } catch (e) { row.repeat_days = []; }
      list.push(row);
    }
    stmt.free();
    return list;
  }

  saveTask(task) {
    const id = task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Auto-calculate duration_mins from start_time and end_time
    let durationMins = parseInt(task.duration_mins) || 30;
    let endTime = task.end_time || null;

    if (task.start_time && task.end_time) {
      const [sh, sm] = task.start_time.split(':').map(Number);
      const [eh, em] = task.end_time.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      if (endMins > startMins) {
        durationMins = endMins - startMins;
      }
    } else if (task.start_time && !endTime && durationMins > 0) {
      const [sh, sm] = task.start_time.split(':').map(Number);
      const endTotal = (sh * 60 + sm + durationMins) % 1440;
      const eh = Math.floor(endTotal / 60);
      const em = endTotal % 60;
      endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    const cleanUrls = (task.allowed_urls || [])
      .map(u => {
        if (!u) return '';
        let clean = String(u).trim().replace(/^(https?:\/\/)+/gi, '');
        return clean.length > 0 ? 'https://' + clean : '';
      })
      .filter(u => u.length > 8);

    const isEnabled = task.is_enabled !== undefined ? (task.is_enabled ? 1 : 0) : 1;
    const updatedAt = new Date().toISOString();

    this.db.run(
      `INSERT OR REPLACE INTO tasks (id, name, start_time, end_time, duration_mins, task_type, allowed_urls, repeat_days, specific_date, is_strict, is_enabled, sound_id, created_at, updated_at, last_run_occurrence_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        task.name,
        task.start_time,
        endTime,
        durationMins,
        task.task_type || 'blur',
        JSON.stringify(cleanUrls),
        JSON.stringify(task.repeat_days || []),
        task.specific_date || null,
        task.is_strict ? 1 : 0,
        isEnabled,
        task.sound_id || null,
        task.created_at || new Date().toISOString(),
        updatedAt,
        task.last_run_occurrence_key || null
      ]
    );
    this.schedulePersist();
    return id;
  }

  deleteTask(id) {
    this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
    this.schedulePersist();
  }

  // --- Bookmarks Methods ---
  getBookmarks() {
    const stmt = this.db.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC');
    const list = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try { row.tags = JSON.parse(row.tags || '[]'); } catch (e) { row.tags = []; }
      list.push(row);
    }
    stmt.free();
    return list;
  }

  saveBookmark(bm) {
    const id = bm.id || `bm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.db.run(
      `INSERT OR REPLACE INTO bookmarks (id, title, url, folder, tags, icon, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        bm.title,
        bm.url,
        bm.folder || 'General',
        JSON.stringify(bm.tags || []),
        bm.icon || 'bookmark',
        bm.created_at || new Date().toISOString()
      ]
    );
    this.schedulePersist();
    return id;
  }

  deleteBookmark(id) {
    this.db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
    this.schedulePersist();
  }

  // --- Sounds Methods ---
  getSounds() {
    const stmt = this.db.prepare('SELECT * FROM sounds ORDER BY is_builtin DESC, name ASC');
    const list = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try { row.used_in = JSON.parse(row.used_in || '[]'); } catch (e) { row.used_in = []; }
      list.push(row);
    }
    stmt.free();
    return list;
  }

  saveSound(sound) {
    const id = sound.id || `sound-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.db.run(
      `INSERT OR REPLACE INTO sounds (id, name, duration, audio_data, is_builtin, used_in, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sound.name,
        sound.duration || '00:30',
        sound.audio_data || '',
        sound.is_builtin ? 1 : 0,
        JSON.stringify(sound.used_in || []),
        sound.created_at || new Date().toISOString()
      ]
    );
    this.schedulePersist();
    return id;
  }

  deleteSound(id) {
    this.db.run('DELETE FROM sounds WHERE id = ? AND is_builtin = 0', [id]);
    this.schedulePersist();
  }

  // --- Private Blocklist Methods ---
  getPrivateBlocklist() {
    const stmt = this.db.prepare('SELECT * FROM private_blocklist ORDER BY created_at DESC');
    const list = [];
    while (stmt.step()) {
      list.push(stmt.getAsObject());
    }
    stmt.free();
    return list;
  }

  addBlockedDomain(domain) {
    let cleanDomain = domain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!cleanDomain) return null;

    const id = `blk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    this.db.run('INSERT OR IGNORE INTO private_blocklist (id, domain, created_at) VALUES (?, ?, ?)', [
      id,
      cleanDomain,
      new Date().toISOString()
    ]);
    this.schedulePersist();
    return id;
  }

  addPrivateBlockedDomain(domain) {
    return this.addBlockedDomain(domain);
  }

  removeBlockedDomain(id) {
    this.db.run('DELETE FROM private_blocklist WHERE id = ?', [id]);
    this.schedulePersist();
  }

  removePrivateBlockedDomain(id) {
    return this.removeBlockedDomain(id);
  }

  // --- Focus Stats & History Methods ---
  recordFocusSession(session) {
    const id = `foc-${Date.now()}`;
    this.db.run(
      `INSERT INTO focus_history (id, task_id, task_name, start_time, end_time, duration_mins, completed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.task_id || null,
        session.task_name,
        session.start_time,
        session.end_time || new Date().toISOString(),
        session.duration_mins,
        session.completed ? 1 : 0,
        new Date().toISOString()
      ]
    );
    this.schedulePersist();
  }

  getStatsToday() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as completedCount, SUM(duration_mins) as totalMins FROM focus_history WHERE created_at LIKE ? AND completed = 1'
    );
    stmt.bind([`${todayStr}%`]);
    let completedToday = 0;
    let focusMinutesToday = 0;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      completedToday = row.completedCount || 0;
      focusMinutesToday = row.totalMins || 0;
    }
    stmt.free();

    // Calculate actual consecutive streak days from focus_history
    let streakDays = 0;
    try {
      const streakStmt = this.db.prepare(
        'SELECT DISTINCT substr(created_at, 1, 10) as dayStr FROM focus_history WHERE completed = 1 ORDER BY dayStr DESC'
      );
      const days = [];
      while (streakStmt.step()) {
        days.push(streakStmt.getAsObject().dayStr);
      }
      streakStmt.free();

      if (days.length > 0) {
        let checkDate = new Date();
        const curDayStr = checkDate.toISOString().slice(0, 10);
        let idx = 0;
        if (days[0] === curDayStr) {
          streakDays++;
          idx = 1;
        }
        while (idx < days.length) {
          checkDate.setDate(checkDate.getDate() - 1);
          const prevDayStr = checkDate.toISOString().slice(0, 10);
          if (days[idx] === prevDayStr) {
            streakDays++;
            idx++;
          } else {
            break;
          }
        }
      }
    } catch (e) {
      streakDays = completedToday > 0 ? 1 : 0;
    }

    return {
      completedToday,
      focusMinutesToday,
      streakDays
    };
  }

  resetAllData() {
    if (!this.db) return;
    try {
      this.db.run(`
        DELETE FROM tasks;
        DELETE FROM namaz_settings;
        DELETE FROM bookmarks;
        DELETE FROM private_blocklist;
        DELETE FROM focus_history;
        DELETE FROM settings;
      `);
      this.setSetting('auto_start', '0', false);
      this.setSetting('run_in_background', '1', false);
      this.setSetting('blur_enforcement_enabled', '1', false);
      this.setSetting('time_format', '12h', false);
      this.setSetting('default_browser', 'chrome', false);
      this.setSetting('default_profile', 'Default', false);
      this.setSetting('active_session_state', '', false);
      this.setSetting('seed_completed', '1', false);
      this.persistNow();
      console.log('[Database] All Day Arc user data has been completely reset to clean state.');
    } catch (e) {
      console.error('[Database] Reset all data error:', e);
    }
  }

  schedulePersist() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.persistNow();
    }, 300);
  }

  persistNow() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      console.log('Database successfully saved to disk (dayarc.db)');
    } catch (e) {
      console.error('Failed to write database to disk:', e);
    }
  }
}

module.exports = new DatabaseManager();
