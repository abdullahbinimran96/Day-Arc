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
  
  DetailPrint "Removing auto-start registry entries..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Day Arc"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DayArc"

  DetailPrint "Removing scheduled tasks..."
  nsExec::Exec 'schtasks /Delete /TN "DayArcAutoStart" /F'
  nsExec::Exec 'schtasks /Delete /TN "DayArcSync" /F'

  DetailPrint "Removing desktop and start menu shortcuts..."
  Delete "$DESKTOP\Day Arc.lnk"
  Delete "$SMPROGRAMS\Day Arc.lnk"
  RMDir /r "$SMPROGRAMS\Day Arc"
!macroend

