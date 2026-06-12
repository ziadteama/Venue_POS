@echo off
REM Install pm2 + pm2-windows-startup globally (Node 20 required).
setlocal
cd /d "%~dp0"
call "%~dp0_common.bat" || exit /b 1

if /i not "%~1"=="elevated" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%COMSPEC%' -ArgumentList '/c \"\"%~f0\"\" elevated' -Verb RunAs -Wait"
    exit /b %errorlevel%
  )
)

echo.
echo === Install PM2 + pm2-windows-startup ===
node -v >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install Node 20 LTS first.
  pause
  exit /b 1
)

echo Node: & node -v
echo.
npm install -g pm2 pm2-windows-startup
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo PM2 installed.
pm2 -v
if /i not "%~2"=="nopause" pause
exit /b 0
