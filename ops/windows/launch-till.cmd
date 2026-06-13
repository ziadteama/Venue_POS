@echo off
cd /d "C:\Users\youss\OneDrive\Desktop\Venue_POS"
set VENUE_POS_INSTALL_ROOT=C:\Users\youss\OneDrive\Desktop\Venue_POS
set VENUE_POS_AGENT_ROOT=C:\Users\youss\OneDrive\Desktop\Venue_POS\apps\local-agent
set PM2_HOME=C:\Users\youss\OneDrive\Desktop\Venue_POS\data\pm2
set WATCHDOG_ENABLED=true
set WATCHDOG_CHECK_INTERVAL_MS=5000
set WATCHDOG_MAX_RESTARTS=3
set WATCHDOG_RESTART_WINDOW_MS=600000
set WATCHDOG_LOG_FILE=C:\Users\youss\OneDrive\Desktop\Venue_POS\logs\watchdog.log
set WATCHDOG_POS_CWD=C:\Users\youss\OneDrive\Desktop\Venue_POS
set ELECTRON_IS_KIOSK=true
set NODE_ENV=production
set WATCHDOG_POS_COMMAND="C:\Users\youss\OneDrive\Desktop\Venue_POS\apps\pos\release\VenuePOS-0.1.0-portable.exe"

REM Local agent runs under PM2 (install-agent.ps1). Ensure it is up before POS.
pm2 resurrect >nul 2>&1
pm2 describe venue-pos-agent >nul 2>&1
if errorlevel 1 (
  pm2 start "C:\Users\youss\OneDrive\Desktop\Venue_POS\apps\local-agent\ecosystem.config.cjs" >nul 2>&1
  pm2 save >nul 2>&1
)
timeout /t 2 /nobreak >nul

"C:\Program Files\nodejs\node.exe" "C:\Users\youss\OneDrive\Desktop\Venue_POS\apps\watchdog\src\index.mjs"
