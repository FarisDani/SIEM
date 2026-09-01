@echo off
TITLE Stop Wazuh SIEM Gracefully
echo ===================================================
echo   MENGHENTIKAN WAZUH SIEM (Graceful Shutdown)
echo ===================================================
echo.

echo Menghentikan container Wazuh (Indexer, Manager, Dashboard)...
cd /d "D:\Faris\Github\SEIM\wazuh-docker\single-node"
docker compose stop

echo.
echo Status Container Sekarang:
docker compose ps

echo.
echo ===================================================
echo   Semua container Wazuh telah dihentikan dengan aman.
echo   PC siap untuk di-shutdown.
echo ===================================================
pause
