@echo off
title Enterprise Hardware Telemetry NOC Dashboard
color 0b

echo ======================================================================
echo    ENTERPRISE HARDWARE TELEMETRY & SENSOR MONITORING DASHBOARD
echo ======================================================================
echo.
echo [1/2] Menyiapkan server telemetri sensor...
echo.

cd /d "%~dp0"

echo [2/2] Membuka dashboard di web browser default (http://localhost:8088)...
start http://localhost:8088

echo.
echo ======================================================================
echo  Server aktif di port 8088. Jangan tutup jendela ini selama monitoring!
echo ======================================================================
echo.

python server.py

pause
