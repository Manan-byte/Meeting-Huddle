# Huddle - Start Development Servers
# Run this script from the meet-app directory

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Huddle - Video Meeting" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: http://localhost:3001" -ForegroundColor Yellow
Write-Host "Web:    http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all." -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

pnpm dev
