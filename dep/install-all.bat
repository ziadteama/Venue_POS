@echo off

setlocal

title Venue POS - Full till setup

cd /d "%~dp0"



echo.

echo Venue POS full till setup — starting...

echo Folder: %~dp0

echo.



call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1



echo.

echo ========================================

echo  Venue POS - Full Windows till setup

echo ========================================

echo  Requires: Admin rights (Node 20 LTS installed automatically)

echo  PM2 + pm2-windows-startup installed automatically

echo  Edit provision.env before running

echo  Note: scripts install from extracted bundle (no auto-download)

echo ========================================

echo.



call "%~dp0install-pm2.bat" elevated nopause

if errorlevel 1 (

  call "%~dp0_helpers.bat" Fail "install-pm2.bat failed."

  exit /b 1

)



call "%~dp0install.bat" elevated nopause

if errorlevel 1 (

  call "%~dp0_helpers.bat" Fail "install.bat failed."

  exit /b 1

)



call "%~dp0verify-agent.bat" nopause

if errorlevel 1 (

  call "%~dp0_helpers.bat" Fail "verify-agent.bat failed. Try install-agent.bat"

  exit /b 1

)



call "%~dp0setup-kiosk.bat" elevated nopause

if errorlevel 1 (

  call "%~dp0_helpers.bat" Fail "setup-kiosk.bat failed."

  exit /b 1

)



call "%~dp0firewall-lockdown.bat" elevated nopause

if errorlevel 1 (

  call "%~dp0_helpers.bat" Fail "firewall-lockdown.bat failed."

  exit /b 1

)



echo.

echo ========================================

echo  Setup complete - REBOOT the till now.

echo  After reboot: PM2 agent + portable POS autostart.

echo  Logs: pm2 logs venue-pos-agent

echo ========================================

call "%~dp0_helpers.bat" PauseAlways

exit /b 0


