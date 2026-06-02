# ============================================
# Project Z - Start Backend (Native Mode)
# ============================================
# Backend runs on HOST at port 8000
# Postgres + Redis run in Docker
# RONASOFT device pushes to 172.16.40.19:8000
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Project Z - Backend (Native Mode)"        -ForegroundColor Cyan
Write-Host "  Listening on 0.0.0.0:8000"               -ForegroundColor Cyan
Write-Host "  RONASOFT device: 172.16.40.12 -> here"   -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$backendDir = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path $backendDir)) {
    Write-Host "ERROR: backend/ directory not found" -ForegroundColor Red
    exit 1
}

Set-Location $backendDir

# Activate venv
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "ERROR: venv not found. Run: python -m venv venv && venv\Scripts\pip install -r requirements.txt" -ForegroundColor Red
    exit 1
}

$env:PYTHONPATH = $backendDir

# Run migrations
Write-Host "[1/2] Running database migrations..." -ForegroundColor Yellow
& $venvPython -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Migration check failed" -ForegroundColor Yellow
}

# Start backend
Write-Host "[2/2] Starting backend services..." -ForegroundColor Green
Write-Host ""
Write-Host "  Main API Server:          http://localhost:8000" -ForegroundColor White
Write-Host "  Main API Docs:            http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Dedicated ADMS Receiver:  http://172.16.40.19:8081" -ForegroundColor White
Write-Host "  Status Endpoint:          http://localhost:8000/adms/status" -ForegroundColor White
Write-Host ""

$uvicornPath = Join-Path $backendDir "venv\Scripts\uvicorn.exe"

# Start the Dedicated ADMS Receiver on port 8081 in a new window
Write-Host "Launching Dedicated ADMS Receiver on port 8081..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; `$env:PYTHONPATH='$backendDir'; & '$uvicornPath' app.main:app --host 0.0.0.0 --port 8081 --reload --reload-dir app --env-file .env"

# Run the Main API server on port 8000 in the foreground
Write-Host "Starting Main API Server on port 8000..." -ForegroundColor Green
& $uvicornPath app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app --env-file .env
