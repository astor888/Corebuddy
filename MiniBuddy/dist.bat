@echo off
setlocal
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

echo === CoreBuddy Package ===
echo.

if not exist "node_modules\" (
    echo [1/4] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
) else (
    echo [skip] node_modules exists
)

echo [2/4] Building...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo [3/4] Packaging (this may take 3-5 min)...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
:: Fix ERR_REQUIRE_ESM for @noble/hashes in electron-builder 26 (Node.js 22 needs =true syntax)
call node --experimental-require-module=true node_modules\electron-builder\out\cli\cli.js --win
if %errorlevel% neq 0 (
    echo ERROR: Packaging failed!
    pause
    exit /b 1
)

echo.
echo === Done! ===
dir release\*.exe 2>nul
if %errorlevel% neq 0 (
    echo No .exe found in release\ folder.
)
pause
