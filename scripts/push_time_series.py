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

def push_series():
    index_name = f"wazuh-alerts-4.x-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
    base_time = datetime.now(timezone.utc)

    # Kirim 6 data point ke belakang (setiap 2 menit)
    for i in range(6, -1, -1):
        point_time = (base_time - timedelta(minutes=i*2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        
        # Windows Agent (tes-win-11)
        cpu_win = 22.0 + (i * 3.5) % 30
        ram_used_win = 11800 + (i * 200)
        doc_win = {
            "@timestamp": point_time,
            "timestamp": point_time,
            "agent": {"id": "001", "name": "tes-win-11", "ip": "192.168.27.41"},
            "manager": {"name": "wazuh.manager"},
            "rule": {
                "id": "100100",
                "level": 3,
                "description": f"System performance telemetry from DATABASE-SERVER (windows) - CPU: {cpu_win}%, RAM: 78.5%, Disk: 91.1%",
                "groups": ["system_metrics", "performance", "system_health", "telemetry"]
            },
            "decoder": {"name": "system-metrics"},
            "data": {
                "integration": "system-metrics",
                "host": "DATABASE-SERVER",
                "os_type": "windows",
                "cpu_pct": float(round(cpu_win, 1)),
                "ram_used_mb": ram_used_win,
                "ram_total_mb": 16209,
                "ram_pct": float(round((ram_used_win / 16209) * 100, 1)),
                "disk_used_gb": 196.0,
                "disk_total_gb": 215.0,
                "disk_pct": 91.1,
                "uptime_hours": 19.8,
                "top_process": "Docker Desktop (8888)"
            }
        }
        
        # Linux Agent (ubuntu22-target)
        cpu_lin = 10.0 + (i * 4.2) % 25
        ram_used_lin = 980 + (i * 50)
        doc_lin = {
            "@timestamp": point_time,
            "timestamp": point_time,
            "agent": {"id": "002", "name": "ubuntu22-target", "ip": "192.168.27.45"},
            "manager": {"name": "wazuh.manager"},
            "rule": {
                "id": "100100",
                "level": 3,
                "description": f"System performance telemetry from ubuntu22-srv (linux) - CPU: {cpu_lin}%, RAM: 28.1%, Disk: 28.3%",
                "groups": ["system_metrics", "performance", "system_health", "telemetry"]
            },
            "decoder": {"name": "system-metrics"},
            "data": {
                "integration": "system-metrics",
                "host": "ubuntu22-srv",
                "os_type": "linux",
                "cpu_pct": float(round(cpu_lin, 1)),
                "ram_used_mb": ram_used_lin,
                "ram_total_mb": 3920,
                "ram_pct": float(round((ram_used_lin / 3920) * 100, 1)),
                "disk_used_gb": 8.5,
                "disk_total_gb": 30.0,
                "disk_pct": 28.3,
                "uptime_hours": 48.2,
                "top_process": "wazuh-agent (120)"
            }
        }

        for d in [doc_win, doc_lin]:
            req = urllib.request.Request(
                f"{INDEXER_URL}/{index_name}/_doc",
                data=json.dumps(d).encode(),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, context=ctx) as r:
                pass

    print("[SUCCESS] Time-series points berhasil di-index!")

if __name__ == "__main__":
    push_series()
