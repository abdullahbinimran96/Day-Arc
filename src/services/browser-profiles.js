// Browser and Profile Detection Service for Windows

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

class BrowserProfileService {
  constructor() {
    this.localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
    this.appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    this.programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    this.programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    let extPath = path.resolve(__dirname, '..', '..', 'chrome-extension');
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.isPackaged) {
        const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'chrome-extension');
        const rootExt = path.join(process.resourcesPath, 'chrome-extension');
        if (fs.existsSync(unpacked)) extPath = unpacked;
        else if (fs.existsSync(rootExt)) extPath = rootExt;
      }
    } catch (e) {}
    this.extensionPath = extPath;
    this.lastLaunchedPid = null;
  }

  detectBrowsers() {
    const browsers = [];

    // 1. Google Chrome
    const chromePaths = [
      path.join(this.programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(this.programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(this.localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    const chromeUserData = path.join(this.localAppData, 'Google', 'Chrome', 'User Data');

    if (chromeExe || fs.existsSync(chromeUserData)) {
      const profiles = this.getChromiumProfiles(chromeUserData);
      browsers.push({
        id: 'chrome',
        name: 'Chrome',
        icon: 'travel_explore',
        exePath: chromeExe || 'chrome',
        userDataDir: chromeUserData,
        profiles: profiles.length > 0 ? profiles : [{ id: 'Default', name: 'Default User', avatar: '' }]
      });
    }

    // 2. Microsoft Edge
    const edgePaths = [
      path.join(this.programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(this.programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(this.localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];
    const edgeExe = edgePaths.find(p => fs.existsSync(p));
    const edgeUserData = path.join(this.localAppData, 'Microsoft', 'Edge', 'User Data');

    if (edgeExe || fs.existsSync(edgeUserData)) {
      const profiles = this.getChromiumProfiles(edgeUserData);
      browsers.push({
        id: 'edge',
        name: 'Edge',
        icon: 'travel_explore',
        exePath: edgeExe || 'msedge',
        userDataDir: edgeUserData,
        profiles: profiles.length > 0 ? profiles : [{ id: 'Default', name: 'Default User', avatar: '' }]
      });
    }

    // 3. Brave Browser
    const bravePaths = [
      path.join(this.programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(this.programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(this.localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ];
    const braveExe = bravePaths.find(p => fs.existsSync(p));
    const braveUserData = path.join(this.localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data');

    if (braveExe || fs.existsSync(braveUserData)) {
      const profiles = this.getChromiumProfiles(braveUserData);
      browsers.push({
        id: 'brave',
        name: 'Brave',
        icon: 'travel_explore',
        exePath: braveExe || 'brave',
        userDataDir: braveUserData,
        profiles: profiles.length > 0 ? profiles : [{ id: 'Default', name: 'Default User', avatar: '' }]
      });
    }

    // 4. Mozilla Firefox
    const firefoxPaths = [
      path.join(this.programFiles, 'Mozilla Firefox', 'firefox.exe'),
      path.join(this.programFilesX86, 'Mozilla Firefox', 'firefox.exe')
    ];
    const firefoxExe = firefoxPaths.find(p => fs.existsSync(p));
    const firefoxProfilesIni = path.join(this.appData, 'Mozilla', 'Firefox', 'profiles.ini');

    if (firefoxExe || fs.existsSync(firefoxProfilesIni)) {
      const profiles = this.getFirefoxProfiles(firefoxProfilesIni);
      browsers.push({
        id: 'firefox',
        name: 'Firefox',
        icon: 'travel_explore',
        exePath: firefoxExe || 'firefox',
        userDataDir: path.dirname(firefoxProfilesIni),
        profiles: profiles.length > 0 ? profiles : [{ id: 'default-release', name: 'Default Profile', avatar: '' }]
      });
    }

    // 5. Arc Browser (Windows)
    const arcPaths = [
      path.join(this.localAppData, 'Programs', 'Arc', 'Arc.exe'),
      path.join(this.programFiles, 'Arc', 'Arc.exe')
    ];
    const arcExe = arcPaths.find(p => fs.existsSync(p));
    if (arcExe) {
      browsers.push({
        id: 'arc',
        name: 'Arc',
        icon: 'travel_explore',
        exePath: arcExe,
        userDataDir: path.join(this.localAppData, 'Arc', 'User Data'),
        profiles: [{ id: 'Default', name: 'Default Space', avatar: '' }]
      });
    }

    return browsers;
  }

  getChromiumProfiles(userDataDir) {
    const profiles = [];
    if (!fs.existsSync(userDataDir)) return profiles;

    try {
      const localStateFile = path.join(userDataDir, 'Local State');
      if (fs.existsSync(localStateFile)) {
        const localState = JSON.parse(fs.readFileSync(localStateFile, 'utf8'));
        const infoCache = localState?.profile?.info_cache || {};

        for (const [dirName, data] of Object.entries(infoCache)) {
          profiles.push({
            id: dirName,
            name: data.name || dirName,
            avatar: data.avatar_icon || '',
            isDefault: dirName === 'Default'
          });
        }
      }
    } catch (e) {
      console.warn('Error reading Chromium Local State:', e.message);
    }

    // Fallback: check directories directly if infoCache was empty
    if (profiles.length === 0) {
      try {
        const entries = fs.readdirSync(userDataDir);
        for (const entry of entries) {
          if (entry === 'Default' || entry.startsWith('Profile ')) {
            profiles.push({
              id: entry,
              name: entry === 'Default' ? 'Default Profile' : entry,
              avatar: '',
              isDefault: entry === 'Default'
            });
          }
        }
      } catch (e) {}
    }

    if (profiles.length === 0) {
      profiles.push({ id: 'Default', name: 'Default Profile', avatar: '', isDefault: true });
    }

    return profiles;
  }

  getFirefoxProfiles(profilesIniPath) {
    const profiles = [];
    if (!fs.existsSync(profilesIniPath)) return profiles;

    try {
      const content = fs.readFileSync(profilesIniPath, 'utf8');
      const sections = content.split(/\[Profile\d+\]/);
      for (const section of sections) {
        const nameMatch = section.match(/Name=([^\r\n]+)/);
        const pathMatch = section.match(/Path=([^\r\n]+)/);
        const defaultMatch = section.match(/Default=1/);

        if (nameMatch && pathMatch) {
          profiles.push({
            id: pathMatch[1],
            name: nameMatch[1],
            avatar: '',
            isDefault: !!defaultMatch
          });
        }
      }
    } catch (e) {
      console.warn('Error reading Firefox profiles.ini:', e.message);
    }

    return profiles;
  }

  launchUrl(browserId, profileId, urls = []) {
    if (!urls || urls.length === 0) {
      console.warn('[TRIGGER] No URLs provided to launchUrl');
      return;
    }
    const browsers = this.detectBrowsers();
    const defaultBrowserId = browserId || 'chrome';
    const browser = browsers.find(b => b.id === defaultBrowserId) || browsers[0];

    const urlList = (Array.isArray(urls) ? urls : [urls]).filter(u => u && u.trim().length > 0);
    console.log(`[TRIGGER] URL(s) sent to browser:`, urlList);

    if (!browser) {
      console.log(`[TRIGGER] Fallback default browser open for URLs:`, urlList);
      urlList.forEach(u => {
        exec(`start "" "${u}"`, (err) => {
          if (err) console.error(`[TRIGGER] Browser launch result: error — ${err.message}`);
          else console.log(`[TRIGGER] Browser launch result: success for ${u}`);
        });
      });
      return;
    }

    const exePath = browser.exePath;
    let args = [];

    if (browser.id === 'firefox') {
      if (profileId) args.push('-P', profileId);
      args.push(...urlList);
    } else {
      // Chromium based (Chrome, Edge, Brave, Arc)
      if (profileId && profileId !== 'Default') {
        args.push(`--profile-directory=${profileId}`);
      }
      if (this.extensionPath && fs.existsSync(this.extensionPath)) {
        args.push(`--load-extension=${this.extensionPath}`);
      }
      args.push('--new-window', '--start-maximized', ...urlList);
    }

    const commandStr = `"${exePath}" ${args.map(a => `"${a}"`).join(' ')}`;
    console.log(`[TRIGGER] Browser launch command: ${commandStr}`);

    try {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: 'ignore',
        shell: false
      });
      child.unref();
      this.lastLaunchedPid = child.pid;
      console.log(`[TRIGGER] Browser launch result: success (PID: ${child.pid})`);
    } catch (err) {
      console.error(`[TRIGGER] Browser launch result: error (spawn failed, trying exec) — ${err.message}`);
      exec(`start "" "${exePath}" ${args.map(a => `"${a}"`).join(' ')}`, (execErr) => {
        if (execErr) {
          console.error(`[TRIGGER] Browser launch result: error (exec fallback failed) — ${execErr.message}`);
        } else {
          console.log(`[TRIGGER] Browser launch result: success (exec fallback)`);
        }
      });
    }
  }

  closeTaskBrowser() {
    if (this.lastLaunchedPid) {
      try {
        console.log(`[TRIGGER] Terminating task browser process (PID: ${this.lastLaunchedPid})`);
        exec(`taskkill /F /PID ${this.lastLaunchedPid} /T`, () => {});
      } catch (e) {
        console.warn('[TRIGGER] Could not terminate task browser process:', e.message);
      }
      this.lastLaunchedPid = null;
    }
  }
}

module.exports = new BrowserProfileService();
