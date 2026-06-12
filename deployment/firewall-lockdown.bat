@echo off
setlocal EnableDelayedExpansion
title Venue POS — Firewall lockdown
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

set "HUB_SERVER_IP="
set "PRINTER_IPS="
if exist "%PROVISION_FILE%" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (
    if /i "%%a"=="HUB_SERVER_IP" set "HUB_SERVER_IP=%%b"
    if /i "%%a"=="PRINTER_IPS" set "PRINTER_IPS=%%b"
  )
)
if not defined HUB_SERVER_IP (
  set /p "HUB_SERVER_IP=Hub server IP or hostname: "
)
if not defined HUB_SERVER_IP (
  echo ERROR: HUB_SERVER_IP required.
  pause
  exit /b 1
)

set "PS_ARGS=-HubServerIp \"%HUB_SERVER_IP%\""
if defined PRINTER_IPS set "PS_ARGS=%PS_ARGS% -PrinterIps \"%PRINTER_IPS%\""

echo.
echo === Firewall lockdown (hub: %HUB_SERVER_IP%) ===
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%WIN_OPS%\firewall-lockdown.ps1' %PS_ARGS%"
set "RC=%ERRORLEVEL%"
if /i not "%~2"=="nopause" pause
exit /b %RC%
