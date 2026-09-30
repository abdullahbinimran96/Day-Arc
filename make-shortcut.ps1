
$WshShell = New-Object -ComObject WScript.Shell
$dests = @("C:\\Users\\PC\\Desktop\\Day Arc.lnk","C:\\Users\\PC\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Day Arc.lnk","C:\\Users\\PC\\OneDrive\\Desktop\\Day Arc.lnk")
foreach ($dest in $dests) {
  $dir = Split-Path -Path $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $Shortcut = $WshShell.CreateShortcut($dest)
  $Shortcut.TargetPath = "C:\\Users\\PC\\OneDrive\\Desktop\\day arc\\node_modules\\electron\\dist\\electron.exe"
  $Shortcut.Arguments = "."
  $Shortcut.WorkingDirectory = "C:\\Users\\PC\\OneDrive\\Desktop\\day arc"
  $Shortcut.Description = "Day Arc - Time Management & Deep Focus"
  $Shortcut.WindowStyle = 1
  if (Test-Path "C:\\Users\\PC\\OneDrive\\Desktop\\day arc\\assets\\icon.ico") {
    $Shortcut.IconLocation = "C:\\Users\\PC\\OneDrive\\Desktop\\day arc\\assets\\icon.ico,0"
  }
  $Shortcut.Save()
}
