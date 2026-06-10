#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Restore Explorer shell and undo kiosk registry lockdown.
#>
$ErrorActionPreference = "Stop"

$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $winlogon -Name Shell -Value "explorer.exe"
Set-ItemProperty -Path $winlogon -Name AutoAdminLogon -Value "0"
Remove-ItemProperty -Path $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue

$policies = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
Remove-ItemProperty -Path $policies -Name DisableTaskMgr -ErrorAction SilentlyContinue

$explorerPol = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer"
Remove-ItemProperty -Path $explorerPol -Name NoRun -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $explorerPol -Name NoWinKeys -ErrorAction SilentlyContinue

Write-Host "Kiosk shell rollback complete. Reboot recommended."
