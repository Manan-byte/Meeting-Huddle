# Huddle - Install Dependencies & Start
# Run this script from the meet-app directory

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Huddle - First Time Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Installing dependencies..." -ForegroundColor Yellow
pnpm install

Write-Host ""
Write-Host "[2/2] Starting development..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Ready!" -ForegroundColor Green
Write-Host "   Web:    http://localhost:5173" -ForegroundColor Green
Write-Host "   Server: http://localhost:3001" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

pnpm dev
