// Windows Auto-Start Manager
// Ensures persistent startup via both Windows Startup Shortcut and Registry Run Key

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AutoStartManager {
  constructor() {
    this.projectDir = path.resolve(__dirname, '..', '..');
    this.appName = 'Day Arc';
    this.vbsPath = path.join(this.projectDir, 'Day Arc.vbs');
    this.iconPath = path.join(this.projectDir, 'assets', 'icon.ico');
    this.startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    this.startupShortcutPath = path.join(this.startupFolder, `${this.appName}.lnk`);
  }

  sync(enabled = true) {
    if (process.platform !== 'win32') return;

    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  enable() {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: process.execPath,
          args: ['--hidden']
        });
        console.log(`[AutoStart] Enabled Day Arc auto-start in Windows Login Items (Packaged: ${process.execPath}).`);
        return;
      }

      if (!fs.existsSync(this.startupFolder)) {
        fs.mkdirSync(this.startupFolder, { recursive: true });
      }

      // 1. Create Startup Folder Shortcut (.lnk)
      const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${this.startupShortcutPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "\`"${this.vbsPath.replace(/\\/g, '\\\\')}\`""
$Shortcut.WorkingDirectory = "${this.projectDir.replace(/\\/g, '\\\\')}"
$Shortcut.Description = "Day Arc Startup Runner"
$Shortcut.WindowStyle = 1
if (Test-Path "${this.iconPath.replace(/\\/g, '\\\\')}") {
  $Shortcut.IconLocation = "${this.iconPath.replace(/\\/g, '\\\\')},0"
}
$Shortcut.Save()

# 2. Set Registry HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run entry
$RegPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Set-ItemProperty -Path $RegPath -Name "Day Arc" -Value "wscript.exe \`"${this.vbsPath.replace(/\\/g, '\\\\')}\`""
`;
      const tempPs1 = path.join(this.projectDir, 'sync-autostart.ps1');
      fs.writeFileSync(tempPs1, psScript);
      execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`);
      if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1);

      console.log(`[AutoStart] Enabled Day Arc auto-start in Startup folder and Registry.`);
    } catch (err) {
      console.error('[AutoStart] Failed to enable auto-start:', err.message);
    }
  }

  disable() {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: false });
      }

      if (fs.existsSync(this.startupShortcutPath)) {
        fs.unlinkSync(this.startupShortcutPath);
      }

      const psScript = `
$RegPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
if (Get-ItemProperty -Path $RegPath -Name "Day Arc" -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $RegPath -Name "Day Arc" -ErrorAction SilentlyContinue
}
`;
      const tempPs1 = path.join(this.projectDir, 'remove-autostart.ps1');
      fs.writeFileSync(tempPs1, psScript);
      execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`);
      if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1);

      console.log(`[AutoStart] Disabled Day Arc auto-start.`);
    } catch (err) {
      console.error('[AutoStart] Failed to disable auto-start:', err.message);
    }
  }

  isRegistered() {
    return fs.existsSync(this.startupShortcutPath);
  }
}

module.exports = new AutoStartManager();
