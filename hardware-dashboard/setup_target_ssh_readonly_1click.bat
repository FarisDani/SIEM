@echo off
setlocal EnableDelayedExpansion
title [1-CLICK SETUP] OpenSSH Server TARGET STRICT READ-ONLY (siem-monitor)

:: ============================================================================
:: 0. Auto-Elevate to Administrator
:: ============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [i] Meminta hak akses Administrator...
    powershell.exe -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c ""%~f0""' -Verb RunAs"
    exit /b
)

color 0B
cls
echo ===============================================================================
echo   [1-CLICK SETUP] OPENSSH SERVER TARGET - STRICT READ-ONLY (LEAST PRIVILEGE)
echo   Akun Dedicated: siem-monitor (100%% Non-Administrator / Aman untuk Target)
echo ===============================================================================
echo.

:: ----------------------------------------------------------------------------
:: Konfigurasi Port SSH (Opsional Custom Port)
:: ----------------------------------------------------------------------------
set "TARGET_PORT=2222"
echo [?] PENGATURAN PORT SSH:
echo     Port standar monitoring yang disarankan adalah 2222 (atau 22 default).
set /p "INPUT_PORT=    Masukkan Port SSH [Tekan ENTER untuk Port 2222 default]: "
if not "!INPUT_PORT!"=="" set "TARGET_PORT=!INPUT_PORT!"
set "SSH_TARGET_PORT=!TARGET_PORT!"
echo.
echo [*] Memulai proses instalasi dan konfigurasi Read-Only pada Port: !TARGET_PORT!...
echo.

:: ----------------------------------------------------------------------------
:: Eksekusi Script PowerShell
:: ----------------------------------------------------------------------------
if exist "%~dp0setup_ssh_readonly.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_ssh_readonly.ps1" -Port !TARGET_PORT!
) else (
    echo [!] File setup_ssh_readonly.ps1 tidak ditemukan di direktori yang sama!
)

echo.
echo ===============================================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
exit /b %errorlevel%
