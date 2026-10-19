@echo off
setlocal EnableDelayedExpansion
title [1-CLICK V2] Setup SSH Target Windows (Strict Read-Only)

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
echo   [1-CLICK V2] PROVISIONING OPENSSH SERVER TARGET (WINDOWS)
echo   Keamanan: STRICT READ-ONLY ^| Least Privilege ^| Akun: siem-monitor (Non-Admin)
echo ===============================================================================
echo.
echo Port default untuk agentless monitoring dashboard adalah 3000.
set /p TARGET_PORT="Masukkan Port SSH Target [Tekan ENTER untuk default 3000]: "
if "!TARGET_PORT!"=="" set TARGET_PORT=3000

echo.
echo Menjalankan konfigurasi otomatis pada port !TARGET_PORT!...
echo -------------------------------------------------------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows_readonly.ps1" -Port !TARGET_PORT!

echo.
echo ===============================================================================
echo Proses selesai. Tekan sembarang tombol untuk menutup jendela ini.
echo ===============================================================================
pause >nul
