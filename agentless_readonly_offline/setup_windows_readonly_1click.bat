@echo off
setlocal EnableDelayedExpansion
title [OFFLINE 1-CLICK] Setup SSH Target Windows (Strict Read-Only)

:: ===============================================================================
:: Auto-Elevate to Administrator (UAC Prompt)
:: ===============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Memerlukan hak administrator untuk mendaftarkan service SSH dan Firewall...
    echo Membuka prompt UAC...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ===============================================================================
echo   [OFFLINE 1-CLICK] PROVISIONING OPENSSH SERVER TARGET (WINDOWS)
echo   Mode: 100%% OFFLINE (Bypass Windows Update / Tanpa Internet)
echo   Keamanan: STRICT READ-ONLY ^| Akun: Non-Admin (Least Privilege)
echo ===============================================================================
echo.
echo Konfigurasi Target Monitoring (Tekan ENTER untuk menggunakan nilai default):
echo -------------------------------------------------------------------------------
set /p TARGET_PORT="Masukkan Port SSH Target [Tekan ENTER untuk default 3000]: "
if "!TARGET_PORT!"=="" set TARGET_PORT=3000

set /p MONITOR_USER="Masukkan Username Monitoring [Tekan ENTER untuk default siem-monitor]: "
if "!MONITOR_USER!"=="" set MONITOR_USER=siem-monitor

set /p MONITOR_PASS="Masukkan Password Monitoring [Tekan ENTER untuk default Siem@Indriati2026!]: "
if "!MONITOR_PASS!"=="" set MONITOR_PASS=Siem@Indriati2026!

echo.
echo ===============================================================================
echo   Ringkasan Pengaturan Target:
echo     - Port SSH   : !TARGET_PORT!
echo     - Username   : !MONITOR_USER!
echo     - Password   : !MONITOR_PASS!
echo ===============================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows_readonly.ps1" -Port !TARGET_PORT! -Username "!MONITOR_USER!" -Password "!MONITOR_PASS!"

echo.
echo ===============================================================================
echo Proses selesai. Tekan sembarang tombol untuk menutup jendela ini.
echo ===============================================================================
pause >nul
