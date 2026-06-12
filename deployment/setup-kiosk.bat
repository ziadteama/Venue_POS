@echo off
setlocal EnableDelayedExpansion
title Venue POS — Setup kiosk user
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

set "KIOSK_PASSWORD="

if exist "%PROVISION_FILE%" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (
    if /i "%%a"=="KIOSK_PASSWORD" set "KIOSK_PASSWORD=%%b"
  )
)

if not defined KIOSK_PASSWORD (
  set /p "KIOSK_PASSWORD=Kiosk user password: "
)

if not defined KIOSK_PASSWORD (
  echo ERROR: KIOSK_PASSWORD required. Set in provision.env or enter when prompted.
  pause
  exit /b 1
)

echo.
echo === Venue POS kiosk lockdown ===
echo Install root: %INSTALL_ROOT%
echo Shell will be launch-till.cmd (agent service + portable POS)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& '%WIN_OPS%\setup-kiosk-user.ps1' -Password '%KIOSK_PASSWORD%' -RepoRoot '%INSTALL_ROOT%'"

set "RC=%ERRORLEVEL%"
if "%RC%"=="0" echo Reboot the till to auto-login into POS.
if /i not "%~2"=="nopause" pause
exit /b %RC%
