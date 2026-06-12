#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Venue POS till bundle on Windows (copy files, native modules, agent service, POS launcher).

.PARAMETER InstallRoot
  Target directory (default: C:\Venue_POS).

.PARAMETER SkipAgentInstall
  Skip install-agent.ps1 (NSSM service). Use when NSSM is not available yet.

.PARAMETER ApiUrl
  Optional — passed to install-agent.ps1 for local-agent/.env.

.PARAMETER TerminalId
  Optional terminal UUID from dev ops Till provisioning.

.PARAMETER TerminalSecret
  Optional terminal secret from dev ops Till provisioning.

.PARAMETER VenueId
  Optional venue UUID.

.EXAMPLE
  .\install.ps1 -InstallRoot C:\Venue_POS
.EXAMPLE
  .\install.ps1 -InstallRoot C:\Venue_POS -ApiUrl "https://hub.example.com" -TerminalId "..." -TerminalSecret "..." -VenueId "..."
#>
param(
  [string]$InstallRoot = "C:\Venue_POS",
  [switch]$SkipAgentInstall,
  [string]$ApiUrl = "",
  [string]$TerminalId = "",
  [string]$TerminalSecret = "",
  [string]$VenueId = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "pos-launcher.ps1")
$BundleRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if (-not (Test-Path (Join-Path $BundleRoot "local-agent"))) {
  throw "Bundle layout invalid — expected local-agent/ at bundle root ($BundleRoot)"
}

Write-Host "==> Copying bundle to $InstallRoot"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$items = @("local-agent", "pos", "watchdog", "ops", "packages", "node_modules", "scripts", "package.json", "deployment")
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

if (-not $SkipAgentInstall) {
  Write-Host "==> Installing local-agent service + till launcher"
  $agentArgs = @{
    InstallRoot        = $InstallRoot
    SkipNativeRebuild  = $true
  }
  if ($ApiUrl) { $agentArgs.ApiUrl = $ApiUrl }
  if ($TerminalId) { $agentArgs.TerminalId = $TerminalId }
  if ($TerminalSecret) { $agentArgs.TerminalSecret = $TerminalSecret }
  if ($VenueId) { $agentArgs.VenueId = $VenueId }

  try {
    & (Join-Path $PSScriptRoot "install-agent.ps1") @agentArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } catch {
    Write-Warning "install-agent.ps1 failed: $_"
    Write-Warning "Install NSSM (https://nssm.cc) then run: .\install-agent.ps1 -InstallRoot `"$InstallRoot`""
    Write-VenuePosTillLauncher -InstallRoot $InstallRoot | Out-Null
  }
} else {
  Write-VenuePosTillLauncher -InstallRoot $InstallRoot | Out-Null
  Write-Host "  Wrote launch-till.cmd (agent service skipped — run install-agent.ps1)"
}

Write-Host "==> Next: kiosk lockdown (reboot required)"
Write-Host "  cd $InstallRoot\ops\windows"
Write-Host "  .\setup-kiosk-user.ps1 -Password `"YourSecurePassword`" -RepoRoot `"$InstallRoot`""
Write-Host "  .\firewall-lockdown.ps1 -HubServerIp `"<api-host>`""
Write-Host "Done."
