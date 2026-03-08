@echo off
title 100%% Logique - Game Server
echo.
echo  ==========================================
echo    100%% LOGIQUE - Starting game server...
echo  ==========================================
echo.

:: Check node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed or not in PATH.
    echo.
    echo  Please download and install it from: https://nodejs.org
    echo  Choose the LTS version, then run this file again.
    echo.
    pause
    exit /b 1
)

echo  Node.js found:
node --version
echo.

:: Install ws if node_modules doesn't exist yet
if not exist "node_modules\ws" (
    echo  Installing required package - please wait...
    npm install
    echo.
)

:: Start the server
echo  Starting server...
echo.
node server.js
echo.
echo  Server stopped.
pause
