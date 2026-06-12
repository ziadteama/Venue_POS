@echo off
setlocal
title Venue POS local-agent — install (PM2 + Windows startup)
cd /d "%~dp0.."

echo.
echo Venue POS local-agent microservice — install
echo Root: %CD%
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo Administrator rights required. Re-launching elevated...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%CD%' -Wait"
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -ServiceRoot "%CD%"
set RC=%ERRORLEVEL%
if not "%RC%"=="0" (
  echo.
  echo Install failed with exit code %RC%.
  pause
  exit /b %RC%
)

echo.
pause
exit /b 0
