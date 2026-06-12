#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Venue POS local-agent under PM2 + pm2-windows-startup and write till boot launcher.

.DESCRIPTION
  Installs pm2 + pm2-windows-startup if missing, registers venue-pos-agent to start at boot,
  optionally writes local-agent/.env from till provisioning creds, and generates launch-till.cmd
  (PM2 agent + watchdog → portable POS .exe).

.PARAMETER InstallRoot
  Till install directory (default: C:\Venue_POS).

.PARAMETER NodeExe
  Path to Node 20 (default: node on PATH).

.PARAMETER Pm2AppName
  PM2 process name (default: venue-pos-agent).

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

.PARAMETER SkipPm2Startup
  Skip pm2-startup install (launch-till.cmd still starts agent on login).

.EXAMPLE
  .\install-agent.ps1 -InstallRoot C:\Venue_POS `
    -ApiUrl "https://your-hub.onrender.com" `
    -TerminalId "<uuid>" -TerminalSecret "<secret>" -VenueId "<uuid>"
#>
param(
  [string]$InstallRoot = "C:\Venue_POS",
  [string]$NodeExe = "node",
  [string]$Pm2AppName = "venue-pos-agent",
  [string]$ApiUrl = "",
  [string]$TerminalId = "",
  [string]$TerminalSecret = "",
  [string]$VenueId = "",
  [string]$AgentLanHost = "",
  [switch]$SkipNativeRebuild,
  [switch]$SkipHealthCheck,
  [switch]$SkipPm2Startup
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "pos-launcher.ps1")

$InstallRoot = (Resolve-Path $InstallRoot).Path
$agentRoot = Get-VenuePosAgentRoot -InstallRoot $InstallRoot
$nodePath = Resolve-VenuePosNodeExe -NodeExe $NodeExe
$script:VenuePosPm2AppName = $Pm2AppName

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

$pm2Home = Install-VenuePosPm2Agent -InstallRoot $InstallRoot -AgentRoot $agentRoot -SkipStartup:$SkipPm2Startup
Write-Host "  PM2_HOME: $pm2Home"

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
    Write-Warning "Agent /health not reachable yet. Check: pm2 logs $Pm2AppName"
    Write-Warning "  pm2 status"
  }
}

Write-Host "==> Writing till boot launcher (PM2 agent + portable POS)"
$launcher = Write-VenuePosTillLauncher -InstallRoot $InstallRoot -NodeExe $nodePath -Pm2AppName $Pm2AppName
Write-Host "  POS mode: $($launcher.PosMode)"
Write-Host "  Launcher: $($launcher.LauncherPath)"
Write-Host ""
Write-Host "Next (kiosk till):"
Write-Host "  cd $InstallRoot\deployment"
Write-Host "  .\setup-kiosk.bat"
Write-Host "Done."
