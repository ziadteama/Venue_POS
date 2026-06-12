# Shared helpers - portable POS exe, watchdog, local-agent paths, PM2, till boot launcher.

. (Join-Path $PSScriptRoot 'ensure-node20.ps1')

$script:VenuePosPm2AppName = 'venue-pos-agent'

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

function Get-VenuePosPm2Home {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)
  return Join-Path $InstallRoot "data\pm2"
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

function Find-VenuePosNvmNode20Dir {
  $roots = @(
    $env:NVM_HOME,
    'C:\Program Files\nvm',
    (Join-Path $env:APPDATA 'nvm')
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($nvmRoot in $roots) {
    $versions = Get-ChildItem $nvmRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^v20\.\d+\.\d+$' } |
      Sort-Object Name -Descending
    foreach ($ver in $versions) {
      $nodeExe = Join-Path $ver.FullName 'node.exe'
      if (Test-Path $nodeExe) { return $ver.FullName }
    }
  }
  return $null
}

function Resolve-VenuePosNode20Exe {
  param([string]$NodeExe = "node")

  if ($NodeExe -ne "node" -and (Test-Path $NodeExe)) {
    $ver = & $NodeExe -v 2>$null
    if ($ver -match '^v20\.') { return (Resolve-Path $NodeExe).Path }
  }

  $bundled = Join-Path 'C:\Program Files\nodejs' 'node.exe'
  if (Test-Path $bundled) {
    $ver = & $bundled -v 2>$null
    if ($ver -match '^v20\.') { return $bundled }
  }

  $nvmDir = Find-VenuePosNvmNode20Dir
  if ($nvmDir) { return (Join-Path $nvmDir 'node.exe') }

  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) {
    $ver = & $cmd.Source -v 2>$null
    if ($ver -match '^v20\.') { return $cmd.Source }
  }

  throw "node.exe v20 not found on PATH. Run deployment\ensure-node20.bat as Administrator."
}

function Resolve-VenuePosNodeExe {
  param([string]$NodeExe = "node")
  return Resolve-VenuePosNode20Exe -NodeExe $NodeExe
}

function Invoke-VenuePosNativeRebuild {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot
  )

  Ensure-VenuePosNode20 | Out-Null
  Update-VenuePosSessionPath

  Write-Host "==> Rebuilding native modules (bcrypt, better-sqlite3)"
  Push-Location $InstallRoot
  try {
    & npm run setup:node20
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($code -eq 0) {
    $markerDir = Join-Path $InstallRoot 'data'
    New-Item -ItemType Directory -Path $markerDir -Force | Out-Null
    Set-Content -Path (Join-Path $markerDir '.native-rebuild-ok') -Value (Get-Date -Format o) -Encoding ASCII
    return
  }

  Write-Host ""
  Write-Host "ERROR: Native module rebuild failed (exit $code)." -ForegroundColor Red
  Write-Host "Re-run deployment\ensure-node20.bat as Administrator, then try again." -ForegroundColor Red
  Write-Host ""
  exit $code
}

