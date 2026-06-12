#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Ensure Node.js 20 LTS is the system Node on PATH (uninstall other versions if needed).

.DESCRIPTION
  For Venue POS till setup: removes non-Node-20 installs from Programs and Features,
  installs the latest Node 20.x LTS MSI from nodejs.org when missing, and refreshes PATH.

.PARAMETER MsiPath
  Optional local path to node-v20.x-x64.msi (offline till - skip download).

.PARAMETER SkipDownload
  Only uninstall wrong versions; fail if Node 20 is still missing (use with -MsiPath).

.EXAMPLE
  .\ensure-node20.ps1
.EXAMPLE
  .\ensure-node20.ps1 -MsiPath C:\Venue_POS\cache\node-v20.18.1-x64.msi
#>
param(
  [string]$MsiPath = "",
  [switch]$SkipDownload
)

$ErrorActionPreference = 'Stop'
$script:VenuePosNodeDir = 'C:\Program Files\nodejs'

function Get-VenuePosMachinePath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($machine -and $user) { return "$machine;$user" }
  if ($machine) { return $machine }
  if ($user) { return $user }
  return ''
}

function Update-VenuePosSessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($machine) { $parts += $machine -split ';' }
  if ($user) { $parts += $user -split ';' }

  $ordered = [System.Collections.Generic.List[string]]::new()
  foreach ($preferred in @($script:VenuePosNodeDir)) {
    if ($preferred -and (Test-Path $preferred) -and -not $ordered.Contains($preferred)) {
      $ordered.Add($preferred)
    }
  }
  foreach ($part in $parts) {
    $p = $part.Trim()
    if ($p -and -not $ordered.Contains($p)) { $ordered.Add($p) }
  }
  $env:Path = ($ordered -join ';')
}

function Get-VenuePosNodeExeCandidates {
  $candidates = [System.Collections.Generic.List[string]]::new()
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $candidates.Add($cmd.Source) }

  $bundled = Join-Path $script:VenuePosNodeDir 'node.exe'
  if (Test-Path $bundled) { $candidates.Add($bundled) }

  $nvmRoots = @(
    $env:NVM_HOME,
    'C:\Program Files\nvm',
    (Join-Path $env:APPDATA 'nvm')
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($nvmRoot in $nvmRoots) {
    Get-ChildItem $nvmRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^v20\.\d+\.\d+$' } |
      Sort-Object Name -Descending |
      ForEach-Object {
        $exe = Join-Path $_.FullName 'node.exe'
        if (Test-Path $exe) { $candidates.Add($exe) }
      }
  }

  return $candidates | Select-Object -Unique
}

function Get-VenuePosNodeVersionLabel {
  param([Parameter(Mandatory = $true)][string]$NodeExe)
  try {
    $out = & $NodeExe -v 2>$null
    return "$out".Trim()
  } catch {
    return ''
  }
}

function Test-VenuePosNode20Ready {
  Update-VenuePosSessionPath
  foreach ($exe in Get-VenuePosNodeExeCandidates) {
    $ver = Get-VenuePosNodeVersionLabel -NodeExe $exe
    if ($ver -match '^v20\.') {
      return @{
        Ready = $true
        Exe   = $exe
        Ver   = $ver
      }
    }
  }
  return @{ Ready = $false }
}

function Get-VenuePosNodeUninstallEntries {
  $keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  Get-ItemProperty $keys -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match '^Node\.js' } |
    Select-Object DisplayName, DisplayVersion, UninstallString, QuietUninstallString
}

function Invoke-VenuePosNodeUninstall {
  param([string]$UninstallString)

  if (-not $UninstallString) { return }

  if ($UninstallString -match '\{([0-9A-Fa-f-]{36})\}') {
    $guid = $Matches[1]
    Write-Host "    msiexec /X{$guid} /qn"
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @("/X{$guid}", '/qn', '/norestart') -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
      throw "Node uninstall failed (exit $($p.ExitCode))"
    }
    return
  }

  if ($UninstallString -match '^"([^"]+)"(.*)$') {
    $exe = $Matches[1]
    $args = $Matches[2].Trim()
    Write-Host "    $exe $args"
    $p = Start-Process -FilePath $exe -ArgumentList $args -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) {
      throw "Node uninstall failed (exit $($p.ExitCode))"
    }
  }
}

