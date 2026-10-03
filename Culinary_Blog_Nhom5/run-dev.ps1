$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$frontendRoot = Join-Path $projectRoot "culinary-blog-web"

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

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Dang khoi dong Culinary Blog (Backend + Frontend)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($env:AUTH_SECRET) -and [string]::IsNullOrWhiteSpace($env:NEXTAUTH_SECRET)) {
    $secretBytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
    $env:AUTH_SECRET = [Convert]::ToBase64String($secretBytes)
}

Write-Host "[1/2] Dang chay Backend .NET API (Port 5156)..." -ForegroundColor Yellow
$dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source
$backendProcess = Start-ConsoleProcess `
    -FilePath $dotnetPath `
    -Arguments 'run --project src/CulinaryBlog.API' `
    -WorkingDirectory $projectRoot

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

try {
    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Milliseconds 500
        $backendProcess.Refresh()
        $frontendProcess.Refresh()
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
