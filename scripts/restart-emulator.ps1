# A clean slate for the Android emulator, in one command: npm run dev:restart
#
# Every piece of this exists because that piece has gone wrong at least once:
#
#   - Metro wedges. It keeps answering /status long after it has stopped being
#     able to build a bundle, so "is the port open" is not a health check.
#   - The adb daemon dies and takes every device with it, which looks exactly
#     like the emulator having crashed.
#   - The emulator display sleeps on its own timeout. adb input does not count
#     as user activity, so an app launched behind it looks like a blank app.
#
# Optional: -Clear also drops Metro's cache, -Wipe also erases app data.

param(
  [switch]$Clear,
  [switch]$Wipe,
  [string]$Avd = 'medium_phone',
  [string]$Package = 'com.stephen.groove'
)

$ErrorActionPreference = 'Continue'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$sdk\platform-tools\adb.exe"
$emulator = "$sdk\emulator\emulator.exe"

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }

Step 'Stopping Metro and any stray expo processes'
$onPort = (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1).OwningProcess
if ($onPort) { Stop-Process -Id $onPort -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'expo|metro' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Step 'Stopping the emulator and the adb daemon'
Get-Process -Name 'emulator*', 'qemu*' -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
& $adb kill-server 2>&1 | Out-Null
Get-Process -Name 'adb' -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Step "Booting $Avd"
Start-Process -FilePath $emulator -ArgumentList '-avd', $Avd, '-no-boot-anim' -WorkingDirectory "$sdk\emulator"
& $adb start-server 2>&1 | Out-Null
& $adb wait-for-device

$deadline = (Get-Date).AddMinutes(5)
do {
  Start-Sleep -Seconds 4
  $booted = (& $adb shell getprop sys.boot_completed) -replace '\s', ''
} until ($booted -eq '1' -or (Get-Date) -gt $deadline)

if ($booted -ne '1') { Write-Host 'Emulator did not finish booting.' -ForegroundColor Red; exit 1 }

Step 'Keeping the display awake'
# An emulator always reports as charging, so 7 (AC|USB|wireless) pins it on.
& $adb shell settings put global stay_on_while_plugged_in 7
& $adb shell settings put system screen_off_timeout 86400000
& $adb shell input keyevent KEYCODE_WAKEUP

Step 'Forwarding 8081 so the dev client reaches Metro over USB rather than the LAN'
& $adb reverse tcp:8081 tcp:8081

if ($Wipe) {
  Step 'Erasing app data'
  & $adb shell pm clear $Package
}

Step 'Building, installing and launching'
$env:ANDROID_HOME = $sdk
$env:Path = "$env:Path;$sdk\platform-tools"
if ($Clear) { $env:EXPO_RESET_CACHE = '1' }
npm run android

Step 'Done'
