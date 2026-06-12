@echo off
REM Full till deploy: install bundle + agent + kiosk + firewall (reboot required after).
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo  Venue POS — Full Windows till setup
echo ========================================
echo  Requires: Node 20 LTS, NSSM, Admin rights
echo  Edit provision.env before running (copy from provision.env.example)
echo.

call "%~dp0install.bat" elevated nopause
if errorlevel 1 exit /b 1

call "%~dp0verify-agent.bat" nopause
if errorlevel 1 (
  echo Agent health check failed — fix before kiosk setup.
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
echo  After reboot: VenuePosAgent + portable POS start automatically.
echo ========================================
pause
exit /b 0
