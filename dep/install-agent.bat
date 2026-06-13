@echo off
setlocal EnableDelayedExpansion
title Venue POS - Install local-agent (PM2)
cd /d "%~dp0"

echo.
echo Venue POS local-agent install - starting...
echo.

call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1

call "%~dp0_common.bat"
if errorlevel 1 exit /b 1

echo.
echo === Venue POS local-agent (PM2 + pm2-windows-startup) ===
echo Install root: %INSTALL_ROOT%
echo PM2_HOME:     %PM2_HOME%
echo.

call pm2 -v >nul 2>&1
if errorlevel 1 (
  echo PM2 not found - running install-pm2.bat first...
  call "%~dp0install-pm2.bat" elevated nopause
  if errorlevel 1 (
    call "%~dp0_helpers.bat" Fail "install-pm2.bat failed."
    exit /b 1
  )
)

REM Rebuild native modules unless a prior successful rebuild marker exists.
set "SKIP_FLAG="
set "API_URL="
set "TERMINAL_ID="
set "TERMINAL_SECRET="
set "VENUE_ID="
set "FORCE_NATIVE_REBUILD="

if exist "%INSTALL_ROOT%\data\.native-rebuild-ok" set "SKIP_FLAG=-SkipNativeRebuild"

if exist "%PROVISION_FILE%" (
  echo Loading %PROVISION_FILE%
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (
    if /i "%%a"=="API_URL" set "API_URL=%%b"
    if /i "%%a"=="TERMINAL_ID" set "TERMINAL_ID=%%b"
    if /i "%%a"=="TERMINAL_SECRET" set "TERMINAL_SECRET=%%b"
    if /i "%%a"=="VENUE_ID" set "VENUE_ID=%%b"
    if /i "%%a"=="FORCE_NATIVE_REBUILD" set "FORCE_NATIVE_REBUILD=%%b"
  )
  if /i "!FORCE_NATIVE_REBUILD!"=="true" set "SKIP_FLAG="
) else (
  echo WARNING: No provision.env - create from provision.env.example
)

if defined SKIP_FLAG (
  echo Skipping native rebuild ^(data\.native-rebuild-ok found^). Set FORCE_NATIVE_REBUILD=true to redo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\install-agent.ps1" -InstallRoot "%INSTALL_ROOT%" %SKIP_FLAG% -ApiUrl "%API_URL%" -TerminalId "%TERMINAL_ID%" -TerminalSecret "%TERMINAL_SECRET%" -VenueId "%VENUE_ID%"
) else (
  echo Rebuilding native modules for Node 20...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\install-agent.ps1" -InstallRoot "%INSTALL_ROOT%" -ApiUrl "%API_URL%" -TerminalId "%TERMINAL_ID%" -TerminalSecret "%TERMINAL_SECRET%" -VenueId "%VENUE_ID%"
)

set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  call "%~dp0_helpers.bat" Fail "install-agent.ps1 failed with exit code %RC%. See errors above."
  exit /b 1
)

call "%~dp0_helpers.bat" PauseUnlessNoPause %2
exit /b 0
