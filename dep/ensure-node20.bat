@echo off
setlocal
title Venue POS - Ensure Node 20 LTS
cd /d "%~dp0"

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
if defined NODE20_MSI_PATH set "MSI_ARG=-MsiPath \"%NODE20_MSI_PATH%\""

echo.
echo === Ensure Node.js 20 LTS ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_OPS%\ensure-node20.ps1" %MSI_ARG%
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  call "%~dp0_helpers.bat" Fail "ensure-node20.ps1 failed with exit code %RC%."
  exit /b 1
)

call "%~dp0_helpers.bat" RefreshPath
echo.
echo Active Node:
node -v
call "%~dp0_helpers.bat" PauseUnlessNoPause %2
exit /b 0
