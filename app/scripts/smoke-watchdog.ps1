# smoke-watchdog.ps1 — D1 v4: out-of-process reaper for the smoke run.
# The app can hang on process.exit() in some session contexts (AtLogOn observed
# 2026-11-18: results written, 5 electron processes alive 7+ min, main thread
# Wait/UserRequest; bootstrap()/Tray suspected). finish() fixes are exhausted.
# The watchdog guarantees unattended termination and propagates an honest exit
# code derived from results.json. It NEVER touches check logic — no fake green.
# Task action: cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File <this> > C:\Deploy\smoke-watchdog.log 2>&1
$ErrorActionPreference = 'Continue'
$app = 'C:\Deploy\Rightshell\app'
$results = Join-Path $app '.smoke\results.json'
$log = 'C:\Deploy\smoke-log.txt'
Set-Location $app
if (Test-Path $results) { Remove-Item $results -Force }
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npm run smoke > `"$log`" 2>&1" -PassThru -WindowStyle Hidden
Write-Output "[watchdog] smoke child pid=$($p.Id) started"

# app's own timeout guard is 90s; allow margin for startup + write
$deadline = (Get-Date).AddSeconds(150)
while (-not (Test-Path $results) -and (Get-Date) -lt $deadline -and -not $p.HasExited) {
    Start-Sleep -Milliseconds 500
}
if (-not (Test-Path $results)) {
    Write-Output "[watchdog] no results.json after 150s (childExited=$($p.HasExited)) - kill tree, exit 2"
    if (-not $p.HasExited) { taskkill /F /T /PID $p.Id 2>&1 | Out-Null }
    exit 2
}
Write-Output "[watchdog] results.json written at +$([int]$sw.Elapsed.TotalSeconds)s; grace 15s for self-exit"
$grace = (Get-Date).AddSeconds(15)
while (-not $p.HasExited -and (Get-Date) -lt $grace) { Start-Sleep -Milliseconds 500 }
if ($p.HasExited) {
    Write-Output "[watchdog] child SELF-EXITED at +$([int]$sw.Elapsed.TotalSeconds)s (native exit=$($p.ExitCode))"
}
else {
    Write-Output "[watchdog] child alive after grace - FORCE-KILL tree at +$([int]$sw.Elapsed.TotalSeconds)s (D1 hang evidence)"
    taskkill /F /T /PID $p.Id 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# honest exit code, aligned with smoke.js finish() semantics
$logText = Get-Content $log -Raw -ErrorAction SilentlyContinue
if ($logText -match '\[smoke\] (TIMEOUT|ERROR)') {
    Write-Output '[watchdog] smoke log shows TIMEOUT/ERROR - exit 2'
    exit 2
}
try {
    $arr = Get-Content $results -Raw | ConvertFrom-Json
    $failed = @($arr | Where-Object { -not $_.ok }).Count
    $total = @($arr).Count
    Write-Output "[watchdog] checks: $($total - $failed)/$total passed; exit $(if ($failed) { 1 } else { 0 })"
    if ($failed) { exit 1 } else { exit 0 }
}
catch {
    Write-Output "[watchdog] results.json unreadable: $_ - exit 2"
    exit 2
}