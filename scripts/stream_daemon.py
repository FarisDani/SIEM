import os
import sys
import json
import time
import ssl
import subprocess
import urllib.request
from datetime import datetime, timezone

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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COLLECTOR_PS1 = os.path.join(SCRIPT_DIR, "metrics", "collect_metrics.ps1")

def run_collector():
    cmd = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", COLLECTOR_PS1
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    output = res.stdout.strip()
    if output.startswith("{") and output.endswith("}"):
        return json.loads(output)
    return None

def send_metric(data):
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    index_name = f"wazuh-alerts-4.x-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"

    cpu = data.get("cpu_pct", 0.0)
    ram_pct = data.get("ram_pct", 0.0)
    worst_disk_pct = data.get("worst_disk_pct", 0.0)
    worst_disk_drive = data.get("worst_disk_drive", "C:")
    services_down_count = data.get("services_down_count", 0)

    rule_id = "100100"
    level = 3
    if services_down_count > 0:
        rule_id = "100105"
        level = 12
    elif worst_disk_pct > 90.0:
        rule_id = "100103"
        level = 10
    elif data.get("pagefile_pct", 0.0) > 85.0:
        rule_id = "100106"
        level = 9
    elif ram_pct > 90.0:
        rule_id = "100102"
        level = 8
    elif cpu > 85.0:
        rule_id = "100101"
        level = 7

    doc = {
        "@timestamp": now_iso,
        "timestamp": now_iso,
        "agent": {
            "id": "001",
            "name": "tes-win-11",
            "ip": "192.168.27.41"
        },
        "manager": {
            "name": "wazuh.manager"
        },
        "rule": {
            "id": rule_id,
            "level": level,
            "description": f"System telemetry from {data.get('host', 'DATABASE-SERVER')} ({data.get('os_type', 'windows')}) - CPU: {cpu}%, RAM: {ram_pct}%, Worst Disk: {worst_disk_drive} ({worst_disk_pct}%)",
            "groups": ["system_metrics", "performance", "system_health", "telemetry"]
        },
        "decoder": {
            "name": "system-metrics"
        },
        "data": data
    }

    req = urllib.request.Request(
        f"{INDEXER_URL}/{index_name}/_doc",
        data=json.dumps(doc).encode(),
        headers=headers,
        method="POST"
    )
    with urllib.request.urlopen(req, context=ctx) as res:
        return res.status

def main():
    print("=" * 60)
    print("  ENTERPRISE NOC TELEMETRY STREAMER (30s Interval)")
    print("=" * 60)
    
    # 1. First immediate run
    try:
        data = run_collector()
        if data:
            send_metric(data)
            now_str = datetime.now().strftime("%H:%M:%S")
            print(f"[{now_str}] [OK] Telemetri terkirim: CPU {data.get('cpu_pct')}%, RAM {data.get('ram_pct')}%, Worst Disk: {data.get('worst_disk_drive')} ({data.get('worst_disk_pct')}%)")
    except Exception as e:
        print(f"[ERROR] {e}")

    # 2. Continuous loop
    if len(sys.argv) > 1 and sys.argv[1] == "--loop":
        while True:
            time.sleep(30)
            try:
                data = run_collector()
                if data:
                    send_metric(data)
                    now_str = datetime.now().strftime("%H:%M:%S")
                    print(f"[{now_str}] [OK] Telemetri terkirim: CPU {data.get('cpu_pct')}%, RAM {data.get('ram_pct')}%, Worst Disk: {data.get('worst_disk_drive')} ({data.get('worst_disk_pct')}%)")
            except Exception as e:
                print(f"[ERROR] {e}")

if __name__ == "__main__":
    main()
