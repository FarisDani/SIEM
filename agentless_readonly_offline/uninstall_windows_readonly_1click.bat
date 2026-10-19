@echo off
setlocal EnableDelayedExpansion
title [OFFLINE 1-CLICK] Uninstall SSH Target Windows (Remove siem-monitor)

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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall_windows_readonly.ps1"

echo.
echo ===============================================================================
echo Proses uninstalasi selesai. Tekan sembarang tombol untuk keluar.
echo ===============================================================================
pause >nul
