# Shared helpers — portable POS exe, watchdog, local-agent paths, till boot launcher.

function Get-VenuePosLaunchCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $releaseDirs = @(
    (Join-Path $InstallRoot "pos\release"),
    (Join-Path $InstallRoot "apps\pos\release")
  )

  foreach ($releaseDir in $releaseDirs) {
    $exe = Get-ChildItem -Path $releaseDir -Filter "*-portable.exe" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($exe) {
      return @{
        Command = "`"$($exe.FullName)`""
        Cwd     = $InstallRoot
        Mode    = "portable-exe"
      }
    }
  }

  return @{
    Command = "npm run electron:prod -w @venue-pos/pos"
    Cwd     = $InstallRoot
    Mode    = "npm"
  }
}

function Get-VenuePosWatchdogEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $bundleEntry = Join-Path $InstallRoot "watchdog\src\index.mjs"
  if (Test-Path $bundleEntry) { return $bundleEntry }

  $devEntry = Join-Path $InstallRoot "apps\watchdog\src\index.mjs"
  if (Test-Path $devEntry) { return $devEntry }

  throw "Watchdog entry not found under $InstallRoot (expected watchdog\src\index.mjs)"
}

function Get-VenuePosAgentEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $bundleEntry = Join-Path $InstallRoot "local-agent\src\index.js"
  if (Test-Path $bundleEntry) { return $bundleEntry }

  $devEntry = Join-Path $InstallRoot "apps\local-agent\src\index.js"
  if (Test-Path $devEntry) { return $devEntry }

  throw "local-agent entry not found under $InstallRoot"
}

function Get-VenuePosAgentRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $bundleRoot = Join-Path $InstallRoot "local-agent"
  if (Test-Path (Join-Path $bundleRoot "src\index.js")) { return $bundleRoot }

  $devRoot = Join-Path $InstallRoot "apps\local-agent"
  if (Test-Path (Join-Path $devRoot "src\index.js")) { return $devRoot }

  throw "local-agent directory not found under $InstallRoot"
}

function Get-VenuePosLanHost {
  try {
    $addr = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($addr) { return $addr }
  } catch {
    # Fall back when Get-NetIPAddress is unavailable.
  }
  return '127.0.0.1'
}

function Resolve-VenuePosNodeExe {
  param([string]$NodeExe = "node")

  if ($NodeExe -ne "node" -and (Test-Path $NodeExe)) {
    return (Resolve-Path $NodeExe).Path
  }

  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  throw "node.exe not found on PATH. Install Node 20 LTS or pass -NodeExe."
}

function Resolve-VenuePosNssmExe {
  param([string]$NssmExe = "")

  if ($NssmExe -and (Test-Path $NssmExe)) {
    return (Resolve-Path $NssmExe).Path
  }

  $vendor = Join-Path $PSScriptRoot "vendor\nssm.exe"
  if (Test-Path $vendor) { return $vendor }

  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  return $null
}

function Write-VenuePosAgentEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AgentRoot,
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,
    [Parameter(Mandatory = $true)]
    [string]$TerminalId,
    [Parameter(Mandatory = $true)]
    [string]$TerminalSecret,
    [string]$VenueId = "",
    [string]$AgentLanHost = ""
  )

  $apiUrl = $ApiUrl.Trim().TrimEnd('/')
  if ($apiUrl -notmatch '^https?://') { $apiUrl = "https://$apiUrl" }
  $lanHost = if ($AgentLanHost) { $AgentLanHost } else { Get-VenuePosLanHost }

  $lines = @(
    'PORT=3456',
    'HOST=0.0.0.0',
    'SQLITE_PATH=./data/local.db',
    'SQLITE_WAL_MODE=true',
    "TERMINAL_ID=$TerminalId",
    "TERMINAL_SECRET=$TerminalSecret",
    "VENUE_ID=$VenueId",
    "SERVER_API_URL=$apiUrl",
    "CLOUD_HEALTH_URL=$apiUrl/health",
    'AGENT_LAN_PORT=3456',
    "AGENT_LAN_HOST=$lanHost",
    'AGENT_LAN_SECRET=',
    'AGENT_PEERS=',
    'AGENT_PRIORITY=50',
    'AGENT_DEVICE_LABEL=',
    'KITCHEN_PRINTER_HOST=',
    'KITCHEN_PRINTER_PORT=9100',
    'RECEIPT_PRINTER_MODE=windows',
    'FEATURE_CASH_DRAWER=true',
    'COORDINATOR_TERMINAL_ID=',
    'COORDINATOR_LAN_HOST=',
    'COORDINATOR_FALLBACK_ENABLED=false',
    'IS_COORDINATOR=false',
    'CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174'
  )

  New-Item -ItemType Directory -Path (Join-Path $AgentRoot "data") -Force | Out-Null
  $envPath = Join-Path $AgentRoot ".env"
  Set-Content -Path $envPath -Value ($lines -join "`n") -Encoding ASCII
  return $envPath
}

function Write-VenuePosTillLauncher {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,
    [string]$NodeExe = "node",
    [string]$AgentServiceName = "VenuePosAgent",
    [string]$LauncherPath = ""
  )

  $agentRoot = Get-VenuePosAgentRoot -InstallRoot $InstallRoot
  $posLaunch = Get-VenuePosLaunchCommand -InstallRoot $InstallRoot
  $watchdogEntry = Get-VenuePosWatchdogEntry -InstallRoot $InstallRoot
  $nodePath = Resolve-VenuePosNodeExe -NodeExe $NodeExe

  if (-not $LauncherPath) {
    $LauncherPath = Join-Path $InstallRoot "ops\windows\launch-till.cmd"
  }

  $logsDir = Join-Path $InstallRoot "logs"
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

  $content = @"
@echo off
cd /d "$InstallRoot"
set VENUE_POS_INSTALL_ROOT=$InstallRoot
set VENUE_POS_AGENT_ROOT=$agentRoot
set WATCHDOG_ENABLED=true
set WATCHDOG_CHECK_INTERVAL_MS=5000
set WATCHDOG_MAX_RESTARTS=3
set WATCHDOG_RESTART_WINDOW_MS=600000
set WATCHDOG_LOG_FILE=$logsDir\watchdog.log
set WATCHDOG_POS_CWD=$($posLaunch.Cwd)
set ELECTRON_IS_KIOSK=true
set NODE_ENV=production
set WATCHDOG_POS_COMMAND=$($posLaunch.Command)

REM Local agent runs as a Windows service (install-agent.ps1). Ensure it is up before POS.
sc query $AgentServiceName | findstr /I "RUNNING" >nul
if errorlevel 1 (
  net start $AgentServiceName >nul 2>&1
  timeout /t 2 /nobreak >nul
)

"$nodePath" "$watchdogEntry"
"@

  New-Item -ItemType Directory -Path (Split-Path $LauncherPath) -Force | Out-Null
  Set-Content -Path $LauncherPath -Value $content -Encoding ASCII

  return @{
    LauncherPath = $LauncherPath
    PosMode        = $posLaunch.Mode
    AgentRoot      = $agentRoot
    NodeExe        = $nodePath
  }
}
