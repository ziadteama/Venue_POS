#Requires -RunAsAdministrator
param(
  [string]$ServiceRoot = ""
)

$ErrorActionPreference = "Stop"
if (-not $ServiceRoot) {
  $ServiceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$Pm2Home = Join-Path $ServiceRoot "pm2"
$Pm2AppName = "venue-pos-agent"

$env:PM2_HOME = $Pm2Home
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  pm2 delete $Pm2AppName --force 2>$null
  pm2 save --force 2>$null
}
if (Get-Command pm2-startup -ErrorAction SilentlyContinue) {
  pm2-startup uninstall 2>$null
}

Write-Host "Uninstalled PM2 app $Pm2AppName. Service files at $ServiceRoot were kept."
