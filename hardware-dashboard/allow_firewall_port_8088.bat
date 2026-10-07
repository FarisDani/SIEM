@echo off
title Buka Port 8088 Windows Firewall (Remote Access)
color 0a

:: Auto-Elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Meminta hak administrator untuk konfigurasi Windows Firewall...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ======================================================================
echo    MEMBUKA PORT 8088 INBOUND DI WINDOWS DEFENDER FIREWALL
echo ======================================================================
echo.
echo Menambahkan rule firewall TCP Port 8088...

netsh advfirewall firewall add rule name="SIEM Telemetry Dashboard Port 8088" dir=in action=allow protocol=TCP localport=8088 profile=any

if %errorlevel% neq 0 (
    echo.
    echo [!] Gagal menambahkan rule firewall.
) else (
    echo.
    echo [+] SUKSES: Port 8088 berhasil dibuka di Windows Firewall!
    echo.
    echo Perangkat lain (Laptop / HP / Tablet / Server) di jaringan lokal dapat mengakses:
    echo   http://192.168.27.41:8088
    echo   http://192.168.27.41:8088/siem.html
)

echo.
pause
