@echo off
setlocal EnableDelayedExpansion
title [1-CLICK UNINSTALL] Nonaktifkan and Hapus OpenSSH Server Target
color 0C

:: ============================================================================
:: 0. Auto-Elevate to Administrator
:: ============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [i] Meminta hak akses Administrator...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cls
echo ===============================================================================
echo   [1-CLICK UNINSTALL] HAPUS ^& NONAKTIFKAN OPENSSH SERVER TARGET (WINDOWS)
echo   Enterprise Hardware and Security Dashboard
echo ===============================================================================
echo.
echo PERINGATAN:
echo Script ini akan menghentikan service SSHD, menghapus akun 'siem-monitor',
echo menutup port SSH di firewall, serta mencopot paket OpenSSH Server.
echo.
set /p "CONFIRM=Apakah Anda yakin ingin melanjutkan? (Ketik Y lalu Enter untuk lanjut): "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo [i] Pembatalan oleh pengguna. Tidak ada perubahan yang dilakukan.
    timeout /t 3 >nul
    exit /b
)

echo.
color 0E

:: ----------------------------------------------------------------------------
:: Eksekusi Script PowerShell Uninstall
:: ----------------------------------------------------------------------------
if exist "%~dp0uninstall_ssh.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall_ssh.ps1"
) else (
    echo [!] File uninstall_ssh.ps1 tidak ditemukan di folder yang sama!
)

echo.
echo ===============================================================================
echo Tekan tombol apa saja untuk keluar...
pause >nul
exit /b %errorlevel%
