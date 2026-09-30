// Day Arc Comprehensive Cleanup & Uninstaller Service for Windows
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

class UninstallerService {
  constructor() {
    this.projectDir = path.resolve(__dirname, '..', '..');
    this.appName = 'Day Arc';
    this.appId = 'day-arc';
  }

  // Complete system-wide uninstallation and data wipe
  uninstallAll(options = { removeProjectDb: true }) {
    console.log('====================================================');
    console.log('       DAY ARC — FULL UNINSTALLATION & DATA WIPE     ');
    console.log('====================================================\n');

    const results = {
      processesKilled: false,
      shortcutsRemoved: [],
      registryCleaned: false,
      scheduledTasksRemoved: false,
      appDataWiped: [],
      dbWiped: false
    };

    // 1. Terminate All Day Arc Processes
    try {
      console.log('[1/6] Terminating all Day Arc processes...');
      if (process.platform === 'win32') {
        const killCmds = [
          'taskkill /F /IM day-arc.exe /T',
          'taskkill /F /IM electron.exe /FI "WINDOWTITLE eq Day Arc*"',
          'powershell -NoProfile -Command "Get-Process electron, day-arc -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*day arc*\' -or $_.MainWindowTitle -like \'*Day Arc*\' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
        ];
        killCmds.forEach(cmd => {
          try { execSync(cmd, { stdio: 'ignore' }); } catch (e) {}
        });
      }
      results.processesKilled = true;
      console.log('  ✅ Day Arc processes terminated.');
    } catch (e) {
      console.warn('  ⚠️ Process termination warning:', e.message);
    }

    // 2. Remove Desktop, Start Menu & Startup Shortcuts
    console.log('[2/6] Removing shortcuts from Desktop, Start Menu, and Startup...');
    const shortcutPaths = [
      path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Desktop', `${this.appName}.lnk`),
      path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'OneDrive', 'Desktop', `${this.appName}.lnk`),
      path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop', `${this.appName}.lnk`),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${this.appName}.lnk`),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', `${this.appName}.lnk`),
      path.join(process.env.ALLUSERSPROFILE || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${this.appName}.lnk`),
      path.join(this.projectDir, `${this.appName}.lnk`)
    ];

    shortcutPaths.forEach(s => {
      try {
        if (fs.existsSync(s)) {
          fs.unlinkSync(s);
          results.shortcutsRemoved.push(s);
          console.log(`  ✅ Removed shortcut: ${s}`);
        }
      } catch (e) {
        console.warn(`  ⚠️ Could not remove shortcut ${s}:`, e.message);
      }
    });

    // 3. Remove Windows Registry Keys
    console.log('[3/6] Removing Windows auto-start & uninstall registry keys...');
    if (process.platform === 'win32') {
      const regKeys = [
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "Day Arc"',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "DayArc"',
        'HKCU\\Software\\Day Arc',
        'HKCU\\Software\\day-arc',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Day Arc',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\day-arc'
      ];
      regKeys.forEach(k => {
        try {
          execSync(`reg delete ${k} /f`, { stdio: 'ignore' });
        } catch (e) {}
      });
      results.registryCleaned = true;
      console.log('  ✅ Registry auto-start and uninstall entries removed.');
    }

    // 4. Remove Windows Task Scheduler Tasks
    console.log('[4/6] Removing Windows Task Scheduler tasks...');
    if (process.platform === 'win32') {
      const taskNames = ['DayArcAutoStart', 'DayArcSync', 'Day Arc', 'DayArcScheduler'];
      taskNames.forEach(t => {
        try {
          execSync(`schtasks /Delete /TN "${t}" /F`, { stdio: 'ignore' });
        } catch (e) {}
      });
      results.scheduledTasksRemoved = true;
      console.log('  ✅ Scheduled tasks removed.');
    }

    // 5. Delete AppData / LocalAppData / Temp Data Folders
    console.log('[5/6] Wiping application data folders (AppData/Local, AppData/Roaming)...');
    const dataDirs = [
      path.join(process.env.APPDATA || '', this.appId),
      path.join(process.env.APPDATA || '', this.appName),
      path.join(process.env.LOCALAPPDATA || '', this.appId),
      path.join(process.env.LOCALAPPDATA || '', this.appName),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', this.appId),
      path.join(process.env.LOCALAPPDATA || '', 'Temp', this.appId)
    ];

    dataDirs.forEach(d => {
      try {
        if (fs.existsSync(d)) {
          fs.rmSync(d, { recursive: true, force: true });
          results.appDataWiped.push(d);
          console.log(`  ✅ Removed data folder: ${d}`);
        }
      } catch (e) {
        console.warn(`  ⚠️ Could not remove folder ${d}:`, e.message);
      }
    });

    // 6. Delete Local SQLite Database (dayarc.db)
    if (options.removeProjectDb) {
      console.log('[6/6] Wiping persistent SQLite database file...');
      const dbFiles = [
        path.join(this.projectDir, 'dayarc.db'),
        path.join(this.projectDir, 'dayarc.db-journal')
      ];
      dbFiles.forEach(f => {
        try {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            results.dbWiped = true;
            console.log(`  ✅ Removed database file: ${f}`);
          }
        } catch (e) {
          console.warn(`  ⚠️ Could not remove database file ${f}:`, e.message);
        }
      });
    }

    console.log('\n====================================================');
    console.log('🎉 DAY ARC FULL UNINSTALLATION & DATA WIPE COMPLETE! ');
    console.log('====================================================\n');

    return results;
  }
}

module.exports = new UninstallerService();

if (require.main === module) {
  const service = new UninstallerService();
  service.uninstallAll({ removeProjectDb: true });
}
