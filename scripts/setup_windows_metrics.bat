@echo off
TITLE Setup Wazuh System Metrics on Windows Agent
echo ===================================================
echo   SETUP SYSTEM USAGE MONITORING (WINDOWS 11 AGENT)
echo ===================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows_metrics.ps1"

echo.
pause
