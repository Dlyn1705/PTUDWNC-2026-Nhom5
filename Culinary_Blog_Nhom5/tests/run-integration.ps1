[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$project = 'culinary-issue84-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$compose = Join-Path $PSScriptRoot 'compose.integration.yml'
$results = Join-Path $PSScriptRoot ('TestResults/' + $project)
$previous = @{}
function Set-TestVariable([string]$Name, [string]$Value) {
    if (-not $previous.ContainsKey($Name)) { $previous[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}
function Test-Port([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { $task = $client.ConnectAsync('127.0.0.1', $Port); return ($task.Wait(1000) -and $client.Connected) }
    catch { return $false } finally { $client.Dispose() }
}
function Get-Port([string]$Service, [int]$Internal) {
    $binding = & docker compose -p $project -f $compose port $Service $Internal
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '127\.0\.0\.1:(\d+)') { throw "Cannot resolve $Service port." }
    return [int]$Matches[1]
}
try {
    # Random credentials live only in this process and disposable container configuration.
    Set-TestVariable 'ISSUE84_PASSWORD' ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
    & docker compose -p $project -f $compose up -d --wait --wait-timeout 120
    if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated services. Start Docker Desktop first.' }
    $pgPort = Get-Port 'postgres' 5432
    $minioPort = Get-Port 'minio' 9000
    $smtpPort = Get-Port 'mailhog' 1025
    $mailPort = Get-Port 'mailhog' 8025
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $minio = Invoke-WebRequest "http://127.0.0.1:$minioPort/minio/health/ready" -UseBasicParsing -TimeoutSec 2
            $mail = Invoke-WebRequest "http://127.0.0.1:$mailPort/api/v2/messages" -UseBasicParsing -TimeoutSec 2
            $ready = $minio.StatusCode -eq 200 -and $mail.StatusCode -eq 200 -and (Test-Port $smtpPort)
        } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'MinIO/MailHog did not become ready.' }
    $connection = "Host=127.0.0.1;Port=$pgPort;Database=postgres;Username=postgres;Password=$env:ISSUE84_PASSWORD"
    foreach ($name in @('RECIPE_CREATE_TEST_CONNECTION','RECIPE_UPDATE_TEST_CONNECTION','RECIPE_DELETION_TEST_CONNECTION','RECIPE_IMAGES_TEST_CONNECTION','IMAGE_TEST_CONNECTION','WELCOME_EMAIL_TEST_CONNECTION','INGREDIENTS_TEST_CONNECTION','STEPS_TEST_CONNECTION')) { Set-TestVariable $name $connection }
    foreach ($name in @('RECIPE_IMAGES_TEST_MINIO_PASSWORD','RECIPE_DELETION_TEST_MINIO_PASSWORD','IMAGE_TEST_MINIO_SECRET')) { Set-TestVariable $name $env:ISSUE84_PASSWORD }
    foreach ($name in @('RECIPE_IMAGES_TEST_MINIO_USER','RECIPE_DELETION_TEST_MINIO_USER','IMAGE_TEST_MINIO_ACCESS')) { Set-TestVariable $name 'issue84local' }
    Set-TestVariable 'RECIPE_TEST_MINIO_ENDPOINT' "127.0.0.1:$minioPort"
    Set-TestVariable 'WELCOME_EMAIL_TEST_SMTP_PORT' "$smtpPort"
    Set-TestVariable 'WELCOME_EMAIL_TEST_MAILHOG_URL' "http://127.0.0.1:$mailPort"
    New-Item -ItemType Directory -Path $results -Force | Out-Null
    $failed = @()
    foreach ($suite in @('RecipeCreation','RecipeUpdate','RecipeDeletion','RecipeImages','ImageProcessing','WelcomeEmail','Ingredients','Steps')) {
        Write-Host "Running $suite with isolated PostgreSQL/MinIO/SMTP ($project)"
        $testProject = Join-Path $PSScriptRoot "CulinaryBlog.$suite.Tests/CulinaryBlog.$suite.Tests.csproj"
        & dotnet test $testProject --logger "trx;LogFileName=$suite.trx" --results-directory $results --verbosity minimal
        if ($LASTEXITCODE -ne 0) { $failed += $suite }
    }
    if ($failed.Count) { throw ('Failed suites: ' + ($failed -join ', ') + ". TRX: $results") }
    Write-Host "All eight suites passed. TRX: $results"
} finally {
    # Scope cleanup to the unique compose project created by this invocation.
    & docker compose -p $project -f $compose down --volumes --remove-orphans
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
