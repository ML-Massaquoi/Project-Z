# ============================================
# Project Z - Start Frontend (Native Mode)
# ============================================
# Frontend runs on HOST at port 3000
# Connects directly to backend at localhost:8000
# No Docker networking issues
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Project Z - Frontend (Native Mode)"       -ForegroundColor Cyan
Write-Host "  http://127.0.0.1:3000"                    -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$frontendDir = Join-Path $PSScriptRoot "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "ERROR: frontend/ directory not found" -ForegroundColor Red
    exit 1
}

Set-Location $frontendDir

# Check node_modules
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

# Set env vars so Vite proxy targets physical IP directly
$env:VITE_API_BASE_URL = "http://172.16.40.19:8000"
$env:VITE_WS_URL = "ws://172.16.40.19:8000/ws"
$env:RUNNING_IN_DOCKER = "false"

Write-Host "Starting Vite dev server..." -ForegroundColor Green
npm run dev -- --host 172.16.40.19 --port 3000
