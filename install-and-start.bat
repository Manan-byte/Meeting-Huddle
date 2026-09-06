@echo off
title Huddle - Install & Start
echo.
echo ========================================
echo    Huddle - First Time Setup
echo ========================================
echo.
echo [1/2] Installing dependencies...
echo.
call pnpm install
echo.
echo [2/2] Starting development...
echo.
echo ========================================
echo    Ready!
echo    Web:    http://localhost:5173
echo    Server: http://localhost:3001
echo ========================================
echo.
pnpm dev
