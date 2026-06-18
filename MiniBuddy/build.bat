@echo off
setlocal
cd /d "%~dp0"

:: Try bundled Node.js first, fall back to system Node.js
if exist "%~dp0runtime\node\node.exe" (
    set "NODE=%~dp0runtime\node\node.exe"
    set "NPM=%~dp0runtime\node\npm.cmd"
    echo Using bundled Node.js
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo ERROR: Cannot find Node.js. Install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
    set "NODE=node"
    set "NPM=npm"
    echo Using system Node.js
)

echo === CoreBuddy Build ===
echo.

if exist "node_modules\" (
    echo [skip] node_modules already exists
) else (
    echo [1/3] Install dependencies (first time, 3-5 min)...
    call "%NPM%" install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
)

echo [2/3] Build frontend + Electron...
call "%NPM%" run build
if %errorlevel% neq 0 (
    echo ERROR: build failed!
    pause
    exit /b 1
)

echo.
echo === Build Success ===
echo dist/ + dist-electron/ are ready.
echo Run: dev.bat to start, or dist.bat to package installer.
pause
