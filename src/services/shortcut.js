const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..', '..');
const appName = 'Day Arc';
const desktopDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Desktop');
const oneDriveDesktop = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'OneDrive', 'Desktop');
const publicDesktop = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
const startMenuDir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');

const shortcutDestinations = [
  path.join(desktopDir, `${appName}.lnk`),
  path.join(startMenuDir, `${appName}.lnk`)
];
if (fs.existsSync(oneDriveDesktop)) {
  shortcutDestinations.push(path.join(oneDriveDesktop, `${appName}.lnk`));
}

const electronExe = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const vbsPath = path.join(projectDir, 'Day Arc.vbs');
const iconIcoPath = path.join(projectDir, 'assets', 'icon.ico');

// Ensure icon.ico exists from icon.png
if (fs.existsSync(path.join(projectDir, 'assets', 'icon.png')) && !fs.existsSync(iconIcoPath)) {
  try {
    const pngBuffer = fs.readFileSync(path.join(projectDir, 'assets', 'icon.png'));
    const icoHeader = Buffer.alloc(6 + 16);
    icoHeader.writeUInt16LE(0, 0);
    icoHeader.writeUInt16LE(1, 2);
    icoHeader.writeUInt16LE(1, 4);
    icoHeader.writeUInt8(0, 6);
    icoHeader.writeUInt8(0, 7);
    icoHeader.writeUInt8(0, 8);
    icoHeader.writeUInt8(0, 9);
    icoHeader.writeUInt16LE(1, 10);
    icoHeader.writeUInt16LE(32, 12);
    icoHeader.writeUInt32LE(pngBuffer.length, 14);
    icoHeader.writeUInt32LE(22, 18);
    const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
    fs.writeFileSync(iconIcoPath, icoBuffer);
  } catch (e) {}
}

let targetPath = electronExe;
let args = '.';

if (!fs.existsSync(electronExe)) {
  targetPath = 'wscript.exe';
  args = `"${vbsPath}"`;
}

function createAllShortcuts() {
  const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$dests = @(${shortcutDestinations.map(d => `"${d.replace(/\\/g, '\\\\')}"`).join(',')})
foreach ($dest in $dests) {
  $dir = Split-Path -Path $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $Shortcut = $WshShell.CreateShortcut($dest)
  $Shortcut.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
  $Shortcut.Arguments = "${args.replace(/\\/g, '\\\\')}"
  $Shortcut.WorkingDirectory = "${projectDir.replace(/\\/g, '\\\\')}"
  $Shortcut.Description = "Day Arc - Time Management & Deep Focus"
  $Shortcut.WindowStyle = 1
  if (Test-Path "${iconIcoPath.replace(/\\/g, '\\\\')}") {
    $Shortcut.IconLocation = "${iconIcoPath.replace(/\\/g, '\\\\')},0"
  }
  $Shortcut.Save()
}
`;

  try {
    fs.writeFileSync(path.join(projectDir, 'make-shortcut.ps1'), psScript);
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(projectDir, 'make-shortcut.ps1')}"`);
    console.log(`✅ Desktop & Start Menu shortcuts created with icon.`);
  } catch (e) {
    console.error('Error creating shortcuts via PowerShell:', e.message);
  }
}

function removeAllShortcuts() {
  const allPossible = [
    path.join(desktopDir, `${appName}.lnk`),
    path.join(oneDriveDesktop, `${appName}.lnk`),
    path.join(publicDesktop, `${appName}.lnk`),
    path.join(startMenuDir, `${appName}.lnk`),
    path.join(projectDir, `${appName}.lnk`)
  ];

  allPossible.forEach(p => {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {}
  });
  console.log(`✅ All Day Arc Desktop & Start Menu shortcuts removed.`);
}

module.exports = { createAllShortcuts, removeAllShortcuts };

if (require.main === module) {
  createAllShortcuts();
}
