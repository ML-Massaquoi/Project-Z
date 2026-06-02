# ============================================
# Project Z - ADMS Connectivity Diagnostic
# ============================================
# Run this script to verify the Rodasoft device
# can communicate with the backend.
#
# Tests:
#   1. Is the backend reachable on port 8081?
#   2. Does the ADMS handshake endpoint respond?
#   3. Can we simulate a scan event?
#   4. Is the Rodasoft device reachable?
# ============================================

param(
    [string]$ServerIP = "172.16.40.19",
    [int]$ServerPort = 8081,
    [string]$DeviceIP = "172.16.40.12",
    [int]$DevicePort = 4370
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Project Z - ADMS Connectivity Diagnostic"  -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://${ServerIP}:${ServerPort}"
$allPassed = $true

# ── Test 1: Backend reachability ─────────────────
Write-Host "[Test 1] Backend reachability at ${baseUrl}..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "${baseUrl}/" -TimeoutSec 5 -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    Write-Host "  PASS: Backend is running" -ForegroundColor Green
    Write-Host "    App: $($data.name) v$($data.version)" -ForegroundColor White
    Write-Host "    Org: $($data.organization)" -ForegroundColor White
    Write-Host "    Status: $($data.status)" -ForegroundColor White
} catch {
    Write-Host "  FAIL: Cannot reach backend at ${baseUrl}" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. Is the backend running? Run: .\start-backend.ps1" -ForegroundColor White
    Write-Host "    2. Is Windows Firewall blocking port ${ServerPort}?" -ForegroundColor White
    Write-Host "       Run: netsh advfirewall firewall add rule name='Project Z ADMS' dir=in action=allow protocol=tcp localport=${ServerPort}" -ForegroundColor White
    Write-Host "    3. Is another app using port ${ServerPort}?" -ForegroundColor White
    Write-Host "       Run: netstat -ano | findstr :${ServerPort}" -ForegroundColor White
    $allPassed = $false
}
Write-Host ""

# ── Test 2: ADMS handshake endpoint ──────────────
Write-Host "[Test 2] ADMS handshake endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "${baseUrl}/iclock/cdata?SN=TEST_DIAGNOSTIC&options=all&pushver=2.4.0" -TimeoutSec 5 -UseBasicParsing
    $content = $response.Content
    if ($content -match "GET OPTION FROM") {
        Write-Host "  PASS: ADMS handshake working" -ForegroundColor Green
        Write-Host "    Response: $($content.Substring(0, [Math]::Min(100, $content.Length)))..." -ForegroundColor White
    } else {
        Write-Host "  WARN: Unexpected handshake response" -ForegroundColor Yellow
        Write-Host "    Response: $content" -ForegroundColor White
    }
} catch {
    Write-Host "  FAIL: ADMS handshake endpoint not responding" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# ── Test 3: ADMS command poll endpoint ───────────
Write-Host "[Test 3] ADMS command poll endpoint (/iclock/getrequest)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "${baseUrl}/iclock/getrequest?SN=TEST_DIAGNOSTIC" -TimeoutSec 5 -UseBasicParsing
    if ($response.Content -eq "OK") {
        Write-Host "  PASS: Command poll endpoint responding 'OK'" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Unexpected response: $($response.Content)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  FAIL: Command poll endpoint not responding" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# ── Test 4: ADMS status (registered devices) ────
Write-Host "[Test 4] ADMS device status..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "${baseUrl}/adms/status" -TimeoutSec 5 -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    Write-Host "  PASS: ADMS status endpoint working" -ForegroundColor Green
    Write-Host "    Total devices: $($data.total_devices)" -ForegroundColor White
    Write-Host "    Online devices: $($data.online_devices)" -ForegroundColor White
    if ($data.devices) {
        foreach ($dev in $data.devices) {
            $status = if ($dev.is_online) { "ONLINE" } else { "OFFLINE" }
            $color = if ($dev.is_online) { "Green" } else { "Red" }
            Write-Host "    - $($dev.serial_number) | $($dev.name) | IP=$($dev.ip_address) | $status | Last seen: $($dev.last_seen)" -ForegroundColor $color
        }
    }
} catch {
    Write-Host "  FAIL: Cannot reach ADMS status endpoint" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# ── Test 5: Rodasoft device reachability ─────────
Write-Host "[Test 5] Rodasoft device reachability at ${DeviceIP}:${DevicePort}..." -ForegroundColor Yellow
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $asyncResult = $tcpClient.BeginConnect($DeviceIP, $DevicePort, $null, $null)
    $waitHandle = $asyncResult.AsyncWaitHandle
    if ($waitHandle.WaitOne(3000, $false)) {
        $tcpClient.EndConnect($asyncResult)
        Write-Host "  PASS: Rodasoft device is reachable at ${DeviceIP}:${DevicePort}" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Connection timeout to ${DeviceIP}:${DevicePort}" -ForegroundColor Red
        $allPassed = $false
    }
    $tcpClient.Close()
} catch {
    Write-Host "  FAIL: Cannot reach Rodasoft at ${DeviceIP}:${DevicePort}" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    Check: Is the device powered on? Is it on the same network?" -ForegroundColor Yellow
    $allPassed = $false
}
Write-Host ""

# ── Test 6: Simulate ATTLOG push ─────────────────
Write-Host "[Test 6] Simulating ATTLOG data push (test scan)..." -ForegroundColor Yellow
try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $body = "9999`t${timestamp}`t0`t9`t0`t0`t0"  # user_id=9999, status=0 (check-in), verify=9 (face)

    $response = Invoke-WebRequest -Uri "${baseUrl}/iclock/cdata?SN=TEST_DIAGNOSTIC&table=ATTLOG&Stamp=9999" `
        -Method POST `
        -Body $body `
        -ContentType "text/plain" `
        -TimeoutSec 5 `
        -UseBasicParsing

    if ($response.Content -eq "OK") {
        Write-Host "  PASS: ATTLOG push accepted (response: OK)" -ForegroundColor Green
        Write-Host "    Simulated: user_id=9999, face scan, check-in at ${timestamp}" -ForegroundColor White
        Write-Host "    Check backend logs for: [ADMS] DATA PUSH | SN=TEST_DIAGNOSTIC" -ForegroundColor White
    } else {
        Write-Host "  WARN: Unexpected response: $($response.Content)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  FAIL: ATTLOG push rejected" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# ── Summary ──────────────────────────────────────
Write-Host "============================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "  ALL TESTS PASSED" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Your Rodasoft device should be able to push" -ForegroundColor White
    Write-Host "  ADMS data to http://${ServerIP}:${ServerPort}/iclock/cdata" -ForegroundColor White
    Write-Host ""
    Write-Host "  On the Rodasoft device, configure:" -ForegroundColor Yellow
    Write-Host "    Server Address: ${ServerIP}" -ForegroundColor White
    Write-Host "    Server Port: ${ServerPort}" -ForegroundColor White
    Write-Host "    Protocol: HTTP" -ForegroundColor White
} else {
    Write-Host "  SOME TESTS FAILED - see details above" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Quick fix checklist:" -ForegroundColor Yellow
    Write-Host "    1. Start infrastructure: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d" -ForegroundColor White
    Write-Host "    2. Start backend: .\start-backend.ps1" -ForegroundColor White
    Write-Host "    3. Open firewall: netsh advfirewall firewall add rule name='Project Z ADMS' dir=in action=allow protocol=tcp localport=${ServerPort}" -ForegroundColor White
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
