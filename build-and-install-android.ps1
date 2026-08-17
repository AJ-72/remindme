<#
.SYNOPSIS
  Build the Reminders Android app locally (no EAS quota used) and install it
  on whichever device/emulator adb currently sees.

.DESCRIPTION
  Wraps `npx expo run:android`, working around the Windows-specific issues
  documented in CLAUDE.md's "Local Android builds on Windows" section:
    - Pins JAVA_HOME to Android Studio's bundled JBR (JDK 21) so a newer
      system `java` (e.g. JDK 26) doesn't break the Kotlin/Gradle toolchain.
    - Assumes the CMake/Ninja long-path fix is already applied in
      android/build.gradle and android/app/build.gradle (see CLAUDE.md).
      If you've just run `expo prebuild --clean`, reapply those edits first
      -- prebuild wipes them.

.PARAMETER Device
  Optional adb serial (e.g. from `adb devices`) to target a specific
  device/emulator when more than one is connected.

.PARAMETER Variant
  Build variant to install: "debug" (default, fetches JS live from Metro)
  or "release" (JS bundled into the APK, no Metro required after install).

.EXAMPLE
  .\build-and-install-android.ps1
.EXAMPLE
  .\build-and-install-android.ps1 -Device emulator-5554 -Variant release
#>

param(
  [string]$Device,
  [ValidateSet("debug", "release")]
  [string]$Variant = "debug"
)

$ErrorActionPreference = "Stop"

$MetroPort = 3011

$RepoRoot = $PSScriptRoot
$MobileDir = Join-Path $RepoRoot "artifacts\mobile"

if (-not (Test-Path $MobileDir)) {
  throw "Mobile app directory not found at $MobileDir"
}

# --- 1. Fix JAVA_HOME (see CLAUDE.md: JDK 26 on PATH breaks Gradle plugin resolution) ---
$JbrPath = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $JbrPath) {
  $env:JAVA_HOME = $JbrPath
  Write-Host "JAVA_HOME set to Android Studio's bundled JBR: $JbrPath"
} else {
  Write-Warning "Android Studio JBR not found at '$JbrPath' -- leaving JAVA_HOME as-is. If the build fails with a cryptic Gradle plugin version error, point JAVA_HOME at a JDK 17-21 install."
}

# --- 1b. Ensure Gradle can find the Android SDK ---
# android/local.properties is gitignored (per-machine), so a fresh clone or a
# post-"expo prebuild --clean" tree won't have it -- Gradle then fails with
# "SDK location not found". Setting ANDROID_HOME covers that even if
# local.properties is missing/stale.
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  $DefaultSdkPath = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $DefaultSdkPath) {
    $env:ANDROID_HOME = $DefaultSdkPath
    Write-Host "ANDROID_HOME set to: $DefaultSdkPath"
  } else {
    Write-Warning "Android SDK not found at '$DefaultSdkPath' and ANDROID_HOME/ANDROID_SDK_ROOT are unset -- the build will likely fail with 'SDK location not found'. Set ANDROID_HOME or create android/local.properties with sdk.dir=<path>."
  }
}

# --- 1c. Force every native module onto the long-path-safe CMake (see CLAUDE.md) ---
# The :app module's CMake version is pinned directly in android/app/build.gradle,
# and android/build.gradle's `plugins.withId("com.android.library")` hook covers most
# other modules -- but some (react-native-worklets, react-native-reanimated) set their
# own `version = System.getenv("CMAKE_VERSION") ?: "3.22.1"` INSIDE their own
# android{} block, which wins over the root hook. Without this env var they silently
# stay on CMake 3.22.1 / Ninja 1.10, which fails on Windows long paths deep into the
# build ("ninja: error: manifest 'build.ninja' still dirty after 100 tries").
$env:CMAKE_VERSION = "4.1.2"
Write-Host "CMAKE_VERSION set to: $($env:CMAKE_VERSION)"

# --- 2. Confirm adb sees a target device ---
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  throw "adb not found at $adb -- check your Android SDK install location."
} else {
  Write-Host "Using adb at: $adb"
}

$devicesOutput = & $adb devices | Select-String -Pattern "\tdevice$"
if (-not $devicesOutput) {
  throw "No device/emulator detected by adb. Start an emulator or plug in / authorize a physical device, then retry."
}
Write-Host "adb sees:"
$devicesOutput | ForEach-Object { Write-Host "  $_" }

if ($Device) {
  $env:ANDROID_SERIAL = $Device
  Write-Host "Targeting device: $Device"
} elseif (@($devicesOutput).Count -gt 1) {
  Write-Warning "Multiple devices connected and -Device not specified -- expo run:android will prompt or may pick the wrong one. Pass -Device <serial> to be explicit."
}

# --- 3. Build + install ---
Push-Location $MobileDir
try {
  Write-Host "Running: npx expo run:android --variant $Variant --port $MetroPort"
  npx expo run:android --variant $Variant --port $MetroPort
  if ($LASTEXITCODE -ne 0) {
    throw "expo run:android exited with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

# --- 4. Debug builds need Metro + a port-forward to a physical device ---
$targetSerial = $Device
if (-not $targetSerial) {
  $firstLine = @($devicesOutput)[0].ToString()
  $targetSerial = ($firstLine -split "\t")[0]
}
$isEmulator = $targetSerial -like "emulator-*"

if ($Variant -eq "debug" -and -not $isEmulator) {
  Write-Host "Physical device + debug build detected -- setting up adb reverse tcp:$MetroPort so the app can reach Metro."
  & $adb -s $targetSerial reverse "tcp:$MetroPort" "tcp:$MetroPort"
  Write-Host "If Metro isn't already running, start it separately with: npx expo start --dev-client --port $MetroPort (from artifacts\mobile)"
  Write-Host "Note: adb reverse forwards drop whenever adb reconnects to the device (e.g. after unplugging/replugging USB) -- rerun this script or just the 'adb reverse tcp:$MetroPort tcp:$MetroPort' command if the app gets stuck on the loading screen."
}

Write-Host "Done."
