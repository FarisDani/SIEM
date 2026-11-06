@echo off
setlocal EnableDelayedExpansion
title [OFFLINE 1-CLICK] Uninstall SSH Target Windows (Remove Monitoring User)

:: ===============================================================================
:: Auto-Elevate to Administrator (UAC Prompt)
:: ===============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Memerlukan hak administrator untuk menghapus akun dan aturan firewall...
    echo Membuka prompt UAC...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ===============================================================================
echo   [OFFLINE 1-CLICK] UNINSTALL OPENSSH TARGET MONITORING (WINDOWS)
echo ===============================================================================
echo.
set /p MONITOR_USER="Masukkan Username Monitoring yang ingin dihapus [Tekan ENTER untuk default siem-monitor]: "
if "!MONITOR_USER!"=="" set MONITOR_USER=siem-monitor

set /p TARGET_PORT="Masukkan Port SSH yang ingin dibersihkan [Tekan ENTER untuk default 3000]: "
if "!TARGET_PORT!"=="" set TARGET_PORT=3000

echo.
echo Membersihkan user !MONITOR_USER! dan firewall port !TARGET_PORT!...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall_windows_readonly.ps1" -Username "!MONITOR_USER!" -Port !TARGET_PORT!

echo.
echo ===============================================================================
echo Proses uninstalasi selesai. Tekan sembarang tombol untuk keluar.
echo ===============================================================================
pause >nul
