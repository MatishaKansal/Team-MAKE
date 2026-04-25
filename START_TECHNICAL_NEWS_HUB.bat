@echo off
setlocal
cd /d "%~dp0"

if not exist "server.js" (
  echo ERROR: server.js was not found.
  echo Please extract the ZIP first, then run this file from the extracted folder.
  echo.
  pause
  exit /b 1
)

set "NODE_CMD=node"

if exist "C:\Users\matis\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_CMD=C:\Users\matis\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if /I "%NODE_CMD%"=="node" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Node.js was not found on this computer.
    echo Install Node.js from https://nodejs.org/ and run this file again.
    echo.
    pause
    exit /b 1
  )
)

if /I not "%NODE_CMD%"=="node" (
  if not exist "%NODE_CMD%" (
    echo ERROR: Node.js runtime was expected but not found:
    echo %NODE_CMD%
    echo.
    pause
    exit /b 1
  )
)

echo Starting Technical News Hub...
echo.
echo Your browser should open automatically.
echo If it does not, open http://localhost:3000 manually.
echo Admin login: admin / admin123
echo.
start "" "http://localhost:3000"
"%NODE_CMD%" server.js
pause
