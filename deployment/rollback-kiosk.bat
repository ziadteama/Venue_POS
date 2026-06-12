@echo off
setlocal EnableDelayedExpansion
title Venue POS — Rollback kiosk + PM2 agent
cd /d "%~dp0"
call "%~dp0_common.bat" || exit /b 1

if /i not "%~1"=="elevated" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%COMSPEC%' -ArgumentList '/c \"\"%~f0\"\" elevated' -Verb RunAs -Wait"
    exit /b !errorlevel!
  )
)

echo.
echo === Rollback kiosk shell + PM2 agent ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& '%WIN_OPS%\rollback-kiosk.ps1'; . '%WIN_OPS%\pos-launcher.ps1'; Uninstall-VenuePosPm2Agent -InstallRoot '%INSTALL_ROOT%'"

echo.
echo Rollback complete. Reboot recommended.
pause
exit /b 0
