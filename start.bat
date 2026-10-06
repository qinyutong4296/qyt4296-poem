@echo off
cd /d "%~dp0server"
echo.
echo  ========================================
echo    MoYun ShiJing - LAN Server
echo    (mo yun shi jing)
echo  ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found.
  echo  Please install from https://nodejs.org/
  pause
  exit /b 1
)

set NEED_INSTALL=0
if not exist "node_modules\express" set NEED_INSTALL=1
if not exist "node_modules\sharp" set NEED_INSTALL=1
if not exist "node_modules\compression" set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
  echo  [INFO] Installing dependencies first time, please wait...
  call npm install
  if errorlevel 1 (
    echo  [WARN] Full install failed, try express only...
    call npm install express --no-save 2>nul
    if errorlevel 1 (
      echo  [ERROR] npm install failed
      pause
      exit /b 1
    )
    echo  [TIP] sharp missing: gallery uses full-size images.
  )
  echo.
)

echo  [INFO] Starting server...
echo  [TIP] Browser will open. Close the page to stop the server.
echo  [TIP] Local:  http://127.0.0.1:8787/
echo.

start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:8787/"

node index.js
echo.
echo  [INFO] Server stopped.
exit /b 0
