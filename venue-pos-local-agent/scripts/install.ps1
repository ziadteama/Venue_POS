#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install venue-pos-local-agent as PM2 app + Windows boot startup (pm2-windows-startup).

.DESCRIPTION
  Self-contained installer for the standalone local-agent repo.
  - npm install + native rebuild
  - global pm2 + pm2-windows-startup
  - PM2 app venue-pos-agent
  - pm2-startup install (resurrect on reboot)

.PARAMETER ServiceRoot
  Clone/install directory (default: parent of scripts folder).

.PARAMETER ApiUrl, TerminalId, TerminalSecret, VenueId
  Optional — writes .env when all three creds are set.

.EXAMPLE
  .\scripts\install.ps1
.EXAMPLE
  .\scripts\install.ps1 -ServiceRoot C:\venue-pos-local-agent -ApiUrl https://hub.example.com -TerminalId ... -TerminalSecret ... -VenueId ...
#>
param(
  [string]$ServiceRoot = "",
  [string]$ApiUrl = "",
  [string]$TerminalId = "",
  [string]$TerminalSecret = "",
  [string]$VenueId = "",
  [string]$Node20MsiPath = "",
  [switch]$SkipNativeRebuild,
  [switch]$SkipHealthCheck,
  [switch]$SkipPm2Startup
)

$ErrorActionPreference = "Stop"

if (-not $ServiceRoot) {
  $ServiceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ServiceRoot = (Resolve-Path $ServiceRoot).Path
}

$AgentRoot = $ServiceRoot
$Pm2Home = Join-Path $ServiceRoot "pm2"
$Pm2AppName = "venue-pos-agent"
$EnvFile = Join-Path $ServiceRoot ".env"
$ProvFile = Join-Path $ServiceRoot "provision.env"

function Get-ProvValue {
  param([string]$Key)
  if (-not (Test-Path $ProvFile)) { return "" }
  foreach ($line in Get-Content $ProvFile) {
    if ($line -match "^\s*$Key\s*=\s*(.+)\s*$") { return $Matches[1].Trim() }
  }
  return ""
}

if (-not $ApiUrl) { $ApiUrl = Get-ProvValue "API_URL" }
if (-not $TerminalId) { $TerminalId = Get-ProvValue "TERMINAL_ID" }
if (-not $TerminalSecret) { $TerminalSecret = Get-ProvValue "TERMINAL_SECRET" }
if (-not $VenueId) { $VenueId = Get-ProvValue "VENUE_ID" }
if (-not $Node20MsiPath) { $Node20MsiPath = Get-ProvValue "NODE20_MSI_PATH" }

if (-not (Test-Path (Join-Path $ServiceRoot "src\index.js"))) {
  throw "Invalid service root — expected src\index.js under $ServiceRoot"
}

Write-Host "==> Service root: $ServiceRoot"
Write-Host "==> PM2_HOME:     $Pm2Home"

New-Item -ItemType Directory -Path $Pm2Home -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ServiceRoot "data") -Force | Out-Null

# Node 20 check
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install Node 20 LTS: https://nodejs.org/"
}
$nodeMajor = [int]((node -v) -replace 'v','').Split('.')[0]
if ($nodeMajor -ne 20) {
  Write-Warning "Node $(node -v) detected — Node 20.x is required for production tills."
}
$NodeExe = (Get-Command node).Source

# .env from example or provision
if (-not (Test-Path $EnvFile)) {
  $example = Join-Path $ServiceRoot ".env.example"
  if (Test-Path $example) {
    Copy-Item $example $EnvFile
    Write-Host "==> Created .env from .env.example"
  }
}

$hasCreds = $ApiUrl -and $TerminalId -and $TerminalSecret
if ($hasCreds) {
  Write-Host "==> Writing .env from provision creds"
  $api = $ApiUrl.Trim().TrimEnd('/')
  if ($api -notmatch '^https?://') { $api = "https://$api" }
  $lanHost = ""
  try {
    $lanHost = (
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1 -ExpandProperty IPAddress
    )
  } catch { $lanHost = "127.0.0.1" }

  @(
    'PORT=3456',
    'HOST=0.0.0.0',
    'SQLITE_PATH=./data/local.db',
    'SQLITE_WAL_MODE=true',
    "TERMINAL_ID=$TerminalId",
    "TERMINAL_SECRET=$TerminalSecret",
    "VENUE_ID=$VenueId",
    "SERVER_API_URL=$api",
    "CLOUD_HEALTH_URL=$api/health",
    'AGENT_LAN_PORT=3456',
    "AGENT_LAN_HOST=$lanHost",
    'CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174'
  ) | Set-Content -Path $EnvFile -Encoding UTF8
} elseif (-not (Test-Path $EnvFile)) {
  Write-Warning "No .env — copy .env.example or fill provision.env before going live."
}

# npm install
Write-Host "==> npm install"
Push-Location $ServiceRoot
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed" }
if (-not $SkipNativeRebuild) {
  Write-Host "==> Rebuilding native modules"
  npm run rebuild:native
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "rebuild:native failed" }
}
Pop-Location

# PM2 global
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "==> Installing pm2 + pm2-windows-startup globally"
  npm install -g pm2 pm2-windows-startup
  if ($LASTEXITCODE -ne 0) { throw "npm install -g pm2 pm2-windows-startup failed" }
}

# Machine env
[Environment]::SetEnvironmentVariable('VENUE_POS_AGENT_ROOT', $AgentRoot, 'Machine')
[Environment]::SetEnvironmentVariable('VENUE_POS_INSTALL_ROOT', $ServiceRoot, 'Machine')
[Environment]::SetEnvironmentVariable('PM2_HOME', $Pm2Home, 'Machine')
$env:PM2_HOME = $Pm2Home

# Ecosystem
$fwd = @{
  Root    = ($ServiceRoot -replace '\\', '/')
  Pm2Home = ($Pm2Home -replace '\\', '/')
  NodeExe = ($NodeExe -replace '\\', '/')
}
$EcoPath = Join-Path $ServiceRoot "ecosystem.config.cjs"
@"

module.exports = {
  apps: [{
    name: '$Pm2AppName',
    script: 'src/index.js',
    cwd: '$($fwd.Root)',
    interpreter: '$($fwd.NodeExe)',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '5s',
    env: {
      NODE_ENV: 'production',
      PM2_HOME: '$($fwd.Pm2Home)',
      VENUE_POS_AGENT_ROOT: '$($fwd.Root)',
      VENUE_POS_INSTALL_ROOT: '$($fwd.Root)',
    },
  }],
};
"@ | Set-Content -Path $EcoPath -Encoding UTF8

Write-Host "==> PM2 start $Pm2AppName"
pm2 delete $Pm2AppName --force 2>$null
pm2 start $EcoPath
pm2 save

if (-not $SkipPm2Startup) {
  if (Get-Command pm2-startup -ErrorAction SilentlyContinue) {
    Write-Host "==> pm2-startup install (boot resurrect)"
    pm2-startup install
  } else {
    Write-Warning "pm2-startup not found — run: npm install -g pm2-windows-startup"
  }
}

if (-not $SkipHealthCheck) {
  Write-Host "==> Health check"
  Push-Location $ServiceRoot
  node scripts/health-check.mjs
  Pop-Location
}

Write-Host ""
Write-Host "Done."
Write-Host "  pm2 status $Pm2AppName"
Write-Host "  pm2 logs $Pm2AppName"
Write-Host "  http://127.0.0.1:3456/health"
