@echo off
TITLE Start Wazuh SIEM & Check Agent
echo ===================================================
echo   MEMULAI WAZUH SIEM (Docker & Windows Agent)
echo ===================================================
echo.

echo [1/4] Memeriksa Docker Engine...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker Desktop belum berjalan! Membuka Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Menunggu Docker Engine siap (sekitar 15-30 detik)...
    :wait_docker
    timeout /t 5 >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto wait_docker
    echo [OK] Docker Engine siap.
) else (
    echo [OK] Docker Engine sudah aktif.
)

echo.
echo [2/4] Menjalankan Wazuh Containers (Indexer, Manager, Dashboard)...
cd /d "D:\Faris\Github\SEIM\wazuh-docker\single-node"
docker compose up -d

echo.
echo [3/4] Memeriksa Status Wazuh Agent Windows & Menjalankan Telemetry Streamer...
powershell -Command "Get-Service -Name 'WazuhSvc','Wazuh' -ErrorAction SilentlyContinue | Format-Table -AutoSize"
powershell -Command "Start-Service -Name 'WazuhSvc' -ErrorAction SilentlyContinue"
start "" /min "%~dp0start_monitoring_stream.bat"

echo.
echo [4/4] Ringkasan Status Container:
docker compose ps

echo.
echo ===================================================
echo   SIEM SIAP DIGUNAKAN!
echo   Buka Browser: https://localhost
echo   Username    : admin
echo   Password    : SecretPassword
echo ===================================================
pause
