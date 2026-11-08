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
    docker compose -p $project -f $compose up -d --wait --wait-timeout 120 @services
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated PostgreSQL' }
    $binding = docker compose -p $project -f $compose port postgres 5432
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '127\.0\.0\.1:(\d+)') { throw 'Cannot resolve PostgreSQL port' }
    $env:CRITICAL_TEST_CONNECTION = "Host=127.0.0.1;Port=$($Matches[1]);Database=postgres;Username=postgres;Password=$env:ISSUE84_PASSWORD"
    if ($Browser) {
        $binding = docker compose -p $project -f $compose port minio 9000
        if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:\d+$') { throw 'Cannot resolve MinIO port' }
        $env:CRITICAL_TEST_MINIO_ENDPOINT = $binding
        $env:CRITICAL_TEST_MINIO_USER = 'issue84local'
        $env:CRITICAL_TEST_MINIO_PASSWORD = $env:ISSUE84_PASSWORD
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
