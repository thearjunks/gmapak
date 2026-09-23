$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$dashboardUrl = 'http://127.0.0.1:4387'
try { $health = Invoke-RestMethod "$dashboardUrl/health" -TimeoutSec 2 } catch { $health = $null }
if ($health -and $health.app -ne 'stc-branch-dashboard') { throw 'Port 4387 belongs to another application.' }
if (-not $health) {
    if (Get-NetTCPConnection -LocalPort 4387 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 4387 is occupied by another listener.' }
    $nodeExecutable = (Get-Command node.exe).Source
    Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + (Join-Path $appDirectory 'server.mjs') + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appDirectory 'server.log') -RedirectStandardError (Join-Path $appDirectory 'server-error.log')
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 300
        try { $health = Invoke-RestMethod "$dashboardUrl/health" -TimeoutSec 2; if ($health.app -eq 'stc-branch-dashboard') { break } } catch {}
    }
    if ($health.app -ne 'stc-branch-dashboard') { throw 'Dashboard did not become ready. Check server-error.log.' }
}
Start-Process $dashboardUrl
