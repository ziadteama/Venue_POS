#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Restrict outbound network on a POS till (US-9.3).

.PARAMETER HubServerIp
  Hub API server IP or hostname (HTTPS).

.PARAMETER LanAgentPort
  Local-agent LAN port (default 3456).

.PARAMETER PrinterIps
  Comma-separated printer/KDS IPs allowed on LAN (optional).

.EXAMPLE
  .\firewall-lockdown.ps1 -HubServerIp "203.0.113.10" -PrinterIps "192.168.1.50,192.168.1.51"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$HubServerIp,
  [int]$LanAgentPort = 3456,
  [string]$PrinterIps = ""
)

$ErrorActionPreference = "Stop"
$rulePrefix = "VenuePos"

Write-Host "Removing existing $rulePrefix rules ..."
Get-NetFirewallRule -DisplayName "$rulePrefix*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-Host "Blocking all outbound by default (use with care - test on staging till first)."
New-NetFirewallRule -DisplayName "${rulePrefix}-Block-Outbound-Default" `
  -Direction Outbound -Action Block -Enabled True | Out-Null

Write-Host "Allowing HTTPS to hub $HubServerIp ..."
New-NetFirewallRule -DisplayName "${rulePrefix}-Allow-Hub-HTTPS" `
  -Direction Outbound -Action Allow -Protocol TCP -RemoteAddress $HubServerIp -RemotePort 443 | Out-Null

Write-Host "Allowing LAN agent port $LanAgentPort (coordinator / peers) ..."
New-NetFirewallRule -DisplayName "${rulePrefix}-Allow-LAN-Agent" `
  -Direction Outbound -Action Allow -Protocol TCP -RemotePort $LanAgentPort | Out-Null

New-NetFirewallRule -DisplayName "${rulePrefix}-Allow-LAN-Agent-In" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $LanAgentPort | Out-Null

if ($PrinterIps) {
  foreach ($ip in ($PrinterIps -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
    Write-Host "Allowing printer/KDS $ip ..."
    New-NetFirewallRule -DisplayName "${rulePrefix}-Allow-Printer-$ip" `
      -Direction Outbound -Action Allow -RemoteAddress $ip -Protocol TCP | Out-Null
  }
}

Write-Host "Firewall lockdown applied. Verify POS can reach hub and printers before production."