function Uninstall-VenuePosWrongNodeVersions {
  $entries = @(Get-VenuePosNodeUninstallEntries)
  if (-not $entries.Count) {
    Write-Host "==> No Node.js entries in Programs and Features"
    return
  }

  foreach ($entry in $entries) {
    $major = 0
    if ($entry.DisplayVersion -match '^(\d+)') { $major = [int]$Matches[1] }
    if ($major -eq 20) {
      Write-Host "==> Keeping $($entry.DisplayName) $($entry.DisplayVersion)"
      continue
    }

    Write-Host "==> Removing $($entry.DisplayName) $($entry.DisplayVersion)"
    $cmd = if ($entry.QuietUninstallString) { $entry.QuietUninstallString } else { $entry.UninstallString }
    Invoke-VenuePosNodeUninstall -UninstallString $cmd
  }

  Start-Sleep -Seconds 2
  if (Test-Path $script:VenuePosNodeDir) {
    $leftover = Join-Path $script:VenuePosNodeDir 'node.exe'
    if (-not (Test-Path $leftover) -or (Get-VenuePosNodeVersionLabel -NodeExe $leftover) -notmatch '^v20\.') {
      Write-Host "==> Cleaning leftover $($script:VenuePosNodeDir)"
      Remove-Item $script:VenuePosNodeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-VenuePosLatestNode20Version {
  if ($env:VENUE_POS_NODE20_VERSION -match '^v?20\.\d+\.\d+$') {
    $v = $env:VENUE_POS_NODE20_VERSION
    if ($v -notmatch '^v') { $v = "v$v" }
    return $v
  }

  Write-Host "==> Resolving latest Node 20.x from nodejs.org"
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $match = $index | Where-Object { $_.version -match '^v20\.\d+\.\d+$' } | Select-Object -First 1
  if (-not $match) { throw 'Could not find Node 20.x on nodejs.org dist index' }
  return $match.version
}

function Install-VenuePosNode20Msi {
  param(
    [Parameter(Mandatory = $true)][string]$MsiFile
  )

  if (-not (Test-Path $MsiFile)) { throw "MSI not found: $MsiFile" }

  Write-Host "==> Installing Node 20 from $MsiFile"
  $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $MsiFile, '/qn', '/norestart', 'ADDLOCAL=ALL') -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
    throw "Node 20 MSI install failed (exit $($p.ExitCode))"
  }
}

function Ensure-VenuePosNode20PathFirst {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if (-not $machinePath) { $machinePath = '' }
  $parts = $machinePath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $filtered = $parts | Where-Object { $_ -ne $script:VenuePosNodeDir }
  $newPath = (@($script:VenuePosNodeDir) + $filtered) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')
}

function Ensure-VenuePosNode20 {
  $ready = Test-VenuePosNode20Ready
  if ($ready.Ready) {
    Write-Host "==> Node 20 already active: $($ready.Ver) ($($ready.Exe))"
    Ensure-VenuePosNode20PathFirst
    Update-VenuePosSessionPath
    return $ready.Exe
  }

  Write-Host "==> Node 20 required (wrong or missing Node on PATH)"
  Uninstall-VenuePosWrongNodeVersions

  $ready = Test-VenuePosNode20Ready
  if ($ready.Ready) {
    Write-Host "==> Node 20 ready after cleanup: $($ready.Ver)"
    Ensure-VenuePosNode20PathFirst
    Update-VenuePosSessionPath
    return $ready.Exe
  }

  $msiFile = $MsiPath
  if (-not $msiFile) {
    if ($SkipDownload) {
      throw 'Node 20 not found. Pass -MsiPath or allow download from nodejs.org.'
    }
    $version = Get-VenuePosLatestNode20Version
    $msiName = "node-$version-x64.msi"
    $msiFile = Join-Path $env:TEMP $msiName
    $url = "https://nodejs.org/dist/$version/$msiName"
    Write-Host "==> Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $msiFile -UseBasicParsing
  }

  Install-VenuePosNode20Msi -MsiFile $msiFile
  Ensure-VenuePosNode20PathFirst
  Update-VenuePosSessionPath

  $bundled = Join-Path $script:VenuePosNodeDir 'node.exe'
  if (-not (Test-Path $bundled)) {
    throw "Node 20 install finished but $bundled is missing"
  }

  $ver = Get-VenuePosNodeVersionLabel -NodeExe $bundled
  if ($ver -notmatch '^v20\.') {
    throw "Node 20 install finished but version is $ver"
  }

  Write-Host "==> Node 20 installed: $ver ($bundled)"
  return $bundled
}

if ($MyInvocation.InvocationName -ne '.') {
  try {
    $exe = Ensure-VenuePosNode20
    Write-Host "Done. Active Node: $exe"
    exit 0
  } catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}
