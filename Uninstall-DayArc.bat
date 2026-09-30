@echo off
title Day Arc Full Uninstaller & Data Wipe
echo ====================================================
echo             Day Arc Full Uninstaller
echo ====================================================
echo.
echo Performing complete uninstallation, shortcut removal, and data wipe...
node src/services/uninstaller.js
echo.
echo ====================================================
echo [DONE] Day Arc has been completely uninstalled and all data wiped!
echo To delete the app source files completely, you can now delete this 'day arc' folder.
echo ====================================================
pause
exit
