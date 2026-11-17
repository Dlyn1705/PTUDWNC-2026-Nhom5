[CmdletBinding()]
param([switch]$Browser)
$ErrorActionPreference = 'Stop'
$project = 'culinary-critical-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$compose = Join-Path $PSScriptRoot 'compose.integration.yml'
$oldPassword = $env:ISSUE84_PASSWORD
$oldConnection = $env:CRITICAL_TEST_CONNECTION
$oldMinio = $env:CRITICAL_TEST_MINIO_ENDPOINT
$oldMinioUser = $env:CRITICAL_TEST_MINIO_USER
$oldMinioPassword = $env:CRITICAL_TEST_MINIO_PASSWORD
try {
    $env:ISSUE84_PASSWORD = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $services = @('postgres')
    if ($Browser) { $services += 'minio' }
    $composeUpHelp = (docker compose up --help 2>&1) -join "`n"
    $composeUpArguments = @('compose', '-p', $project, '-f', $compose, 'up', '-d', '--wait')
    if ($composeUpHelp -match '(?m)^\s+--wait-timeout\b') {
        $composeUpArguments += @('--wait-timeout', '120')
    }
    $composeUpArguments += $services
    docker @composeUpArguments
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated PostgreSQL' }
    $postgresId = docker compose -p $project -f $compose ps -q postgres
    $postgresPasswordEntry = docker inspect $postgresId --format '{{range .Config.Env}}{{println .}}{{end}}' |
        Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1
    if (-not $postgresPasswordEntry) { throw 'Cannot resolve disposable PostgreSQL credentials' }
    $postgresPassword = $postgresPasswordEntry.Substring('POSTGRES_PASSWORD='.Length)
    $binding = docker compose -p $project -f $compose port postgres 5432
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '127\.0\.0\.1:(\d+)') { throw 'Cannot resolve PostgreSQL port' }
    $env:CRITICAL_TEST_CONNECTION = "Host=127.0.0.1;Port=$($Matches[1]);Database=postgres;Username=postgres;Password=$postgresPassword"
    if ($Browser) {
        $binding = docker compose -p $project -f $compose port minio 9000
        if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:\d+$') { throw 'Cannot resolve MinIO port' }
        $env:CRITICAL_TEST_MINIO_ENDPOINT = $binding
        $env:CRITICAL_TEST_MINIO_USER = 'issue84local'
        $minioId = docker compose -p $project -f $compose ps -q minio
        $minioPasswordEntry = docker inspect $minioId --format '{{range .Config.Env}}{{println .}}{{end}}' |
            Where-Object { $_ -like 'MINIO_ROOT_PASSWORD=*' } | Select-Object -First 1
        if (-not $minioPasswordEntry) { throw 'Cannot resolve disposable MinIO credentials' }
        $env:CRITICAL_TEST_MINIO_PASSWORD = $minioPasswordEntry.Substring('MINIO_ROOT_PASSWORD='.Length)
    }
    Push-Location (Join-Path $PSScriptRoot '../culinary-blog-web')
    try {
        $arguments = @('tests/critical-api.e2e.mjs')
        if ($Browser) { $arguments += '--browser' }
        node @arguments
        if ($LASTEXITCODE -ne 0) { throw 'Critical E2E failed' }
    }
    finally { Pop-Location }
} finally {
    docker compose -p $project -f $compose down --volumes --remove-orphans
    $env:ISSUE84_PASSWORD = $oldPassword
    $env:CRITICAL_TEST_CONNECTION = $oldConnection
    $env:CRITICAL_TEST_MINIO_ENDPOINT = $oldMinio
    $env:CRITICAL_TEST_MINIO_USER = $oldMinioUser
    $env:CRITICAL_TEST_MINIO_PASSWORD = $oldMinioPassword
}
