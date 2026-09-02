import json
import ssl
import time
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

def push_doc(agent_id, agent_name, agent_ip, host, os_type, cpu, ram_used, ram_total, disk_used, disk_total, top_proc):
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    index_name = f"wazuh-alerts-4.x-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"

    ram_pct = round((ram_used / ram_total) * 100, 1)
    disk_pct = round((disk_used / disk_total) * 100, 1)

    rule_id = "100100"
    level = 3
    if cpu > 85:
        rule_id = "100101"
        level = 7
    elif ram_pct > 90:
        rule_id = "100102"
        level = 8
    elif disk_pct > 90:
        rule_id = "100103"
        level = 10

    doc = {
        "@timestamp": now_iso,
        "timestamp": now_iso,
        "agent": {
            "id": agent_id,
            "name": agent_name,
            "ip": agent_ip
        },
        "manager": {
            "name": "wazuh.manager"
        },
        "rule": {
            "id": rule_id,
            "level": level,
            "description": f"System performance telemetry from {host} ({os_type}) - CPU: {cpu}%, RAM: {ram_pct}%, Disk: {disk_pct}%",
            "groups": ["system_metrics", "performance", "system_health", "telemetry"]
        },
        "decoder": {
            "name": "system-metrics"
        },
        "data": {
            "integration": "system-metrics",
            "host": host,
            "os_type": os_type,
            "cpu_pct": float(cpu),
            "ram_used_mb": int(ram_used),
            "ram_total_mb": int(ram_total),
            "ram_pct": float(ram_pct),
            "disk_used_gb": float(disk_used),
            "disk_total_gb": float(disk_total),
            "disk_pct": float(disk_pct),
            "uptime_hours": 19.5,
            "top_process": top_proc
        }
    }

    req = urllib.request.Request(
        f"{INDEXER_URL}/{index_name}/_doc",
        data=json.dumps(doc).encode(),
        headers=headers,
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, context=ctx) as res:
            return res.status
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.read().decode()}")
        raise

def main():
    print("[1] Mengirim telemetri agent Windows 11 (tes-win-11)...")
    push_doc("001", "tes-win-11", "192.168.27.41", "DATABASE-SERVER", "windows", 28.5, 12400, 16209, 196.0, 215.0, "Docker Desktop (8888)")
    
    print("[2] Mengirim telemetri agent Ubuntu 22 (ubuntu22-target)...")
    push_doc("002", "ubuntu22-target", "192.168.27.45", "ubuntu22-srv", "linux", 12.4, 1024, 3920, 8.5, 30.0, "wazuh-agent (120)")

    print("[SUCCESS] Data telemetri berhasil dikirim ke Indexer!")

if __name__ == "__main__":
    main()
