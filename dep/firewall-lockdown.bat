@echo off

setlocal EnableDelayedExpansion

title Venue POS - Firewall lockdown

cd /d "%~dp0"



echo.

echo Venue POS firewall lockdown — starting...

echo.



call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1



call "%~dp0_common.bat"

if errorlevel 1 exit /b 1



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

  call "%~dp0_helpers.bat" Fail "HUB_SERVER_IP is required."

  exit /b 1

)



set "PS_EXTRA="

if defined PRINTER_IPS set "PS_EXTRA=-PrinterIps \"%PRINTER_IPS%\""



echo.

echo === Firewall lockdown (hub: %HUB_SERVER_IP%) ===

powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\firewall-lockdown.ps1" -HubServerIp "%HUB_SERVER_IP%" %PS_EXTRA%

set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (

  call "%~dp0_helpers.bat" Fail "firewall-lockdown.ps1 failed with exit code %RC%."

  exit /b 1

)



call "%~dp0_helpers.bat" PauseUnlessNoPause %2

exit /b 0


