# DOST Region V CSF - PowerShell Local Deployment Script
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  DOST REGION V - CUSTOMER SATISFACTION FEEDBACK (CSF) WEBAPP" -ForegroundColor Yellow
Write-Host "  Local Deployment Launcher with Google Apps Script Webhook Sync" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js Runtime
Write-Host "[1/4] Checking Node.js Environment..." -ForegroundColor White
try {
    $nodeVer = node -v
    Write-Host "    -> Node.js Version: $nodeVer [OK]" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed. Download from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Check Internet Connectivity to Google Apps Script
Write-Host "[2/4] Verifying Internet & Google Webhook Reachability..." -ForegroundColor White
try {
    $ping = Test-Connection -ComputerName "script.google.com" -Count 1 -Quiet
    if ($ping) {
        Write-Host "    -> Internet & Google Apps Script Connection: Reachable [OK]" -ForegroundColor Green
    } else {
        Write-Host "    -> [WARNING] Cannot ping script.google.com. Running in Local SQLite DB mode." -ForegroundColor Yellow
    }
} catch {
    Write-Host "    -> [WARNING] Network check failed. Local SQLite DB active." -ForegroundColor Yellow
}

# 3. Check .env File
Write-Host "[3/4] Checking Local Environment (.env)..." -ForegroundColor White
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "    -> Created .env file from .env.example" -ForegroundColor Cyan
}
Write-Host "    -> Environment Ready [OK]" -ForegroundColor Green

# 4. Launch Local Web Server & Browser
Write-Host "[4/4] Starting Local WebServer on http://localhost:3000..." -ForegroundColor White
Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  📋 Customer Webform:      http://localhost:3000/" -ForegroundColor White
Write-Host "  📊 Admin & Infographics:  http://localhost:3000/admin.html" -ForegroundColor White
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost:3000/admin.html"

node server.js
