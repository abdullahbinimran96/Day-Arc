const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BrowserExtensionInstaller {
  constructor() {
    this.extensionPath = path.resolve(__dirname, '..', '..', 'chrome-extension');
    this.extensionId = 'kpmefjhflkbbffepocgfcjnbkocmpeeo';
    this.extensionVersion = '1.0.0';
  }

  detectInstalledBrowsers() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const browserDefs = [
      {
        id: 'chrome',
        name: 'Google Chrome',
        regKey: `HKCU\\Software\\Google\\Chrome\\Extensions\\${this.extensionId}`,
        paths: [
          path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe')
        ]
      },
      {
        id: 'edge',
        name: 'Microsoft Edge',
        regKey: `HKCU\\Software\\Microsoft\\Edge\\Extensions\\${this.extensionId}`,
        paths: [
          path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ]
      },
      {
        id: 'brave',
        name: 'Brave Browser',
        regKey: `HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${this.extensionId}`,
        paths: [
          path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
        ]
      },
      {
        id: 'opera',
        name: 'Opera',
        regKey: `HKCU\\Software\\Opera Software\\Opera Stable\\Extensions\\${this.extensionId}`,
        paths: [
          path.join(localAppData, 'Programs', 'Opera', 'opera.exe'),
          path.join(programFiles, 'Opera', 'opera.exe')
        ]
      },
      {
        id: 'vivaldi',
        name: 'Vivaldi',
        regKey: `HKCU\\Software\\Vivaldi\\Extensions\\${this.extensionId}`,
        paths: [
          path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'),
          path.join(programFiles, 'Vivaldi', 'Application', 'vivaldi.exe')
        ]
      }
    ];

    const detected = [];
    for (const b of browserDefs) {
      let isInstalled = false;
      for (const exePath of b.paths) {
        if (fs.existsSync(exePath)) {
          isInstalled = true;
          detected.push({ ...b, exePath });
          break;
        }
      }
      // If none of the specific exe files exist, still register standard registry entries for Chrome/Edge
      if (!isInstalled && (b.id === 'chrome' || b.id === 'edge')) {
        detected.push({ ...b, exePath: null });
      }
    }
    return detected;
  }

  installAll() {
    const browsers = this.detectInstalledBrowsers();
    const results = [];

    for (const b of browsers) {
      try {
        const cmdPath = `reg add "${b.regKey}" /v path /t REG_SZ /d "${this.extensionPath}" /f`;
        const cmdVer = `reg add "${b.regKey}" /v version /t REG_SZ /d "${this.extensionVersion}" /f`;

        execSync(cmdPath, { stdio: 'ignore' });
        execSync(cmdVer, { stdio: 'ignore' });

        results.push({ browser: b.name, id: b.id, status: 'installed', regKey: b.regKey });
        console.log(`[Extension Installer] Successfully registered extension in ${b.name} (${b.regKey})`);
      } catch (err) {
        console.warn(`[Extension Installer] Could not register for ${b.name}: ${err.message}`);
        results.push({ browser: b.name, id: b.id, status: 'failed', error: err.message });
      }
    }

    return results;
  }
}

module.exports = new BrowserExtensionInstaller();
