import sys
import json
import ssl
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

def main():
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        return

    try:
        data = json.loads(raw_input)
    except Exception as e:
        return

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    index_name = f"wazuh-alerts-4.x-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"

    cpu = data.get("cpu_pct", 0.0)
    ram_pct = data.get("ram_pct", 0.0)
    worst_disk_pct = data.get("worst_disk_pct", 0.0)
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
            "description": f"System telemetry from {data.get('host', 'Windows')} ({data.get('os_type', 'windows')}) - CPU: {cpu}%, RAM: {ram_pct}%, Worst Disk: {data.get('worst_disk_drive', 'C:')} ({worst_disk_pct}%)",
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
    try:
        with urllib.request.urlopen(req, context=ctx) as res:
            pass
    except Exception:
        pass

if __name__ == "__main__":
    main()
