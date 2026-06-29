@echo off
:: Project Z - ADMS Portproxy Setup
:: Run as Administrator to make portproxy persistent
:: This forwards port 8081 (ADMS devices) to port 8000 (FastAPI backend)

echo Setting up Project Z ADMS portproxy...

:: Remove existing rule if any (ignore errors)
netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0 2>nul

:: Add the portproxy rule
netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8000 connectaddress=127.0.0.1

:: Verify
echo.
echo --- Current portproxy rules ---
netsh interface portproxy show all

echo.
echo --- Port 8081 listener status ---
netstat -ano | findstr ":8081" | findstr LISTENING

echo.
echo --- Registering startup task ---

:: Register a scheduled task to re-apply on every system startup
schtasks /create /tn "ProjectZ-ADMS-Portproxy" /tr "netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8000 connectaddress=127.0.0.1" /sc onstart /ru SYSTEM /rl HIGHEST /f

echo.
echo Done. Portproxy is active and will auto-start on reboot.
pause
