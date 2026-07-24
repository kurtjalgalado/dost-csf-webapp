@echo off
TITLE DOST Region V CSF - Local WebApp Launcher
COLOR 0A
CLS

echo ===================================================================
echo   DOST REGION V - CUSTOMER SATISFACTION FEEDBACK (CSF) WEBAPP
echo   Local Deployment Launcher with Google Apps Script Webhook Sync
echo ===================================================================
echo.

:: 1. Check Node.js installation
echo [1/4] Checking Node.js Environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js 18+ or 24+ from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo     -> Node.js Version: %NODE_VER% (OK)
echo.

:: 2. Check Internet Connectivity & Google Apps Script Reachability
echo [2/4] Verifying Internet & Google Webhook Reachability...
ping -n 1 script.google.com >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Internet connection or script.google.com is unreachable.
    echo     -> Note: The webapp will run in LOCAL SQLITE DB mode.
    echo        Google Docs auto-filling will sync once internet is re-established.
) else (
    echo     -> Internet & Google Apps Script Connection: Reachable [OK]
)
echo.

:: 3. Check .env configuration
echo [3/4] Checking Local Environment Configuration (.env)...
if not exist .env (
    echo Creating .env file from template...
    copy .env.example .env >nul
)

:: Prompt for Google Webhook URL if empty
findstr /C:"GOOGLE_WEBHOOK_URL=http" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [CONFIG] GOOGLE_WEBHOOK_URL is not configured in .env yet.
    set /p WEBHOOK_INPUT="Enter your Google Apps Script Web App URL (or press Enter to skip): "
    if not "%WEBHOOK_INPUT%"=="" (
        echo PORT=3000>.env
        echo GOOGLE_WEBHOOK_URL=%WEBHOOK_INPUT%>>.env
        echo DB_MODE=dual>>.env
        echo Saved Google Webhook URL to .env!
    )
)
echo     -> Environment Configured [OK]
echo.

:: 4. Launching Local Server & Browser
echo [4/4] Starting Local WebServer on http://localhost:3000...
echo.
echo ===================================================================
echo  📋 Customer Webform:      http://localhost:3000/
echo  📊 Admin & Infographics:  http://localhost:3000/admin.html
echo ===================================================================
echo.
echo Launching default browser...
start http://localhost:3000/admin.html

node server.js

pause
