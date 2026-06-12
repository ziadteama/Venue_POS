#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Configure a restricted Windows kiosk user for Venue POS (US-9.1).

.DESCRIPTION
  Creates a local kiosk user, enables auto-login, replaces Explorer shell with the
  watchdog launcher, and applies registry lockdown (Task Manager, Run dialog).

.PARAMETER Username
  Local kiosk username (default: VenuePosKiosk).

.PARAMETER Password
  Password for the kiosk user (required).

.PARAMETER RepoRoot
  Venue_POS repo root (default: two levels above this script).

.PARAMETER NodeExe
  Path to node.exe for the watchdog shell (default: node on PATH).

.EXAMPLE
  .\setup-kiosk-user.ps1 -Password "SecureKioskPass1!"
#>
param(
  [string]$Username = "VenuePosKiosk",
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$NodeExe = "node"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "pos-launcher.ps1")

$user = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
if (-not $user) {
  $sec = ConvertTo-SecureString $Password -AsPlainText -Force
  New-LocalUser -Name $Username -Password $sec -FullName "Venue POS Kiosk" -Description "Restricted POS kiosk account" | Out-Null
  Write-Host "Created local user $Username"
} else {
  Write-Host "User $Username already exists"
}

# Deny shutdown / logoff for standard users via local policy (optional hardening)
# Add to Users group only — no Administrators
Add-LocalGroupMember -Group "Users" -Member $Username -ErrorAction SilentlyContinue

$posLaunch = Get-VenuePosLaunchCommand -InstallRoot $RepoRoot
$watchdogEntry = Get-VenuePosWatchdogEntry -InstallRoot $RepoRoot
$watchdogLauncher = Join-Path $RepoRoot "ops\windows\launch-watchdog.cmd"
$watchdogScript = @"
@echo off
cd /d "$RepoRoot"
set WATCHDOG_ENABLED=true
set WATCHDOG_CHECK_INTERVAL_MS=5000
set WATCHDOG_MAX_RESTARTS=3
set WATCHDOG_RESTART_WINDOW_MS=600000
set WATCHDOG_LOG_FILE=$RepoRoot\logs\watchdog.log
set WATCHDOG_POS_CWD=$($posLaunch.Cwd)
set ELECTRON_IS_KIOSK=true
set NODE_ENV=production
set WATCHDOG_POS_COMMAND=$($posLaunch.Command)
"$NodeExe" "$watchdogEntry"
"@
Set-Content -Path $watchdogLauncher -Value $watchdogScript -Encoding ASCII
Write-Host "Wrote launcher: $watchdogLauncher"

# Winlogon auto-login
$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $winlogon -Name AutoAdminLogon -Value "1"
Set-ItemProperty -Path $winlogon -Name DefaultUserName -Value $Username
Set-ItemProperty -Path $winlogon -Name DefaultPassword -Value $Password
Set-ItemProperty -Path $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME

# Shell replacement — watchdog instead of explorer.exe
Set-ItemProperty -Path $winlogon -Name Shell -Value $watchdogLauncher
Write-Host "Shell replaced with watchdog launcher (rollback: set Shell to explorer.exe)"

# Disable Task Manager for all users (kiosk policy)
$policies = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
if (-not (Test-Path $policies)) { New-Item -Path $policies -Force | Out-Null }
Set-ItemProperty -Path $policies -Name DisableTaskMgr -Value 1

# Disable Run dialog (Win+R)
$explorerPol = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer"
if (-not (Test-Path $explorerPol)) { New-Item -Path $explorerPol -Force | Out-Null }
Set-ItemProperty -Path $explorerPol -Name NoRun -Value 1
Set-ItemProperty -Path $explorerPol -Name NoWinKeys -Value 1

Write-Host "Kiosk user configured. Reboot to auto-login and launch POS via watchdog."
Write-Host "Rollback: Set Winlogon Shell=explorer.exe, AutoAdminLogon=0, remove DisableTaskMgr/NoRun."
