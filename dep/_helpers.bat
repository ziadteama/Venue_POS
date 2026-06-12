@echo off
REM Venue POS deployment helpers - call: call "%~dp0_helpers.bat" LabelName args...
if not "%~1"=="" goto %~1
exit /b 1

:RequireAdmin
REM call args: %1=RequireAdmin  %2=caller.bat  %3=caller arg1  %4=caller arg2
net session >nul 2>&1
if %errorlevel%==0 exit /b 0

REM Do not trust "elevated" — verify admin with net session (PowerShell scripts require it).
if /i "%~3"=="elevated" (
  call "%~f0" Fail "Administrator rights required. Right-click the .bat file and choose Run as administrator."
  exit /b 1
)

set "CALLER=%~2"
for %%I in ("%~2") do set "WORKDIR=%%~dpI"
if "%WORKDIR:~-1%"=="\" set "WORKDIR=%WORKDIR:~0,-1%"

echo.
echo === Administrator rights required ===
echo Approve the UAC prompt. Setup continues in the elevated window.
echo.

set "VENUE_DEPLOY_BAT=%CALLER%"
set "VENUE_DEPLOY_DIR=%WORKDIR%"

REM Always wait for the elevated run so one window shows progress (avoids "nothing happened").
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$args = @('elevated'); if ('%~4' -eq 'nopause') { $args += 'nopause' };" ^
  "$p = Start-Process -FilePath $env:VENUE_DEPLOY_BAT -ArgumentList $args -Verb RunAs -WorkingDirectory $env:VENUE_DEPLOY_DIR -Wait -PassThru;" ^
  "exit $p.ExitCode"

set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo ERROR: Setup failed or UAC was cancelled (exit code %RC%).
  call "%~f0" PauseAlways
  exit /b %RC%
)
REM Work finished in the elevated copy — caller must not run again.
exit /b 2

:PauseUnlessNoPause
if /i "%~2"=="nopause" exit /b 0
goto PauseAlways

:PauseAlways
echo.
pause
exit /b 0

:RefreshPath
for /f "delims=" %%p in ('powershell -NoProfile -Command "$m=[Environment]::GetEnvironmentVariable('Path','Machine');$u=[Environment]::GetEnvironmentVariable('Path','User');if($m-and$u){$m+=';'+$u}elseif($u){$m=$u};Write-Output $m"') do set "PATH=%%p"
exit /b 0

:Fail
echo.
echo ERROR: %~2
call "%~f0" PauseAlways
exit /b 1
