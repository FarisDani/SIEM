@echo off
TITLE NOC Telemetry Streamer (30s Background)
echo ===================================================
echo   NOC TELEMETRY STREAMER (Setiap 30 Detik)
echo ===================================================
echo Jendela ini mengirim telemetri performa ke Wazuh secara kontinu.
echo Anda dapat meminimalkan (minimize) jendela ini saat bekerja.
echo.

python "%~dp0stream_daemon.py" --loop
pause
