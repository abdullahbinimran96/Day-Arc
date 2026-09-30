; Custom NSIS Installer & Uninstaller Script for Day Arc

!macro customInstall
  DetailPrint "Ensuring previous Day Arc instances are closed before updating files..."
  nsExec::Exec 'taskkill /F /IM "Day Arc.exe" /T'
  nsExec::Exec 'taskkill /F /IM day-arc.exe /T'
!macroend

!macro customUnInstall
  DetailPrint "Terminating Day Arc background processes..."
  nsExec::Exec 'taskkill /F /IM "Day Arc.exe" /T'
  nsExec::Exec 'taskkill /F /IM day-arc.exe /T'
  nsExec::Exec 'taskkill /F /IM electron.exe /FI "WINDOWTITLE eq Day Arc*"'
  Sleep 1000
  
  DetailPrint "Removing auto-start registry entries..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Day Arc"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DayArc"

  DetailPrint "Removing scheduled tasks..."
  nsExec::Exec 'schtasks /Delete /TN "DayArcAutoStart" /F'
  nsExec::Exec 'schtasks /Delete /TN "DayArcSync" /F'
  nsExec::Exec 'schtasks /Delete /TN "DayArcScheduler" /F'

  DetailPrint "Removing browser extension registry entries..."
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\kpmefjhflkbbffepocgfcjnbkocmpeeo"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\kpmefjhflkbbffepocgfcjnbkocmpeeo"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\kpmefjhflkbbffepocgfcjnbkocmpeeo"
  DeleteRegKey HKCU "Software\Opera Software\Opera Stable\Extensions\kpmefjhflkbbffepocgfcjnbkocmpeeo"
  DeleteRegKey HKCU "Software\Vivaldi\Extensions\kpmefjhflkbbffepocgfcjnbkocmpeeo"

  DetailPrint "Removing application registry keys..."
  DeleteRegKey HKCU "Software\Day Arc"
  DeleteRegKey HKCU "Software\day-arc"

  DetailPrint "Removing desktop and start menu shortcuts..."
  Delete "$DESKTOP\Day Arc.lnk"
  Delete "$SMPROGRAMS\Day Arc.lnk"
  RMDir /r "$SMPROGRAMS\Day Arc"

  DetailPrint "Wiping user application data, database and caches for fresh re-installation..."
  RMDir /r "$APPDATA\Day Arc"
  RMDir /r "$APPDATA\day-arc"
  RMDir /r "$LOCALAPPDATA\Day Arc"
  RMDir /r "$LOCALAPPDATA\day-arc"
  RMDir /r "$LOCALAPPDATA\day-arc-updater"
  RMDir /r "$LOCALAPPDATA\Programs\Day Arc"
  RMDir /r "$LOCALAPPDATA\Programs\day-arc"
!macroend

