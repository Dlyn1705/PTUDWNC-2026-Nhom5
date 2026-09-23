Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Dang khoi dong Culinary Blog (Backend + Frontend)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host "[1/2] Dang mo Backend .NET API (Port 5156)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "dotnet run --project src/CulinaryBlog.API"

Write-Host "[2/2] Dang mo Frontend Next.js (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location culinary-blog-web; npm run dev"

Write-Host "`nKhoi dong hoan tat!" -ForegroundColor Green
Write-Host "- Frontend Web App:  http://localhost:3000" -ForegroundColor White
Write-Host "- Backend Scalar UI: http://localhost:5156/scalar/v1" -ForegroundColor White
