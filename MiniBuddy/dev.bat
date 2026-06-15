@echo off
setlocal
cd /d "%~dp0"
set "NODE=%~dp0runtime\node\node.exe"
set "NPM=%~dp0runtime\node\npm.cmd"

echo === CoreBuddy Dev Mode ===
echo Using Node.js: %NODE%
echo.

if exist "node_modules\" (
    echo [skip] node_modules already exists
) else (
    echo [1/3] Install dependencies (first time, 3-5 min)...
    call "%NPM%" install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed! Make sure Visual C++ Redistributable is installed.
        pause
        exit /b 1
    )
)

echo [2/3] Start dev server + Electron...
call "%NPM%" run dev
pause
