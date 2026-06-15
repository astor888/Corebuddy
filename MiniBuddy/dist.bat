@echo off
setlocal
cd /d "%~dp0"
set "NODE=%~dp0runtime\node\node.exe"
set "NPM=%~dp0runtime\node\npm.cmd"

echo === CoreBuddy Package ===
echo Using Node.js: %NODE%
echo.

if exist "node_modules\" (
    echo [skip] node_modules already exists
) else (
    echo [1/4] Install dependencies (first time, 3-5 min)...
    call "%NPM%" install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
)

echo [2/4] Build frontend + Electron...
call "%NPM%" run build
if %errorlevel% neq 0 (
    echo ERROR: build failed!
    pause
    exit /b 1
)

echo [3/4] Package Windows installer (NSIS, 3-5 min)...
echo Using China mirror for faster electron download...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call "%NPM%" run dist
if %errorlevel% neq 0 (
    echo ERROR: packaging failed!
    pause
    exit /b 1
)

echo.
echo === Package Success ===
dir release\*.exe 2>nul
pause
