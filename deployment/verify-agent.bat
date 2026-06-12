@echo off
title Venue POS — Verify local-agent (PM2)
cd /d "%~dp0"
call "%~dp0_common.bat" || exit /b 1

set "PM2_HOME=%PM2_HOME%"

echo.
echo === PM2 status ===
where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: pm2 not installed. Run install-pm2.bat first.
  pause
  exit /b 1
)

set PM2_HOME=%PM2_HOME%
pm2 status %PM2_APP%

echo.
echo === http://127.0.0.1:3456/health ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3456/health' -UseBasicParsing -TimeoutSec 5; Write-Host $r.Content; exit 0 } catch { Write-Host 'FAIL:' $_.Exception.Message; exit 1 }"

set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Agent OK.
) else (
  echo Agent not reachable. Run: pm2 logs %PM2_APP%
)
if /i not "%~1"=="nopause" pause
exit /b %RC%
