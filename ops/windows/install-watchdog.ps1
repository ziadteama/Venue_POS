#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Venue POS watchdog as a Windows service via NSSM (US-9.2).

.DESCRIPTION
  Registers a Windows Service that runs the Node watchdog. For GUI POS on a kiosk
  till, prefer setup-kiosk-user.ps1 (shell replacement) so Electron runs in the
  interactive kiosk user session. Use this script for headless watchdog hosts or
  when NSSM runs the service as the kiosk user (ObjectName).

.PARAMETER RepoRoot
  Absolute path to the Venue_POS repo (default: two levels above this script).

.PARAMETER NodeExe
  Path to node.exe (default: node on PATH).

.PARAMETER ServiceName
  Windows service name (default: VenuePosWatchdog).

.PARAMETER KioskUser
  Optional DOMAIN\user or .\user for the service account (GUI POS needs kiosk user).

.PARAMETER KioskPassword
  Password for KioskUser when ObjectName is set.

.EXAMPLE
  .\install-watchdog.ps1 -RepoRoot "C:\Venue_POS" -KioskUser ".\VenuePosKiosk" -KioskPassword "ChangeMe!"
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$NodeExe = "node",
  [string]$ServiceName = "VenuePosWatchdog",
  [string]$KioskUser = "",
  [string]$KioskPassword = ""
)

$ErrorActionPreference = "Stop"
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
  Write-Error "NSSM not found. Install from https://nssm.cc and add nssm.exe to PATH."
}

$watchdogEntry = Join-Path $RepoRoot "apps\watchdog\src\index.mjs"
if (-not (Test-Path $watchdogEntry)) {
  Write-Error "Watchdog entry not found: $watchdogEntry"
}

$logsDir = Join-Path $RepoRoot "logs"
if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$envExtra = @(
  "WATCHDOG_ENABLED=true",
  "WATCHDOG_CHECK_INTERVAL_MS=5000",
  "WATCHDOG_MAX_RESTARTS=3",
  "WATCHDOG_RESTART_WINDOW_MS=600000",
  "WATCHDOG_LOG_FILE=$logsDir\watchdog.log",
  "WATCHDOG_POS_CWD=$RepoRoot",
  "ELECTRON_IS_KIOSK=true",
  "WATCHDOG_POS_COMMAND=npm run electron:dev -w @venue-pos/pos"
)

Write-Host "Installing service $ServiceName ..."
& nssm install $ServiceName $NodeExe $watchdogEntry
& nssm set $ServiceName AppDirectory $RepoRoot
& nssm set $ServiceName AppStdout (Join-Path $logsDir "watchdog-stdout.log")
& nssm set $ServiceName AppStderr (Join-Path $logsDir "watchdog-stderr.log")
& nssm set $ServiceName AppRotateFiles 1
& nssm set $ServiceName AppRotateBytes 10485760
& nssm set $ServiceName Start SERVICE_AUTO_START
& nssm set $ServiceName AppEnvironmentExtra $envExtra

if ($KioskUser) {
  & nssm set $ServiceName ObjectName $KioskUser $KioskPassword
  Write-Host "Service will run as $KioskUser (required for GUI POS)."
}

& nssm start $ServiceName
Write-Host "Service $ServiceName installed and started."
Write-Host "Logs: $logsDir\watchdog.log"
Write-Host "For kiosk tills, run setup-kiosk-user.ps1 to replace Explorer shell with the watchdog."
