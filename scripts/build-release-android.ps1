# Builds a standalone release APK (JS bundled in, no Metro needed) for ONE
# connected device and installs it in place.
#
# Only the device's own CPU ABI is compiled: the default is all four
# (arm64-v8a, armeabi-v7a, x86, x86_64), which roughly quadruples native build
# time for ABIs the phone never uses.
#
# Signed with the local debug keystore (android/app/build.gradle's release
# signingConfig), so it updates a locally-built debug install without losing
# data. It will NOT replace an EAS/Play-signed install - this script refuses
# rather than uninstall (uninstalling wipes every reminder; see
# system_learnings.md 2026-08-24, trap 3).
#
# Usage: .\scripts\build-release-android.ps1 [-Device <serial>]
param([string]$Device)

# Not 'Stop': under Windows PowerShell 5.1 that turns any stderr line from a
# native tool (Gradle prints warnings there) into a fatal error. Every native
# call below is checked by exit code instead.
$ErrorActionPreference = 'Continue'
$env:NODE_ENV = 'production'
$pkg = 'com.curios.remindme'
$mobile = Join-Path $PSScriptRoot '..\artifacts\mobile' | Resolve-Path

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# --- toolchain (see CLAUDE.md "Local Android builds on Windows") -------------
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path "$env:ANDROID_HOME\platform-tools")) { Fail "Android SDK not found at $env:ANDROID_HOME" }
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { Fail "Android Studio JBR not found at $env:JAVA_HOME" }
$env:CMAKE_VERSION = '4.1.2'
if (-not (Test-Path "$mobile\android")) { Fail "artifacts/mobile/android missing - run 'npx expo prebuild --platform android' first" }

# --- device ------------------------------------------------------------------
$devices = @(adb devices | Select-String '^(\S+)\s+device$' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if (-not $Device) {
  if ($devices.Count -ne 1) { Fail "Expected exactly one authorized device, found $($devices.Count). Pass -Device <serial>." }
  $Device = $devices[0]
} elseif ($devices -notcontains $Device) { Fail "Device $Device is not connected/authorized (adb devices)." }

$abi = (adb -s $Device shell getprop ro.product.cpu.abi).Trim()
if (-not $abi) { Fail "Could not read CPU ABI from $Device" }
Write-Host "Device $Device, ABI $abi"

# --- refuse to clobber a store-signed install -----------------------------------
# Compare signing certs, not the DEBUGGABLE flag: this script's own output is a
# non-debuggable release build signed with the local key, and must be updatable.
$installedPath = (adb -s $Device shell pm path $pkg) -replace '^package:', '' | Select-Object -First 1
if ($installedPath) {
  $apksigner = Get-ChildItem "$env:ANDROID_HOME\build-tools\*\apksigner.bat" | Sort-Object FullName | Select-Object -Last 1
  if (-not $apksigner) { Fail "apksigner not found under $env:ANDROID_HOME\build-tools" }
  $pulled = Join-Path $env:TEMP 'remindme-installed.apk'
  adb -s $Device pull $installedPath.Trim() $pulled | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Could not pull the installed APK to compare signatures." }
  $installedCert = (& $apksigner.FullName verify --print-certs $pulled | Select-String 'certificate SHA-256 digest: (\w+)' | Select-Object -First 1).Matches.Groups[1].Value
  $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
  $localCert = ((& $keytool -list -v -keystore "$mobile\android\app\debug.keystore" -storepass android | Select-String 'SHA256: (.+)$').Matches.Groups[1].Value -replace ':', '').ToLower()
  if (-not $installedCert -or -not $localCert) { Fail "Could not read signing certificates to compare." }
  if ($installedCert.ToLower() -ne $localCert) {
    Fail "$pkg on $Device is signed with a different key (EAS/Play?); installing would need an uninstall that erases all data. Back up and uninstall manually if that is really intended."
  }
  Write-Host "Installed build is signed with the local key - in-place update is safe."
}

# --- build ---------------------------------------------------------------------
Push-Location "$mobile\android"
try {
  .\gradlew.bat app:assembleRelease -x lint -x test "-PreactNativeArchitectures=$abi"
  if ($LASTEXITCODE -ne 0) { Fail "Gradle assembleRelease failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }

$apk = "$mobile\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { Fail "APK not found at $apk" }

# --- install & launch ------------------------------------------------------------
adb -s $Device install -r $apk
if ($LASTEXITCODE -ne 0) { Fail "adb install failed - see output above (signature mismatch means a differently-signed install is present)." }
adb -s $Device shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Installed and launched release build on $Device ($abi): $apk" -ForegroundColor Green
