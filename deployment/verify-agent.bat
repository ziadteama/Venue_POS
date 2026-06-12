@echo off
title Venue POS — Verify local-agent
cd /d "%~dp0"
call "%~dp0_common.bat" || exit /b 1

echo.
echo Checking http://127.0.0.1:3456/health ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3456/health' -UseBasicParsing -TimeoutSec 5; Write-Host $r.Content; exit 0 } catch { Write-Host 'FAIL:' $_.Exception.Message; Write-Host 'Run install-agent.bat as Administrator.'; exit 1 }"

set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Agent OK.
) else (
  echo Agent not reachable. Check logs in %INSTALL_ROOT%\logs\
)
if /i not "%~1"=="nopause" pause
exit /b %RC%
