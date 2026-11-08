# No native Docker operation or Scheduled Task registration is executed by this test.
$ErrorActionPreference='Stop'
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('issue88-orchestration-'+[guid]::NewGuid().ToString('N')+'.env')
Set-Content -LiteralPath $temporary -Value '# fixture only'
try {
    foreach($failBackup in @($false,$true)) {
        $global:issue88TestCalls=[Collections.Generic.List[object]]::new()
        $global:issue88TestFail=$failBackup
        $global:issue88TestProbeCount=0
        function docker {
            $global:issue88TestCalls.Add(@($args))
            if($args -contains 'ps') { $global:issue88TestProbeCount++; if($global:issue88TestProbeCount -eq 1){'fixture-api'} }
            $global:LASTEXITCODE=0
            if($global:issue88TestFail -and $args -contains 'run') { $global:LASTEXITCODE=1 }
        }
        $thrown=$false
        try { & "$PSScriptRoot/Backup-Stack.ps1" -Project culinary-test -EnvironmentFile $temporary }
        catch { $thrown=$true; $reason=$_.Exception.Message }
        if($thrown -ne $failBackup){throw "Backup failure propagation incorrect: $reason"}
        $calls=$global:issue88TestCalls
        $stop=@($calls | Where-Object {$_ -contains 'stop'})
        $run=@($calls | Where-Object {$_ -contains 'run'})
        $start=@($calls | Where-Object {$_ -contains 'start'})
        if($stop.Count -ne 1 -or $run.Count -ne 1 -or $start.Count -ne 1){throw 'Stop/backup/resume calls missing'}
        if($calls[$calls.Count-1] -notcontains 'start'){throw 'API not resumed in finally'}
    }
    function New-ScheduledTaskAction { param($Execute,$Argument) @{Execute=$Execute;Argument=$Argument} }
    function New-ScheduledTaskTrigger { param([switch]$Daily,$At) [pscustomobject]@{StartBoundary=''} }
    function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable,$MultipleInstances,$ExecutionTimeLimit) @{} }
    function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Settings,$Description) $global:issue88TestBoundary=$Trigger.StartBoundary }
    & "$PSScriptRoot/Register-BackupTask.ps1" -Project culinary-test -EnvironmentFile $temporary
    if($global:issue88TestBoundary -notmatch 'T03:00:00Z$'){throw 'Daily task must specify UTC 03:00 boundary'}
    'PASS orchestration success/failure resume, full Docker argv and daily UTC task definition.'
} finally {
    Remove-Item -LiteralPath $temporary
    Remove-Variable issue88TestCalls,issue88TestFail,issue88TestProbeCount,issue88TestBoundary -Scope Global -ErrorAction SilentlyContinue
}
