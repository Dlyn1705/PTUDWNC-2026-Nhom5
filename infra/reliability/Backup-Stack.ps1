param(
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][string]$EnvironmentFile,
    [string]$Repository = (Resolve-Path "$PSScriptRoot/../..").Path
)
$ErrorActionPreference = 'Stop'
if ($Project -notmatch '^culinary-[a-z0-9-]+$') { throw 'Explicit culinary project name required' }
$composeArgs = @('compose','--project-name',$Project,'--env-file',(Resolve-Path $EnvironmentFile).Path,
    '-f',(Join-Path $Repository 'docker-compose.yml'),'-f',(Join-Path $Repository 'compose.reliability.yml'))
function Invoke-Compose([string[]]$Arguments) {
    & docker @composeArgs @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Compose operation failed' }
}
# Stopping the API also drains/stops its in-process Hangfire workers. No external
# writers may use this database/bucket during the snapshot (documented prerequisite).
$original = @(& docker @composeArgs ps --status running -q api)
if ($LASTEXITCODE -ne 0 -or $original.Count -eq 0) { throw 'Expected running source API; refusing ambiguous backup target' }
try {
    Invoke-Compose -Arguments @('stop','-t','60','api')
    $running = @(& docker @composeArgs ps --status running -q api)
    if ($LASTEXITCODE -ne 0 -or $running.Count -ne 0) { throw 'API must be stopped before snapshot' }
    Invoke-Compose -Arguments @('--profile','ops','run','--rm','-e','BACKUP_QUIESCED=1','backup','backup')
} finally {
    # Restore service even on dump, disk, upload or encryption failure.
    Invoke-Compose -Arguments @('start','api')
}
