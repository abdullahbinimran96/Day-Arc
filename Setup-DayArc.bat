@echo off
title Day Arc Setup & Launcher
echo ====================================================
echo             Day Arc Setup & Launcher
echo ====================================================
echo.
echo [1/3] Refreshing Windows Desktop Shortcut with App Icon...
node src/services/shortcut.js
echo.
echo [2/3] Registering Windows Auto-Start...
node -e "const auto = require('./src/services/autostart'); auto.sync(true);"
echo.
echo [3/3] Launching Day Arc...
wscript.exe "Day Arc.vbs"
echo.
echo [SUCCESS] Day Arc is running and ready on your desktop!
timeout /t 3 >nul
exit
