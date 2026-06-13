@echo off

setlocal EnableDelayedExpansion

title Venue POS - Install till bundle

cd /d "%~dp0"



echo.

echo Venue POS till install — starting...

echo.



call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1



call "%~dp0_common.bat"

if errorlevel 1 exit /b 1



echo.

echo === Venue POS till install ===

echo Install root: %INSTALL_ROOT%

echo.



set "PS_EXTRA="



if exist "%PROVISION_FILE%" (

  echo Loading %PROVISION_FILE%

  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%PROVISION_FILE%") do (

    if /i "%%a"=="API_URL" set "API_URL=%%b"

    if /i "%%a"=="TERMINAL_ID" set "TERMINAL_ID=%%b"

    if /i "%%a"=="TERMINAL_SECRET" set "TERMINAL_SECRET=%%b"

    if /i "%%a"=="VENUE_ID" set "VENUE_ID=%%b"

  )

  if defined API_URL set "PS_EXTRA=!PS_EXTRA! -ApiUrl \"!API_URL!\""

  if defined TERMINAL_ID set "PS_EXTRA=!PS_EXTRA! -TerminalId \"!TERMINAL_ID!\""

  if defined TERMINAL_SECRET set "PS_EXTRA=!PS_EXTRA! -TerminalSecret \"!TERMINAL_SECRET!\""

  if defined VENUE_ID set "PS_EXTRA=!PS_EXTRA! -VenueId \"!VENUE_ID!\""

) else (

  echo Tip: copy provision.env.example to provision.env for automatic terminal creds.

)



powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\install.ps1" -InstallRoot "%INSTALL_ROOT%" %PS_EXTRA%

set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (

  call "%~dp0_helpers.bat" Fail "install.ps1 failed with exit code %RC%."

  exit /b 1

)



echo.

echo Till files installed. Next: verify-agent.bat, setup-kiosk.bat, reboot.

call "%~dp0_helpers.bat" PauseUnlessNoPause %2

exit /b 0


