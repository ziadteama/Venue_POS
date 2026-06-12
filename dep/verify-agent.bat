@echo off
title Venue POS - Verify local-agent (PM2)
cd /d "%~dp0"

call "%~dp0_common.bat"
if errorlevel 1 exit /b 1

echo.
echo === PM2 status ===
call pm2 -v >nul 2>&1
if errorlevel 1 (
  call "%~dp0_helpers.bat" Fail "pm2 not installed. Run install-pm2.bat first."
  exit /b 1
)

set PM2_HOME=%PM2_HOME%
call pm2 status %PM2_APP%

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
call "%~dp0_helpers.bat" PauseUnlessNoPause %1
exit /b %RC%
