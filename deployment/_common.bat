@echo off
REM Shared paths for Venue POS Windows till deployment scripts.
set "DEPLOY_DIR=%~dp0"
if "%DEPLOY_DIR:~-1%"=="\" set "DEPLOY_DIR=%DEPLOY_DIR:~0,-1%"

if defined VENUE_POS_INSTALL_ROOT (
  set "INSTALL_ROOT=%VENUE_POS_INSTALL_ROOT%"
) else (
  for %%I in ("%DEPLOY_DIR%\..") do set "INSTALL_ROOT=%%~fI"
)

set "WIN_OPS=%INSTALL_ROOT%\ops\windows"
set "PROVISION_FILE=%DEPLOY_DIR%\provision.env"

if not exist "%WIN_OPS%\install.ps1" (
  echo ERROR: Windows ops scripts not found at "%WIN_OPS%"
  echo Extract the full till bundle to C:\Venue_POS or set VENUE_POS_INSTALL_ROOT.
  exit /b 1
)

exit /b 0
