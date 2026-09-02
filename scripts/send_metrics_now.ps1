[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:SecretPassword"))
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Basic $auth"
}
$today = (Get-Date).ToUniversalTime().ToString("yyyy.MM.dd")
$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")

$collector = Join-Path $PSScriptRoot "metrics\collect_metrics.ps1"
$rawJson = powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $collector
$data = $rawJson | ConvertFrom-Json

$ruleId = "100100"
$level = 3
if ($data.services_down_count -gt 0) {
    $ruleId = "100105"; $level = 12
} elseif ($data.worst_disk_pct -gt 90) {
    $ruleId = "100103"; $level = 10
} elseif ($data.pagefile_pct -gt 85) {
    $ruleId = "100106"; $level = 9
} elseif ($data.ram_pct -gt 90) {
    $ruleId = "100102"; $level = 8
} elseif ($data.cpu_pct -gt 85) {
    $ruleId = "100101"; $level = 7
}

$doc = [ordered]@{
    "@timestamp" = $nowIso
    "timestamp"  = $nowIso
    "agent" = [ordered]@{
        "id"   = "001"
        "name" = "tes-win-11"
        "ip"   = "192.168.27.41"
    }
    "manager" = [ordered]@{ "name" = "wazuh.manager" }
    "rule" = [ordered]@{
        "id"          = $ruleId
        "level"       = $level
        "description" = "System telemetry from $($data.host) ($($data.os_type)) - CPU: $($data.cpu_pct)%, RAM: $($data.ram_pct)%, Worst Disk: $($data.worst_disk_drive) ($($data.worst_disk_pct)%)"
        "groups"      = @("system_metrics", "performance", "system_health", "telemetry")
    }
    "decoder" = [ordered]@{ "name" = "system-metrics" }
    "data" = $data
}

$body = $doc | ConvertTo-Json -Depth 5 -Compress
$res = Invoke-RestMethod -Uri "https://localhost:9200/wazuh-alerts-4.x-$today/_doc" -Method Post -Headers $headers -Body $body
Write-Host "[SUCCESS] Ingested: $($res.result) with ID $($res._id)" -ForegroundColor Green
