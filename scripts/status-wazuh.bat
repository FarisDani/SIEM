@echo off
TITLE Status Wazuh SIEM
echo ===================================================
echo   CEK STATUS WAZUH SIEM & WINDOWS AGENT
echo ===================================================
echo.

echo [1] Status Docker Container:
cd /d "D:\Faris\Github\SEIM\wazuh-docker\single-node"
docker compose ps

echo.
echo [2] Status Windows Wazuh Agent Service:
powershell -Command "Get-Service -Name 'WazuhSvc','Wazuh' -ErrorAction SilentlyContinue | Format-Table Status, Name, DisplayName -AutoSize"

echo.
echo [3] IP Address Host Windows Saat Ini:
powershell -Command "Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*' | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize"

echo.
echo ===================================================
pause
