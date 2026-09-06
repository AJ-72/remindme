<#
.SYNOPSIS
  Run a Maestro flow that types Malayalam text, working around Maestro's
  inputText being ASCII-only on Android (see CLAUDE.md's Testing > End-to-end
  tests (Maestro) section for the full explanation).

.DESCRIPTION
  Maestro's inputText drives `adb shell input text`, which cannot carry
  non-ASCII characters -- it throws on the device rather than typing anything.
  There is no raw shell/exec step inside the Maestro YAML DSL, so the
  workaround has to sit outside Maestro entirely, sequencing three pieces:

    1. malayalam_flow_a_focus.yaml (pure Maestro) -- launches the app and
       taps the target field into focus. Nothing Unicode-dependent.
    2. This script -- switches the device's active IME to ADBKeyboard
       (github.com/senzhk/ADBKeyBoard), broadcasts the Malayalam text into
       the now-focused field via an intent (bypassing keystroke synthesis
       entirely, which is what makes Unicode possible), then switches the
       IME back to whatever it was before.
    3. malayalam_flow_b_verify.yaml (pure Maestro) -- continues from wherever
       the field's cursor/state landed: taps Save, asserts on the Malayalam
       text and the time it should have parsed to.

  Requires ADBKeyboard already installed on the target device -- this script
  does not install it. Get the APK from
  https://github.com/senzhk/ADBKeyBoard/releases and `adb install` it once
  per device/emulator; it is a tiny IME with no UI of its own.

  Leaves the device's keyboard in whatever state it was in before running,
  even if a step fails partway through (best-effort restore in a `finally`).

.PARAMETER Text
  The Malayalam (or any Unicode) string to type. Defaults to the example
  phrase malayalam_flow_b_verify.yaml expects to see on screen afterward --
  pass a different -Text only if you also update that flow's assertions.

.PARAMETER Device
  Optional adb serial (from `adb devices`) to target when more than one
  device/emulator is connected. Required if more than one is connected.

.EXAMPLE
  .\run-malayalam-maestro-flow.ps1
.EXAMPLE
  .\run-malayalam-maestro-flow.ps1 -Device b81a371a -Text "നാളെ രാവിലെ പത്ത് മണിക്ക്"
#>

param(
  [string]$Text = "ആധാരം എഴുത്ത് ഇന്ന് 11.30",
  [string]$Device
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$MaestroDir = Join-Path $RepoRoot "Maestro"
$FlowA = Join-Path $MaestroDir "malayalam_flow_a_focus.yaml"
$FlowB = Join-Path $MaestroDir "malayalam_flow_b_verify.yaml"
$AdbKeyboardId = "com.android.adbkeyboard/.AdbIME"

foreach ($f in @($FlowA, $FlowB)) {
  if (-not (Test-Path $f)) { throw "Flow file not found: $f" }
}

# --- Resolve adb + target device ---
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Warning "adb not found at $adb -- falling back to 'adb' on PATH."
  $adb = "adb"
}

$adbArgs = @()
if ($Device) {
  $adbArgs = @("-s", $Device)
} else {
  $devicesOutput = & $adb devices | Select-String -Pattern "\tdevice$"
  if (-not $devicesOutput) {
    throw "No device/emulator detected by adb. Start an emulator or plug in / authorize a physical device, then retry."
  }
  if (@($devicesOutput).Count -gt 1) {
    throw "Multiple devices connected -- pass -Device <serial> to pick one (see 'adb devices')."
  }
  $Device = (($devicesOutput | Select-Object -First 1).ToString() -split "\t")[0]
  $adbArgs = @("-s", $Device)
}
Write-Host "Targeting device: $Device"

# Some devices/ROMs write spurious extra lines to stderr on `adb shell`
# commands (e.g. a SecurityException from `pm list packages`) alongside a
# correct result on stdout. Under $ErrorActionPreference = "Stop" that
# non-terminating stderr line would otherwise abort the script even though
# the real answer came through -- so every `adb shell` call below is routed
# through this helper, which discards stderr and returns stdout only.
function Invoke-AdbShell {
  param([Parameter(ValueFromRemainingArguments)] [string[]]$ShellArgs)
  # A bare 2>$null redirect does not stop PS 5.1 from treating a native
  # exe's stderr line as a terminating NativeCommandError under
  # $ErrorActionPreference = "Stop" -- wrap in try/catch so a device that
  # writes a harmless extra stderr line (seen from `pm list packages` on
  # some ROMs) can't abort the whole script. Reset $global:LASTEXITCODE
  # afterward so a caller's own exit-code check further down isn't tripped
  # by this call's leftover code.
  $result = try {
    & $adb @adbArgs shell @ShellArgs 2>$null
  } catch {
    $null
  }
  $global:LASTEXITCODE = 0
  return $result
}

# --- Confirm ADBKeyboard is installed before touching anything ---
$adbKeyboardInstalled = Invoke-AdbShell pm list packages com.android.adbkeyboard
if (-not ($adbKeyboardInstalled -match "com\.android\.adbkeyboard")) {
  throw "ADBKeyboard is not installed on $Device. Install it once from https://github.com/senzhk/ADBKeyBoard/releases (adb install ADBKeyboard.apk), then retry."
}

# --- Remember the current IME so it can be restored afterward ---
$originalIme = (Invoke-AdbShell settings get secure default_input_method) -join ""
$originalIme = $originalIme.Trim()
Write-Host "Current IME: $originalIme"

function Restore-Ime {
  if ($originalIme -and $originalIme -ne "null") {
    Write-Host "Restoring IME to: $originalIme"
    Invoke-AdbShell ime set $originalIme | Out-Null
  }
  Invoke-AdbShell ime disable $AdbKeyboardId | Out-Null
}

try {
  # --- 1. Pure-Maestro flow: launch + focus the field ---
  Write-Host "`n--- Flow A: focus field ---"
  maestro test --udid=$Device $FlowA
  if ($LASTEXITCODE -ne 0) { throw "Flow A failed (exit $LASTEXITCODE)." }

  # --- 2. Switch to ADBKeyboard and broadcast the Unicode text ---
  Write-Host "`n--- Switching to ADBKeyboard ---"
  Invoke-AdbShell ime enable $AdbKeyboardId | Out-Null
  Invoke-AdbShell ime set $AdbKeyboardId | Out-Null

  # The nested single-quotes inside the double-quoted -es value matter:
  # `adb shell` rejoins its argument list with spaces before the device's own
  # shell re-parses the string, so an unquoted multi-word value gets split on
  # whitespace and only the first word reaches the broadcast (hit directly in
  # a prior session -- the rest leaked into the next arg and got dropped).
  $quotedText = "'$Text'"
  Write-Host "Broadcasting text: $Text"
  Invoke-AdbShell am broadcast -a ADB_INPUT_TEXT --es msg $quotedText | Out-Null

  # --- 3. Pure-Maestro flow: continue from the now-filled field ---
  Write-Host "`n--- Flow B: save + verify ---"
  maestro test --udid=$Device $FlowB
  if ($LASTEXITCODE -ne 0) { throw "Flow B failed (exit $LASTEXITCODE)." }

  Write-Host "`nDone."
} finally {
  Restore-Ime
}
