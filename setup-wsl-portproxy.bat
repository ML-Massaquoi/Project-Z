@echo off
:: ============================================
:: Project Z - WSL2 Docker Portproxy Setup
:: ============================================
:: Run as Administrator
:: This forwards traffic from Windows LAN IP to WSL2 Docker containers
:: Devices push to 172.16.40.19:8000 → Windows → WSL2 → Docker container
:: ============================================

echo ============================================
echo  Project Z - WSL2 Docker Portproxy Setup
echo ============================================
echo.

:: Get WSL2's virtual IP (IPv4 only)
echo [1/4] Getting WSL2 IP address...

:: Try docker-desktop WSL distro - extract IPv4 only (not IPv6 link-local)
for /f "tokens=2 delims= " %%i in ('wsl -d docker-desktop ip -4 addr show eth0 ^| findstr "inet"') do set WSL_IP=%%i
if "%WSL_IP%"=="" (
    :: Fallback: try default WSL distro
    for /f "tokens=2 delims= " %%i in ('wsl -- ip -4 addr show eth0 ^| findstr "inet"') do set WSL_IP=%%i
)
if "%WSL_IP%"=="" (
    :: Last resort: try hostname -I
    for /f "tokens=1" %%i in ('wsl -d docker-desktop hostname -I 2^>nul') do set WSL_IP=%%i
)

:: Strip subnet mask (e.g. 172.17.169.57/20 -> 172.17.169.57)
for /f "tokens=1 delims=/" %%a in ("%WSL_IP%") do set WSL_IP=%%a

if "%WSL_IP%"=="" (
    echo WARNING: Could not detect WSL2 IP. Using 127.0.0.1 as fallback.
    set WSL_IP=127.0.0.1
)
echo WSL2 IP detected as: %WSL_IP%
echo.

:: Remove existing portproxy rules for our ports
echo [2/4] Removing existing portproxy rules...
netsh interface portproxy delete v4tov4 listenport=8000 listenaddress=0.0.0.0 2>nul
netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0 2>nul
echo Done.
echo.

:: Add portproxy rules
echo [3/4] Adding portproxy rules...

:: Port 8000 - Main API (devices push here at 172.16.40.19:8000)
netsh interface portproxy add v4tov4 listenport=8000 listenaddress=0.0.0.0 connectport=8000 connectaddress=%WSL_IP%
echo   Added: 0.0.0.0:8000 -^> %WSL_IP%:8000  (Main API)

:: Port 8081 - ADMS Receiver (devices can also use this)
netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8081 connectaddress=%WSL_IP%
echo   Added: 0.0.0.0:8081 -^> %WSL_IP%:8081  (ADMS Receiver)
echo.

:: Verify
echo [4/4] Verifying portproxy rules...
echo.
echo --- Current portproxy rules ---
netsh interface portproxy show all
echo.

:: Register startup task for persistence across reboots
echo --- Registering startup task ---
schtasks /create /tn "ProjectZ-WSL-Portproxy" /tr "%~dp0setup-wsl-portproxy.bat" /sc onstart /ru SYSTEM /rl HIGHEST /f 2>nul
echo Startup task registered.
echo.

echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo  Devices can now reach the backend at:
echo    http://172.16.40.19:8000
echo    http://172.16.40.19:8081
echo.
echo  These will forward through WSL2 to Docker.
echo.
echo  NOTE: Run this script again if WSL2 IP changes
echo  (e.g., after Windows reboot or WSL restart)
echo.
pause