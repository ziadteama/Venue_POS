#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Venue POS till bundle on Windows (agent service + production POS launcher).

.PARAMETER InstallRoot
  Target directory (default: C:\Venue_POS).

.EXAMPLE
  .\install.ps1 -InstallRoot C:\Venue_POS
#>
param(
  [string]$InstallRoot = "C:\Venue_POS"
)

$ErrorActionPreference = "Stop"
$BundleRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if (-not (Test-Path (Join-Path $BundleRoot "local-agent"))) {
  throw "Bundle layout invalid — expected local-agent/ at bundle root ($BundleRoot)"
}

Write-Host "==> Copying bundle to $InstallRoot"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$items = @("local-agent", "pos", "watchdog", "ops", "packages", "node_modules", "scripts", "package.json")
foreach ($item in $items) {
  $src = Join-Path $BundleRoot $item
  if (-not (Test-Path $src)) { continue }
  $dest = Join-Path $InstallRoot $item
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Copy-Item $src $dest -Recurse -Force
}

Write-Host "==> Rebuilding native modules (bcrypt, better-sqlite3)"
Push-Location $InstallRoot
npm run setup:node20
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "==> Writing production kiosk launcher"
$launcher = Join-Path $InstallRoot "ops\windows\launch-watchdog.cmd"
$launcherContent = @"
@echo off
cd /d "$InstallRoot"
set WATCHDOG_ENABLED=true
set WATCHDOG_CHECK_INTERVAL_MS=5000
set WATCHDOG_MAX_RESTARTS=3
set WATCHDOG_RESTART_WINDOW_MS=600000
set WATCHDOG_LOG_FILE=$InstallRoot\logs\watchdog.log
set WATCHDOG_POS_CWD=$InstallRoot\pos
set ELECTRON_IS_KIOSK=true
set NODE_ENV=production
set WATCHDOG_POS_COMMAND=npm run electron:prod -w @venue-pos/pos
node "$InstallRoot\watchdog\src\index.mjs"
"@
New-Item -ItemType Directory -Path (Split-Path $launcher) -Force | Out-Null
Set-Content -Path $launcher -Value $launcherContent -Encoding ASCII

Write-Host "==> Next: kiosk lockdown (reboot required)"
Write-Host "  cd $InstallRoot\ops\windows"
Write-Host "  .\setup-kiosk-user.ps1 -Password `"YourSecurePassword`" -RepoRoot `"$InstallRoot`""
Write-Host "  .\firewall-lockdown.ps1 -HubServerIp `"<api-host>`""
Write-Host "Done."
