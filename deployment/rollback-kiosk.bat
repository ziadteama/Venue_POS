@echo off
setlocal EnableDelayedExpansion
title Venue POS — Rollback kiosk
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
echo === Rollback kiosk shell + stop agent service ===
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%WIN_OPS%\rollback-kiosk.ps1'"
nssm stop VenuePosAgent 2>nul
nssm remove VenuePosAgent confirm 2>nul

echo.
echo Rollback complete. Reboot recommended.
pause
exit /b 0
