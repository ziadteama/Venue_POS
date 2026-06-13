@echo off
title Venue POS - Rollback kiosk + PM2 agent
cd /d "%~dp0"

call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1


call "%~dp0_common.bat"
if errorlevel 1 exit /b 1

echo.
echo === Rollback kiosk shell + PM2 agent ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& '%WIN_OPS%\rollback-kiosk.ps1'; . '%WIN_OPS%\pos-launcher.ps1'; Uninstall-VenuePosPm2Agent -InstallRoot '%INSTALL_ROOT%'"

echo.
echo Rollback complete. Reboot recommended.
call "%~dp0_helpers.bat" PauseAlways
exit /b 0
