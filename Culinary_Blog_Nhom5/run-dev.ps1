$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$frontendRoot = Join-Path $projectRoot "culinary-blog-web"
$localEnvPath = Join-Path (Split-Path $projectRoot -Parent) ".env"

if (Test-Path -LiteralPath $localEnvPath) {
    foreach ($line in Get-Content -LiteralPath $localEnvPath) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
        $name = $Matches[1]
        $value = $Matches[2].Trim().Trim('"', "'")
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

if ([string]::IsNullOrWhiteSpace($env:ConnectionStrings__DefaultConnection)) {
    if ([string]::IsNullOrWhiteSpace($env:POSTGRES_PASSWORD)) {
        throw "Set POSTGRES_PASSWORD in the repository .env or set ConnectionStrings__DefaultConnection."
    }
    $env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=5433;Database=culinary_blog_db;Username=postgres;Password=$($env:POSTGRES_PASSWORD)"
}
if ([string]::IsNullOrWhiteSpace($env:Jwt__Key)) {
    $env:Jwt__Key = $env:JWT_KEY
}
if ([string]::IsNullOrWhiteSpace($env:Jwt__Key) -or [System.Text.Encoding]::UTF8.GetByteCount($env:Jwt__Key) -lt 32) {
    throw "Set JWT_KEY (at least 32 UTF-8 bytes) in the repository .env or set Jwt__Key."
}

function Start-ConsoleProcess {
    param(
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [string] $Arguments,
        [Parameter(Mandatory)] [string] $WorkingDirectory
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false

    return [System.Diagnostics.Process]::Start($startInfo)
}

function Wait-ForBackendReady {
    param(
        [Parameter(Mandatory)] [System.Diagnostics.Process] $Process,
        [int] $TimeoutSeconds = 90
    )

    $readinessUrl = "http://localhost:5156/health/ready"
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

    Write-Host "Dang cho Backend san sang (database + storage)..." -ForegroundColor DarkYellow

    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "Backend da dung trong khi cho readiness (exit code $($Process.ExitCode))."
        }

        try {
            $response = Invoke-WebRequest `
                -UseBasicParsing `
                -Uri $readinessUrl `
                -TimeoutSec 2

            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                Write-Host "Backend da san sang." -ForegroundColor Green
                return
            }
        }
        catch {
            # Backend may still be starting, or a dependency may still be unavailable.
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Backend khong san sang sau $TimeoutSeconds giay. Kiem tra log cua PostgreSQL/MinIO va cua so Backend."
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Dang khoi dong Culinary Blog (Backend + Frontend)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Match the development MinIO container defaults without storing credentials in API settings.
if ([string]::IsNullOrWhiteSpace($env:Minio__AccessKey)) {
    $env:Minio__AccessKey = if ($env:MINIO_ROOT_USER) { $env:MINIO_ROOT_USER } else { "minioadmin" }
}
if ([string]::IsNullOrWhiteSpace($env:Minio__SecretKey)) {
    $env:Minio__SecretKey = if ($env:MINIO_ROOT_PASSWORD) { $env:MINIO_ROOT_PASSWORD } else { "minioadminpassword" }
}

$backendProcess = $null
$frontendProcess = $null
try {
    Write-Host "[1/2] Dang chay Backend .NET API (Port 5156)..." -ForegroundColor Yellow
    $dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source
    $backendProcess = Start-ConsoleProcess `
        -FilePath $dotnetPath `
        -Arguments 'run --project src/CulinaryBlog.API' `
        -WorkingDirectory $projectRoot

    Wait-ForBackendReady -Process $backendProcess

    Write-Host "[2/2] Dang chay Frontend Next.js (Port 3000)..." -ForegroundColor Yellow
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    $frontendProcess = Start-ConsoleProcess `
        -FilePath $npmPath `
        -Arguments 'run dev' `
        -WorkingDirectory $frontendRoot

    Write-Host "`nCa hai tien trinh dang chay trong cua so nay." -ForegroundColor Green
    Write-Host "- Frontend Web App:  http://localhost:3000" -ForegroundColor White
    Write-Host "- Backend Scalar UI: http://localhost:5156/scalar/v1" -ForegroundColor White
    Write-Host "- Nhan Ctrl + C de dung." -ForegroundColor DarkGray

    $backendExitReported = $false
    $frontendExitReported = $false

    while (-not ($backendProcess.HasExited -and $frontendProcess.HasExited)) {
        Start-Sleep -Milliseconds 500
        $backendProcess.Refresh()
        $frontendProcess.Refresh()

        if ($backendProcess.HasExited -and -not $backendExitReported) {
            Write-Warning "Backend da dung voi exit code $($backendProcess.ExitCode). Frontend (neu con chay) se khong bi tat."
            $backendExitReported = $true
        }

        if ($frontendProcess.HasExited -and -not $frontendExitReported) {
            Write-Warning "Frontend da dung voi exit code $($frontendProcess.ExitCode). Backend (neu con chay) se tiep tuc hoat dong."
            $frontendExitReported = $true
        }
    }
}
finally {
    Write-Host "`nDang dung cac tien trinh..." -ForegroundColor Yellow

    foreach ($process in @($backendProcess, $frontendProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
