import json
import ssl
import urllib.request
from datetime import datetime, timezone, timedelta

INDEXER_URL = "https://localhost:9200"
AUTH_USER = "admin"
AUTH_PASS = "SecretPassword"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

import base64
auth_header = "Basic " + base64.b64encode(f"{AUTH_USER}:{AUTH_PASS}".encode()).decode()

headers = {
    "Content-Type": "application/json",
    "Authorization": auth_header
}

def push_real_series():
    index_name = f"wazuh-alerts-4.x-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
    base_time = datetime.now(timezone.utc)

    for i in range(6, -1, -1):
        point_time = (base_time - timedelta(minutes=i*2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        cpu_val = round(18.0 + (i * 2.5) % 15, 1)
        ram_used = 13200 + (i * 80)
        ram_pct = round((ram_used / 16209) * 100, 1)
        pagefile_pct = round(72.0 + (i * 0.8), 1)

        doc = {
            "@timestamp": point_time,
            "timestamp": point_time,
            "agent": {
                "id": "001",
                "name": "tes-win-11",
                "ip": "192.168.27.41"
            },
            "manager": {
                "name": "wazuh.manager"
            },
            "rule": {
                "id": "100100",
                "level": 3,
                "description": f"System telemetry from DATABASE-SERVER (windows) - CPU: {cpu_val}%, RAM: {ram_pct}%, Worst Disk: D: (96.5%)",
                "groups": ["system_metrics", "performance", "system_health", "telemetry"]
            },
            "decoder": {
                "name": "system-metrics"
            },
            "data": {
                "integration": "system-metrics",
                "host": "DATABASE-SERVER",
                "os_type": "windows",
                "cpu_pct": float(cpu_val),
                "ram_used_mb": int(ram_used),
                "ram_total_mb": 16209,
                "ram_pct": float(ram_pct),
                "pagefile_pct": float(pagefile_pct),
                "disk_used_gb": 869.4,
                "disk_total_gb": 915.5,
                "disk_pct": 95.0,
                "worst_disk_pct": 96.5,
                "worst_disk_drive": "D:",
                "disks_summary": "C: (91.2% - 18.9GB free), D: (96.5% - 12.1GB free), E: (95.7% - 15.1GB free)",
                "services_summary": "Docker:UP | WazuhSvc:UP",
                "services_down_count": 0,
                "services_down_names": "None",
                "active_connections": 64,
                "uptime_hours": 20.4,
                "top_process": "Docker Desktop (8888)"
            }
        }

        req = urllib.request.Request(
            f"{INDEXER_URL}/{index_name}/_doc",
            data=json.dumps(doc).encode(),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, context=ctx) as r:
            pass

    print("[SUCCESS] Real time-series points berhasil di-index!")

if __name__ == "__main__":
    push_real_series()
