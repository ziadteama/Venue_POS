#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Venue POS local-agent as a Windows service (NSSM) and write till boot launcher.

.DESCRIPTION
  Registers VenuePosAgent (SQLite + offline sync) to start at boot, optionally writes
  local-agent/.env from till provisioning creds, and generates launch-till.cmd
  (starts agent service, then watchdog → portable POS .exe).

.PARAMETER InstallRoot
  Till install directory (default: C:\Venue_POS).

.PARAMETER NodeExe
  Path to Node 20 (default: node on PATH).

.PARAMETER ServiceName
  Windows service name (default: VenuePosAgent).

.PARAMETER ApiUrl
  Hub API URL (optional — skips .env write when omitted if .env already exists).

.PARAMETER TerminalId
  Terminal UUID from dev ops Till provisioning.

.PARAMETER TerminalSecret
  Terminal secret from dev ops Till provisioning.

.PARAMETER VenueId
  Venue UUID (optional).

.PARAMETER AgentLanHost
  This till's LAN IPv4 (auto-detected when omitted).

.PARAMETER SkipNativeRebuild
  Skip npm rebuild of bcrypt/better-sqlite3 (use when install.ps1 already rebuilt).

.PARAMETER SkipHealthCheck
  Do not poll http://127.0.0.1:3456/health after start.

.EXAMPLE
  .\install-agent.ps1 -InstallRoot C:\Venue_POS `
    -ApiUrl "https://your-hub.onrender.com" `
    -TerminalId "<uuid>" -TerminalSecret "<secret>" -VenueId "<uuid>"
#>
param(
  [string]$InstallRoot = "C:\Venue_POS",
  [string]$NodeExe = "node",
  [string]$ServiceName = "VenuePosAgent",
  [string]$ApiUrl = "",
  [string]$TerminalId = "",
  [string]$TerminalSecret = "",
  [string]$VenueId = "",
  [string]$AgentLanHost = "",
  [string]$NssmExe = "",
  [switch]$SkipNativeRebuild,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "pos-launcher.ps1")

$InstallRoot = (Resolve-Path $InstallRoot).Path
$agentRoot = Get-VenuePosAgentRoot -InstallRoot $InstallRoot
$agentEntry = Get-VenuePosAgentEntry -InstallRoot $InstallRoot
$nodePath = Resolve-VenuePosNodeExe -NodeExe $NodeExe
$nssmPath = Resolve-VenuePosNssmExe -NssmExe $NssmExe

if (-not $nssmPath) {
  throw "NSSM not found. Install from https://nssm.cc and add nssm.exe to PATH, or place it at ops\windows\vendor\nssm.exe"
}

$logsDir = Join-Path $InstallRoot "logs"
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

if (-not $SkipNativeRebuild) {
  Write-Host "==> Rebuilding native modules (bcrypt, better-sqlite3)"
  Push-Location $InstallRoot
  npm run setup:node20
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  Pop-Location
}

$envPath = Join-Path $agentRoot ".env"
$hasProvisionArgs = $ApiUrl -and $TerminalId -and $TerminalSecret
if ($hasProvisionArgs) {
  Write-Host "==> Writing local-agent .env"
  $envPath = Write-VenuePosAgentEnv `
    -AgentRoot $agentRoot `
    -ApiUrl $ApiUrl `
    -TerminalId $TerminalId `
    -TerminalSecret $TerminalSecret `
    -VenueId $VenueId `
    -AgentLanHost $AgentLanHost
  Write-Host "  $envPath"
} elseif (-not (Test-Path $envPath)) {
  Write-Warning "No local-agent .env — pass -ApiUrl -TerminalId -TerminalSecret or create $envPath manually before going live."
}

Write-Host "==> Installing Windows service $ServiceName"
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  Stopping existing service..."
  & $nssmPath stop $ServiceName 2>$null
  Start-Sleep -Seconds 1
  & $nssmPath remove $ServiceName confirm
}

& $nssmPath install $ServiceName $nodePath $agentEntry
& $nssmPath set $ServiceName AppDirectory $agentRoot
& $nssmPath set $ServiceName AppStdout (Join-Path $logsDir "agent-stdout.log")
& $nssmPath set $ServiceName AppStderr (Join-Path $logsDir "agent-stderr.log")
& $nssmPath set $ServiceName AppRotateFiles 1
& $nssmPath set $ServiceName AppRotateBytes 10485760
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath set $ServiceName AppEnvironmentExtra @(
  "VENUE_POS_AGENT_ROOT=$agentRoot",
  "VENUE_POS_INSTALL_ROOT=$InstallRoot",
  "NODE_ENV=production"
)

Write-Host "==> Starting $ServiceName"
& $nssmPath start $ServiceName

if (-not $SkipHealthCheck) {
  Write-Host "==> Waiting for local-agent /health"
  $ok = $false
  for ($i = 1; $i -le 30; $i++) {
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:3456/health" -UseBasicParsing -TimeoutSec 3
      if ($res.StatusCode -eq 200) {
        $ok = $true
        Write-Host "  Agent healthy (attempt $i)"
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $ok) {
    Write-Warning "Agent /health not reachable yet. Check: $logsDir\agent-stderr.log"
    Write-Warning "  cd $agentRoot; node src/index.js"
  }
}

Write-Host "==> Writing till boot launcher (agent + portable POS)"
$launcher = Write-VenuePosTillLauncher -InstallRoot $InstallRoot -NodeExe $nodePath -AgentServiceName $ServiceName
Write-Host "  POS mode: $($launcher.PosMode)"
Write-Host "  Launcher: $($launcher.LauncherPath)"
Write-Host ""
Write-Host "Next (kiosk till):"
Write-Host "  cd $InstallRoot\ops\windows"
Write-Host "  .\setup-kiosk-user.ps1 -Password `"YourSecurePassword`" -RepoRoot `"$InstallRoot`""
Write-Host "Done."
