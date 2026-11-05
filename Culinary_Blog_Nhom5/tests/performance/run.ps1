param(
    [ValidateSet('prepare','start','smoke','warm','cold','mixed','stress','soak','login','browser','snapshot','stop')]
    [string]$Mode = 'smoke',
    [ValidateRange(100,50000)][int]$Recipes = 5000,
    [ValidateRange(1,10)][int]$Repeat = 1,
    [ValidateSet('single','dual')][string]$Topology = 'dual'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $root
$resultRoot = Join-Path $root 'build/issue85'
New-Item -ItemType Directory -Force $resultRoot | Out-Null
$envFile = Join-Path $root 'build/issue85.env'
if (!(Test-Path $envFile)) {
    $password = 'Perf85!' + [guid]::NewGuid().ToString('N')
    $jwt = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    @("PERF_PASSWORD=$password", "PERF_JWT_KEY=$jwt", 'PERF_CAPACITY=true') | Set-Content $envFile
}
$settings = Get-Content $envFile | ConvertFrom-StringData
$env:PERF_PASSWORD = $settings.PERF_PASSWORD
$env:PERF_DB = "Host=localhost;Port=55485;Database=issue85_perf;Username=perf;Password=$env:PERF_PASSWORD"
$env:PERF_OUTPUT = $resultRoot
if ($Mode -ne 'prepare' -and (Test-Path (Join-Path $resultRoot 'fixtures.json'))) {
    $Recipes = (Get-Content (Join-Path $resultRoot 'fixtures.json') -Raw | ConvertFrom-Json).count
}
$env:PERF_RECIPES = "$Recipes"
$composeFiles = @('-f', 'compose.performance.yml')
if ($Topology -eq 'single') { $composeFiles += @('-f', 'compose.performance.single.yml') }
function Compose {
    & docker compose -p issue85 --env-file $envFile @composeFiles @args
    if ($LASTEXITCODE -ne 0) { throw "Compose failed: $($args[0])" }
}
function Tool([string]$Operation) {
    & dotnet run --project Culinary_Blog_Nhom5/tests/performance/tool -c Release -- $Operation
    if ($LASTEXITCODE -ne 0) { throw "Performance tool failed: $Operation" }
}
function Metrics([string]$Path) {
    (Invoke-WebRequest 'http://localhost:9465/metrics').Content | Set-Content $Path
}
function Ready {
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    do {
        try {
            $a = Invoke-WebRequest 'http://localhost:5085/health/ready' -TimeoutSec 3
            $b = if ($Topology -eq 'dual') { Invoke-WebRequest 'http://localhost:5086/health/ready' -TimeoutSec 3 } else { $a }
            if ($a.StatusCode -eq 200 -and $b.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Both API instances must be ready'
}
if ($Mode -eq 'stop') { Compose down; return } # Preserves volumes/evidence.
if ($Mode -in @('prepare','start')) {
    if ($Mode -eq 'prepare') {
        Compose up -d postgres redis minio collector
        Tool seed
        Tool plans
        Compose build api-a frontend
    }
    if ($Topology -eq 'single') { Compose stop api-b; Compose up -d --no-build api-a frontend gateway }
    else { Compose up -d --no-build api-a api-b frontend gateway }
    Ready
    return
}
if ($Mode -eq 'browser') {
    Push-Location Culinary_Blog_Nhom5/tests/performance
    try {
        & npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' }
        & npx playwright install chromium; if ($LASTEXITCODE) { throw 'Browser install failed' }
        & npm run browser; $browserExit = $LASTEXITCODE
        & npm run lighthouse; $lhExit = $LASTEXITCODE
        if ($browserExit -ne 0 -or $lhExit -ne 0) { throw 'Frontend performance budget failed; inspect artifacts' }
    } finally { Pop-Location }
    return
}
Ready
if ($Mode -ne 'snapshot') { Tool verify }
for ($i = 1; $i -le $Repeat; $i++) {
    if ($Mode -ne 'snapshot') { Compose restart collector | Out-Null; Start-Sleep 3 }
    $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + "-$Mode-$i"
    $run = Join-Path $resultRoot $runId
    New-Item -ItemType Directory $run | Out-Null
    Copy-Item (Join-Path $resultRoot 'fixtures.json') $run
    if (Test-Path (Join-Path $resultRoot 'fixture-verification.json')) { Copy-Item (Join-Path $resultRoot 'fixture-verification.json') $run }
    $manifest = @{
        runId = $runId; commit = (& git rev-parse HEAD); diff = (& git diff --stat | Out-String)
        topology = $Topology; mode = $Mode; capacityMode = $settings.PERF_CAPACITY; recipes = $Recipes
        os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
        machineCpus = [Environment]::ProcessorCount
        dockerMemoryBytes = (& docker info --format '{{.MemTotal}}'); dockerCpus = (& docker info --format '{{.NCPU}}')
        dotnetVersion = (& dotnet --version); nodeVersion = (& node --version); startedUtc = [DateTime]::UtcNow.ToString('O')
        limits = 'Serving containers total 2 CPU/4 GiB; collector and generator excluded; shared host overhead recorded separately'
        quotaCaveat = 'Capacity mode bypasses process-local quotas only in Performance environment; not a production quota result'
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $run 'manifest.json')
    $budgetIds = & docker compose -p issue85 --env-file $envFile @composeFiles ps -q
    & docker inspect --format '{"name":{{json .Name}},"cpuNanos":{{.HostConfig.NanoCpus}},"memoryBytes":{{.HostConfig.Memory}},"image":{{json .Image}}}' @budgetIds | Set-Content (Join-Path $run 'resource-limits.jsonl')
    Copy-Item Culinary_Blog_Nhom5/tests/performance/scenarios.js $run
    Compose images --format json | Set-Content (Join-Path $run 'images.json')
    Get-FileHash Culinary_Blog_Nhom5/tests/performance/scenarios.js | Select-Object Algorithm,Hash | ConvertTo-Json | Set-Content (Join-Path $run 'scenario-hash.json')
    Compose ps --format json | Set-Content (Join-Path $run 'containers.json')
    Compose exec -T redis redis-cli INFO stats | Set-Content (Join-Path $run 'redis-before.txt')
    if ($Mode -eq 'snapshot') { Metrics (Join-Path $run 'metrics.txt'); continue }
    if ($Mode -eq 'cold') {
        # Only project-owned Redis, never the development/production cache.
        Compose exec -T redis redis-cli FLUSHDB | Out-Null
    }
    $runMount = $run.Replace('\','/')
    $containerIds = & docker compose -p issue85 --env-file $envFile @composeFiles ps -q
    $monitorArgs = @('Culinary_Blog_Nhom5/tests/performance/monitor.mjs', ('"' + $run + '"')) + $containerIds
    $startOptions = @{ FilePath = 'node'; ArgumentList = $monitorArgs; PassThru = $true; WorkingDirectory = $root }
    if ($IsWindows) { $startOptions.WindowStyle = 'Hidden' }
    $monitor = Start-Process @startOptions
    $exit = 0
    try {
    & docker compose -p issue85 --env-file $envFile @composeFiles run --rm --no-deps `
        -v "${runMount}:/results" k6 run --quiet -e "MODE=$Mode" -e "RUN_ID=$runId" /scripts/scenarios.js 2>&1 |
        ForEach-Object {
            $line = "$_"; $line | Add-Content (Join-Path $run 'k6.log')
            if ($line.Contains('ISSUE85_MEASUREMENT_START')) { Write-Output 'Warm-up complete; measuring workload.'; Metrics (Join-Path $run 'metrics-before.txt') }
        }
    $exit = $LASTEXITCODE
    } finally {
        New-Item -ItemType File (Join-Path $run 'monitor.stop') -Force | Out-Null
        if (!$monitor.WaitForExit(15000)) { Stop-Process -Id $monitor.Id }
    }
    Start-Sleep 3
    Metrics (Join-Path $run 'metrics-after.txt')
    Compose exec -T redis redis-cli INFO stats | Set-Content (Join-Path $run 'redis-after.txt')
    $containerIds = & docker compose -p issue85 --env-file $envFile @composeFiles ps -q
    & docker stats --no-stream --format '{{json .}}' @containerIds | Set-Content (Join-Path $run 'resources-final.jsonl')
    & node Culinary_Blog_Nhom5/tests/performance/summarize.mjs $run
    $summaryExit = $LASTEXITCODE
    if ($exit -ne 0 -or $summaryExit -ne 0) { throw "Performance run failed: $runId; artifacts preserved" }
}
