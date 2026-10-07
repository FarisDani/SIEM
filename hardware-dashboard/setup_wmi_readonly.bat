@echo off
:: ============================================================================
:: NOC Telemetry - WMI Read-Only Permission Setup (Run as Administrator)
:: ============================================================================
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Meminta izin Administrator...
    powershell -Command "Start-Process cmd -ArgumentList '/k cd /d \"%~dp0\" && \"%~nx0\" %*' -Verb RunAs"
    exit /b
)

echo [*] Menjalankan setup WMI Read-Only...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_wmi_readonly.ps1" %*
echo.
echo Selesai. Tekan sembarang tombol untuk keluar.
pause >nul
