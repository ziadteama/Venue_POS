@echo off
REM Full till deploy: PM2 + bundle + agent + kiosk + firewall. Reboot after.
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo  Venue POS — Full Windows till setup
echo ========================================
echo  Requires: Node 20 LTS, Admin rights
echo  PM2 + pm2-windows-startup installed automatically
echo  Edit provision.env before running
echo.

call "%~dp0install-pm2.bat" elevated nopause
if errorlevel 1 exit /b 1

call "%~dp0install.bat" elevated nopause
if errorlevel 1 exit /b 1

call "%~dp0verify-agent.bat" nopause
if errorlevel 1 (
  echo.
  echo Agent health check failed. Try: install-agent.bat
  pause
  exit /b 1
)

call "%~dp0setup-kiosk.bat" elevated nopause
if errorlevel 1 exit /b 1

call "%~dp0firewall-lockdown.bat" elevated nopause
if errorlevel 1 exit /b 1

echo.
echo ========================================
echo  Setup complete — REBOOT the till now.
echo  After reboot: PM2 agent + portable POS autostart.
echo  Logs: pm2 logs venue-pos-agent
echo ========================================
pause
exit /b 0