function Resolve-VenuePosPm2Exe {
  $cmd = Get-Command pm2 -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Resolve-VenuePosPm2StartupExe {
  $cmd = Get-Command pm2-startup -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Ensure-VenuePosPm2 {
  $pm2 = Resolve-VenuePosPm2Exe
  if ($pm2) { return $pm2 }

  Write-Host "==> Installing pm2 + pm2-windows-startup globally"
  & npm install -g pm2 pm2-windows-startup
  if ($LASTEXITCODE -ne 0) {
    throw "npm install -g pm2 pm2-windows-startup failed"
  }

  $pm2 = Resolve-VenuePosPm2Exe
  if (-not $pm2) {
    throw "pm2 not found after global install. Ensure npm global bin is on PATH."
  }
  return $pm2
}

function Set-VenuePosMachineEnv {
  param(
    [string]$InstallRoot,
    [string]$AgentRoot,
    [string]$Pm2Home
  )

  [Environment]::SetEnvironmentVariable('VENUE_POS_INSTALL_ROOT', $InstallRoot, 'Machine')
  [Environment]::SetEnvironmentVariable('VENUE_POS_AGENT_ROOT', $AgentRoot, 'Machine')
  [Environment]::SetEnvironmentVariable('PM2_HOME', $Pm2Home, 'Machine')
}

function Write-VenuePosPm2Ecosystem {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$AgentRoot,
    [Parameter(Mandatory = $true)][string]$Pm2Home,
    [string]$NodeExe = "node"
  )

  $fwd = @{
    InstallRoot = ($InstallRoot -replace '\\', '/')
    AgentRoot   = ($AgentRoot -replace '\\', '/')
    Pm2Home     = ($Pm2Home -replace '\\', '/')
    NodeExe     = if ($NodeExe -ne 'node' -and (Test-Path $NodeExe)) {
      ($NodeExe -replace '\\', '/')
    } else {
      ((Resolve-VenuePosNode20Exe -NodeExe $NodeExe) -replace '\\', '/')
    }
  }

  $content = @"
/**
 * PM2 local-agent - generated by install-agent.ps1
 */
module.exports = {
  apps: [
    {
      name: '$script:VenuePosPm2AppName',
      script: 'src/index.js',
      cwd: '$($fwd.AgentRoot)',
      interpreter: '$($fwd.NodeExe)',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      env: {
        NODE_ENV: 'production',
        PM2_HOME: '$($fwd.Pm2Home)',
        VENUE_POS_AGENT_ROOT: '$($fwd.AgentRoot)',
        VENUE_POS_INSTALL_ROOT: '$($fwd.InstallRoot)',
      },
    },
  ],
};
"@

  $ecoPath = Join-Path $AgentRoot "ecosystem.config.cjs"
  Set-Content -Path $ecoPath -Value $content -Encoding UTF8
  return $ecoPath
}

function Invoke-VenuePosPm2 {
  param(
    [Parameter(Mandatory = $true)][string]$Pm2Home,
    [Parameter(Mandatory = $true)][string[]]$Pm2Args
  )

  $env:PM2_HOME = $Pm2Home
  # PM2 prints a status table to stdout; do not let that become the function return value.
  & pm2 @Pm2Args 2>&1 | Out-Host
  if ($null -ne $LASTEXITCODE) { return [int]$LASTEXITCODE }
  return 0
}

function Get-VenuePosPm2AppStatus {
  param(
    [Parameter(Mandatory = $true)][string]$Pm2Home,
    [Parameter(Mandatory = $true)][string]$AppName
  )

  $env:PM2_HOME = $Pm2Home
  $jsonText = (& pm2 jlist 2>$null | Out-String).Trim()
  if (-not $jsonText) { return 'unknown' }

  try {
    $list = $jsonText | ConvertFrom-Json
    $app = @($list) | Where-Object { $_.name -eq $AppName } | Select-Object -First 1
    if ($app -and $app.pm2_env) { return [string]$app.pm2_env.status }
  } catch {
    return 'unknown'
  }
  return 'missing'
}

function Install-VenuePosPm2Agent {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$AgentRoot,
    [string]$NodeExe = "node",
    [switch]$SkipStartup
  )

  Ensure-VenuePosPm2 | Out-Null

  $pm2Home = Get-VenuePosPm2Home -InstallRoot $InstallRoot
  New-Item -ItemType Directory -Path $pm2Home -Force | Out-Null
  Set-VenuePosMachineEnv -InstallRoot $InstallRoot -AgentRoot $AgentRoot -Pm2Home $pm2Home

  $ecoPath = Write-VenuePosPm2Ecosystem -InstallRoot $InstallRoot -AgentRoot $AgentRoot -Pm2Home $pm2Home -NodeExe $NodeExe

  Write-Host "==> Starting PM2 app $script:VenuePosPm2AppName"
  [void](Invoke-VenuePosPm2 -Pm2Home $pm2Home -Pm2Args @('delete', $script:VenuePosPm2AppName, '--force'))
  $code = Invoke-VenuePosPm2 -Pm2Home $pm2Home -Pm2Args @('start', $ecoPath)
  if ($code -ne 0) { throw "pm2 start failed (exit $code)" }

  Start-Sleep -Seconds 2
  $status = Get-VenuePosPm2AppStatus -Pm2Home $pm2Home -AppName $script:VenuePosPm2AppName
  if ($status -ne 'online') {
    Write-Warning "PM2 app $script:VenuePosPm2AppName status is '$status' (expected online)."
    Write-Host "==> Recent agent logs:"
    & pm2 logs $script:VenuePosPm2AppName --lines 20 --nostream 2>&1 | Out-Host
  }

  $code = Invoke-VenuePosPm2 -Pm2Home $pm2Home -Pm2Args @('save')
  if ($code -ne 0) { throw "pm2 save failed (exit $code)" }

  if (-not $SkipStartup) {
    if (Resolve-VenuePosPm2StartupExe) {
      Write-Host "==> Registering PM2 Windows startup (pm2-windows-startup)"
      $env:PM2_HOME = $pm2Home
      & pm2-startup install
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "pm2-startup install failed - launch-till.cmd will start the agent on login"
      }
    } else {
      Write-Warning "pm2-startup not found - run: npm install -g pm2-windows-startup"
    }
  }

  return $pm2Home
}

function Uninstall-VenuePosPm2Agent {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)

  if (-not (Resolve-VenuePosPm2Exe)) { return }

  $pm2Home = Get-VenuePosPm2Home -InstallRoot $InstallRoot
  $env:PM2_HOME = $pm2Home
  & pm2 delete $script:VenuePosPm2AppName --force 2>$null
  & pm2 save --force 2>$null

  if (Resolve-VenuePosPm2StartupExe) {
    & pm2-startup uninstall 2>$null
  }
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
    [string]$Pm2AppName = $script:VenuePosPm2AppName,
    [string]$LauncherPath = ""
  )

  $agentRoot = Get-VenuePosAgentRoot -InstallRoot $InstallRoot
  $pm2Home = Get-VenuePosPm2Home -InstallRoot $InstallRoot
  $ecoPath = Join-Path $agentRoot "ecosystem.config.cjs"
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
set PM2_HOME=$pm2Home
set WATCHDOG_ENABLED=true
set WATCHDOG_CHECK_INTERVAL_MS=5000
set WATCHDOG_MAX_RESTARTS=3
set WATCHDOG_RESTART_WINDOW_MS=600000
set WATCHDOG_LOG_FILE=$logsDir\watchdog.log
set WATCHDOG_POS_CWD=$($posLaunch.Cwd)
set ELECTRON_IS_KIOSK=true
set NODE_ENV=production
set WATCHDOG_POS_COMMAND=$($posLaunch.Command)

REM Local agent runs under PM2 (install-agent.ps1). Ensure it is up before POS.
pm2 resurrect >nul 2>&1
pm2 describe $Pm2AppName >nul 2>&1
if errorlevel 1 (
  pm2 start "$ecoPath" >nul 2>&1
  pm2 save >nul 2>&1
)
timeout /t 2 /nobreak >nul

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
