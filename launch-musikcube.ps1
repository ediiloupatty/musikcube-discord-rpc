# Launches musikcube together with the Discord Rich Presence bridge.
# The bridge runs hidden and is stopped automatically when musikcube closes.
$ErrorActionPreference = 'SilentlyContinue'

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $dir 'bridge-runtime.log'

# --- locate node ------------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($c in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
    if (Test-Path $c) { $node = $c; break }
  }
}

# --- locate musikcube (from config.json, with a sensible fallback) ----------
$musikcube = 'C:\musikcube\musikcube.exe'
try {
  $cfg = Get-Content (Join-Path $dir 'config.json') -Raw | ConvertFrom-Json
  if ($cfg.musikcubePath) { $musikcube = $cfg.musikcubePath }
} catch {}

"[$(Get-Date -Format o)] launcher start (node=$node, musikcube=$musikcube)" | Out-File -FilePath $log -Append -Encoding utf8

if (-not $node)             { "ERROR: node.exe not found; install Node.js." | Out-File $log -Append -Encoding utf8; exit 1 }
if (-not (Test-Path $musikcube)) { "ERROR: musikcube not found at $musikcube; set musikcubePath in config.json." | Out-File $log -Append -Encoding utf8; exit 1 }

# Stop any leftover bridge to avoid duplicates.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*bridge.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Start the bridge, hidden, logging to a file for diagnostics.
Start-Process -FilePath $node -ArgumentList 'bridge.js' `
  -WorkingDirectory $dir -WindowStyle Hidden `
  -RedirectStandardOutput $log -RedirectStandardError (Join-Path $dir 'bridge-error.log') | Out-Null

# Start musikcube. We watch it by process NAME, not by the returned handle,
# because musikcube is single-instance and the launched process can hand off
# and exit immediately.
$mcName = [System.IO.Path]::GetFileNameWithoutExtension($musikcube)
Start-Process -FilePath $musikcube | Out-Null

Start-Sleep -Seconds 3
while (Get-Process -Name $mcName -ErrorAction SilentlyContinue) {
  Start-Sleep -Seconds 3
}

# musikcube closed -> stop the bridge so the Discord status disappears.
"[$(Get-Date -Format o)] musikcube closed, stopping bridge" | Out-File -FilePath $log -Append -Encoding utf8
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*bridge.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
