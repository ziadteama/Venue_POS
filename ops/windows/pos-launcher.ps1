# Shared helper — resolve production POS launch command (portable .exe or npm fallback).
function Get-VenuePosLaunchCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $releaseDirs = @(
    (Join-Path $InstallRoot "pos\release"),
    (Join-Path $InstallRoot "apps\pos\release")
  )

  foreach ($releaseDir in $releaseDirs) {
    $exe = Get-ChildItem -Path $releaseDir -Filter "*-portable.exe" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($exe) {
      return @{
        Command = "`"$($exe.FullName)`""
        Cwd     = $InstallRoot
        Mode    = "portable-exe"
      }
    }
  }

  return @{
    Command = "npm run electron:prod -w @venue-pos/pos"
    Cwd     = $InstallRoot
    Mode    = "npm"
  }
}

function Get-VenuePosWatchdogEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
  )

  $bundleEntry = Join-Path $InstallRoot "watchdog\src\index.mjs"
  if (Test-Path $bundleEntry) { return $bundleEntry }

  $devEntry = Join-Path $InstallRoot "apps\watchdog\src\index.mjs"
  if (Test-Path $devEntry) { return $devEntry }

  throw "Watchdog entry not found under $InstallRoot (expected watchdog\src\index.mjs)"
}
