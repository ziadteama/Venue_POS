@echo off
REM Shared paths for Venue POS Windows till deployment (PM2 + pm2-windows-startup).
set "DEPLOY_DIR=%~dp0"
if "%DEPLOY_DIR:~-1%"=="\" set "DEPLOY_DIR=%DEPLOY_DIR:~0,-1%"

if defined VENUE_POS_INSTALL_ROOT (
  set "INSTALL_ROOT=%VENUE_POS_INSTALL_ROOT%"
) else (
  for %%I in ("%DEPLOY_DIR%\..") do set "INSTALL_ROOT=%%~fI"
)

set "WIN_OPS=%INSTALL_ROOT%\ops\windows"
set "PROVISION_FILE=%DEPLOY_DIR%\provision.env"
set "PM2_HOME=%INSTALL_ROOT%\data\pm2"
set "PM2_APP=venue-pos-agent"

if not exist "%WIN_OPS%\install.ps1" (
  echo ERROR: Till bundle not found at "%INSTALL_ROOT%"
  echo Extract venue-pos-till-windows-*.zip to C:\Venue_POS first.
  exit /b 1
)

exit /b 0
