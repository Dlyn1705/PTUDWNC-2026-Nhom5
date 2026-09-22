@echo off
title Khoi dong Culinary Blog (Full-stack)
echo ===================================================
echo   Dang khoi dong Culinary Blog (Backend + Frontend)
echo ===================================================

echo [1/2] Dang mo Backend .NET API (Port 5156)...
start "Backend API (.NET 10)" cmd /k "dotnet run --project src\CulinaryBlog.API"

echo [2/2] Dang mo Frontend Next.js (Port 3000)...
start "Frontend Next.js" cmd /k "cd culinary-blog-web && npm run dev"

echo.
echo Ca hai tien trinh da duoc khoi dong trong 2 cua so rieng biet!
echo - Frontend: http://localhost:3000
echo - Backend API Docs: http://localhost:5156/scalar/v1
echo.
