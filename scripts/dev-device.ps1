<#
.SYNOPSIS
  Preflight + launch for local Android device testing: checks adb device
  state, frees the Metro port if something stale is holding it, sets up
  adb reverse, and starts Metro against the dev client already installed
  on the device.

.DESCRIPTION
  This does NOT build/install the APK -- use build-and-install-android.ps1
  (repo root) for that. Run this script after the APK is already installed,
  any time you're about to do a device-testing session and want the usual
  adb/Metro dance done consistently instead of re-derived by hand:
    1. Confirm adb sees exactly one authorized device (or the one passed
       via -Device); refuse to guess if the state is unauthorized/offline
       or ambiguous.
    2. Check whether MetroPort is already bound by something -- if so,
       report what's holding it instead of silently colliding.
    3. adb reverse tcp:<port> tcp:<port> (drops on every USB
       reconnect -- this is why step 1/3 need to run each session).
    4. Start Metro (npx expo start --dev-client --port <port>) from
       artifacts/mobile.

.PARAMETER Device
  adb serial to target. If omitted and exactly one authorized device is
  connected, that device is used; if zero or multiple, the script stops
  and asks you to be explicit rather than guessing.

.PARAMETER MetroPort
  Defaults to 3011, matching build-and-install-android.ps1.

.EXAMPLE
  .\scripts\dev-device.ps1
.EXAMPLE
  .\scripts\dev-device.ps1 -Device b81a371a
#>

param(
  [string]$Device,
  [int]$MetroPort = 3011
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $RepoRoot "artifacts\mobile"
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

if (-not (Test-Path $MobileDir)) {
  throw "Mobile app directory not found at $MobileDir"
}
if (-not (Test-Path $adb)) {
  throw "adb not found at $adb -- check your Android SDK install location."
}

# --- 1. Confirm device state ---
$raw = & $adb devices
Write-Host "adb devices:"
$raw | ForEach-Object { Write-Host "  $_" }

$authorized = $raw | Select-String -Pattern "\tdevice$"
$unauthorized = $raw | Select-String -Pattern "\tunauthorized$"
$offline = $raw | Select-String -Pattern "\toffline$"

if ($unauthorized -or $offline) {
  throw "A connected device is unauthorized/offline. Check the device screen for a 'trust this computer' prompt and re-approve it, then rerun -- retrying here won't fix an unanswered prompt."
}

if ($Device) {
  $targetSerial = $Device
} elseif (@($authorized).Count -eq 1) {
  $targetSerial = (($authorized | Select-Object -First 1).ToString() -split "\t")[0]
} elseif (@($authorized).Count -eq 0) {
  throw "No authorized device/emulator detected. Start an emulator or plug in and authorize a physical device."
} else {
  throw "Multiple authorized devices connected. Pass -Device <serial> to pick one (see the list above)."
}
Write-Host "Targeting device: $targetSerial"

# --- 2. Check whether MetroPort is already in use ---
$conn = Get-NetTCPConnection -LocalPort $MetroPort -ErrorAction SilentlyContinue
if ($conn) {
  $pids = $conn.OwningProcess | Sort-Object -Unique
  foreach ($procId in $pids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Warning "Port $MetroPort is already in use by PID $procId ($($proc.ProcessName)). If this is a stale Metro/build process, stop it first (Stop-Process -Id $procId -Force); otherwise Metro will fail to bind."
    }
  }
} else {
  Write-Host "Port $MetroPort is free."
}

# --- 3. adb reverse ---
& $adb -s $targetSerial reverse "tcp:$MetroPort" "tcp:$MetroPort"
Write-Host "adb reverse tcp:$MetroPort tcp:$MetroPort set up for $targetSerial."

# --- 4. Start Metro ---
Push-Location $MobileDir
try {
  Write-Host "Starting Metro: npx expo start --dev-client --port $MetroPort"
  npx expo start --dev-client --port $MetroPort
} finally {
  Pop-Location
}
