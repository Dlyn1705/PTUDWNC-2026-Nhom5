param(
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][string]$EnvironmentFile,
    [string]$TaskName = 'Culinary-Backup-03UTC'
)
$ErrorActionPreference = 'Stop'
# Explicit UTC StartBoundary keeps the daily task at 03:00 UTC across timezone/DST changes.
$utcNext = [DateTime]::UtcNow.Date.AddHours(3)
if ($utcNext -le [DateTime]::UtcNow) { $utcNext = $utcNext.AddDays(1) }
$localAt = [TimeZoneInfo]::ConvertTimeFromUtc($utcNext, [TimeZoneInfo]::Local)
$script = Join-Path $PSScriptRoot 'Backup-Stack.ps1'
$environment = (Resolve-Path $EnvironmentFile).Path
if ($Project -notmatch '^culinary-[a-z0-9-]+$' -or $environment.Contains('"')) { throw 'Invalid task arguments' }
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -File `"$script`" -Project $Project -EnvironmentFile `"$environment`""
$trigger = New-ScheduledTaskTrigger -Daily -At $localAt
$trigger.StartBoundary = $utcNext.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Daily encrypted PostgreSQL + MinIO backup at 03:00 UTC; run under an operations account with Docker access.'
