@echo off

setlocal EnableDelayedExpansion

title Venue POS - Setup kiosk user

cd /d "%~dp0"



echo.

echo Venue POS kiosk setup — starting...

echo.



call "%~dp0_helpers.bat" RequireAdmin "%~f0" %1 %2
if errorlevel 2 exit /b 0
if errorlevel 1 exit /b 1



call "%~dp0_common.bat"

if errorlevel 1 exit /b 1



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

  call "%~dp0_helpers.bat" Fail "KIOSK_PASSWORD required in provision.env or at prompt."

  exit /b 1

)



echo.

echo === Venue POS kiosk lockdown ===

echo Shell: launch-till.cmd (PM2 agent + portable POS)

echo.



powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\setup-kiosk-user.ps1" -Password "%KIOSK_PASSWORD%" -RepoRoot "%INSTALL_ROOT%"



set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (

  call "%~dp0_helpers.bat" Fail "setup-kiosk-user.ps1 failed with exit code %RC%."

  exit /b 1

)



echo Reboot the till to auto-login into POS.

call "%~dp0_helpers.bat" PauseUnlessNoPause %2

exit /b 0


