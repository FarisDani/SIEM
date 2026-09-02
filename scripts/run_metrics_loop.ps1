# ==============================================================================
# Background Telemetry Streamer for Windows Host
# Runs every 30 seconds continuously in the background
# ==============================================================================

$collectorScript = Join-Path $PSScriptRoot "metrics\collect_metrics.ps1"
$pushScript = Join-Path $PSScriptRoot "push_live_metric.py"

Write-Host "[NOC Service] Memulai Telemetry Streamer (Setiap 30 detik)..." -ForegroundColor Cyan

while ($true) {
    try {
        # 1. Jalankan script kolektor
        $jsonPayload = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $collectorScript
        
        if ($jsonPayload -and $jsonPayload.StartsWith("{")) {
            # 2. Kirim langsung ke Wazuh Indexer via Python streamer
            $jsonPayload | python $pushScript
        }
    } catch {
        Write-Warning "Error sending telemetry: $_"
    }

    Start-Sleep -Seconds 30
}
