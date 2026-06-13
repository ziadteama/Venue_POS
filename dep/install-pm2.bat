@echo off
setlocal EnableDelayedExpansion
title Venue POS - Install PM2
cd /d "%~dp0"

echo.
echo Venue POS PM2 install - starting...
echo.

call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1

call "%~dp0_common.bat"
if errorlevel 1 exit /b 1

set "MSI_ARG="
if exist "%PROVISION_FILE%" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (
    if /i "%%a"=="NODE20_MSI_PATH" set "NODE20_MSI_PATH=%%b"
  )
)
if defined NODE20_MSI_PATH set "MSI_ARG=-MsiPath \"!NODE20_MSI_PATH!\""

echo.
echo === Ensure Node.js 20 LTS ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\ensure-node20.ps1" !MSI_ARG!
if errorlevel 1 (
  call "%~dp0_helpers.bat" Fail "ensure-node20.ps1 failed. Check internet or set NODE20_MSI_PATH in provision.env."
  exit /b 1
)
call "%~dp0_helpers.bat" RefreshPath

echo.
echo === Install PM2 + pm2-windows-startup ===
node -v >nul 2>&1
if errorlevel 1 (
  call "%~dp0_helpers.bat" Fail "Node.js not found after ensure-node20.ps1."
  exit /b 1
)

echo Node:
node -v
echo.
echo Downloading PM2 via npm (this may take a minute)...
call npm install -g pm2 pm2-windows-startup
if errorlevel 1 (
  call "%~dp0_helpers.bat" Fail "npm install -g pm2 pm2-windows-startup failed."
  exit /b 1
)

echo.
echo PM2 installed:
call pm2 -v
call "%~dp0_helpers.bat" PauseUnlessNoPause %2
exit /b 0
