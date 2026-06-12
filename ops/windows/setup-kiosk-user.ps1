#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Configure a restricted Windows kiosk user for Venue POS (US-9.1).

.DESCRIPTION
  Creates a local kiosk user, enables auto-login, replaces Explorer shell with
  launch-till.cmd (local-agent service + watchdog → portable POS .exe), and
  applies registry lockdown (Task Manager, Run dialog).

.PARAMETER Username
  Local kiosk username (default: VenuePosKiosk).

.PARAMETER Password
  Password for the kiosk user (required).

.PARAMETER RepoRoot
  Venue_POS install root (default: two levels above this script).

.PARAMETER NodeExe
  Path to node.exe for the watchdog shell (default: node on PATH).

.EXAMPLE
  .\setup-kiosk-user.ps1 -Password "SecureKioskPass1!" -RepoRoot "C:\Venue_POS"
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

Add-LocalGroupMember -Group "Users" -Member $Username -ErrorAction SilentlyContinue

$launcher = Write-VenuePosTillLauncher -InstallRoot $RepoRoot -NodeExe $NodeExe
Write-Host "Wrote till launcher: $($launcher.LauncherPath) (POS: $($launcher.PosMode))"

$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $winlogon -Name AutoAdminLogon -Value "1"
Set-ItemProperty -Path $winlogon -Name DefaultUserName -Value $Username
Set-ItemProperty -Path $winlogon -Name DefaultPassword -Value $Password
Set-ItemProperty -Path $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME

Set-ItemProperty -Path $winlogon -Name Shell -Value $launcher.LauncherPath
Write-Host "Shell replaced with till launcher (rollback: set Shell to explorer.exe)"

$policies = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
if (-not (Test-Path $policies)) { New-Item -Path $policies -Force | Out-Null }
Set-ItemProperty -Path $policies -Name DisableTaskMgr -Value 1

$explorerPol = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer"
if (-not (Test-Path $explorerPol)) { New-Item -Path $explorerPol -Force | Out-Null }
Set-ItemProperty -Path $explorerPol -Name NoRun -Value 1
Set-ItemProperty -Path $explorerPol -Name NoWinKeys -Value 1

Write-Host "Kiosk user configured. Reboot to auto-login: local-agent service + portable POS."
Write-Host "Rollback: Set Winlogon Shell=explorer.exe, AutoAdminLogon=0, remove DisableTaskMgr/NoRun."
