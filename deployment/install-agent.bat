@echo off
setlocal EnableDelayedExpansion
title Venue POS — Install local-agent service
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

echo.
echo === Venue POS local-agent (NSSM service + launch-till.cmd) ===
echo Install root: %INSTALL_ROOT%
echo.

set "PS_ARGS=-InstallRoot \"%INSTALL_ROOT%\""

if exist "%PROVISION_FILE%" (
  echo Loading %PROVISION_FILE%
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (
    if /i "%%a"=="API_URL" set "API_URL=%%b"
    if /i "%%a"=="TERMINAL_ID" set "TERMINAL_ID=%%b"
    if /i "%%a"=="TERMINAL_SECRET" set "TERMINAL_SECRET=%%b"
    if /i "%%a"=="VENUE_ID" set "VENUE_ID=%%b"
  )
  if defined API_URL set "PS_ARGS=!PS_ARGS! -ApiUrl \"!API_URL!\""
  if defined TERMINAL_ID set "PS_ARGS=!PS_ARGS! -TerminalId \"!TERMINAL_ID!\""
  if defined TERMINAL_SECRET set "PS_ARGS=!PS_ARGS! -TerminalSecret \"!TERMINAL_SECRET!\""
  if defined VENUE_ID set "PS_ARGS=!PS_ARGS! -VenueId \"!VENUE_ID!\""
) else (
  echo WARNING: No provision.env — create from provision.env.example or pass creds manually in PowerShell.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%WIN_OPS%\install-agent.ps1' %PS_ARGS%"
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%
