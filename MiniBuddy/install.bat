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

echo === CoreBuddy - First Time Setup ===
echo Using Node.js: %NODE%
echo.
echo This will download and install all dependencies.
echo First time takes 3-5 minutes.
echo.

call "%NPM%" install
if %errorlevel% neq 0 (
    echo.
    echo === INSTALL FAILED ===
    echo.
    echo Make sure Visual C++ Redistributable is installed:
    echo https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo.
    echo If you're in China, try:
    echo set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo Then run install.bat again.
    pause
    exit /b 1
)

echo.
echo === Setup Complete ===
echo.
echo Available commands:
echo   dev.bat    - Start dev server + Electron
echo   build.bat  - Build only (no packaging)
echo   dist.bat   - Build + package Windows installer
pause
