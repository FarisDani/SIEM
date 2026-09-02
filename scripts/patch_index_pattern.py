import json
import ssl
import urllib.request

DASHBOARD_URL = "https://localhost:443"
AUTH_USER = "admin"
AUTH_PASS = "SecretPassword"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def main():
    import base64
    auth_header = "Basic " + base64.b64encode(f"{AUTH_USER}:{AUTH_PASS}".encode()).decode()

    headers = {
        "osd-xsrf": "true",
        "Content-Type": "application/json",
        "Authorization": auth_header
    }

    print("[1] Mengambil index-pattern wazuh-alerts-*...")
    req = urllib.request.Request(
        f"{DASHBOARD_URL}/api/saved_objects/index-pattern/wazuh-alerts-*",
        headers=headers,
        method="GET"
    )
    
    with urllib.request.urlopen(req, context=ctx) as response:
        data = json.loads(response.read().decode())

    attributes = data.get("attributes", {})
    fields_str = attributes.get("fields", "[]")
    fields = json.loads(fields_str)
    
    existing_names = {f.get("name") for f in fields}
    print(f"Total field eksis: {len(fields)}")

    new_fields = [
        {"name": "data.cpu_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.ram_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.pagefile_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.swap_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.disk_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.worst_disk_pct", "type": "number", "esTypes": ["float", "double", "long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.ram_used_mb", "type": "number", "esTypes": ["long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.ram_total_mb", "type": "number", "esTypes": ["long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.disk_used_gb", "type": "number", "esTypes": ["float", "double"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.disk_total_gb", "type": "number", "esTypes": ["float", "double"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.services_down_count", "type": "number", "esTypes": ["long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.active_connections", "type": "number", "esTypes": ["long", "integer"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.uptime_hours", "type": "number", "esTypes": ["float", "double"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.worst_disk_drive", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.disks_summary", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.services_summary", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.services_down_names", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.top_process", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.host", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.os_type", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
        {"name": "data.integration", "type": "string", "esTypes": ["keyword"], "scripted": False, "searchable": True, "aggregatable": True, "readFromDocValues": True},
    ]

    added = 0
    for nf in new_fields:
        if nf["name"] not in existing_names:
            fields.append(nf)
            added += 1
            print(f"  + Menambahkan field: {nf['name']}")

    print(f"[2] Menambahkan {added} field metrik baru. Mengupdate index-pattern...")
    attributes["fields"] = json.dumps(fields)

    put_data = json.dumps({"attributes": attributes}).encode()
    put_req = urllib.request.Request(
        f"{DASHBOARD_URL}/api/saved_objects/index-pattern/wazuh-alerts-*",
        data=put_data,
        headers=headers,
        method="PUT"
    )

    with urllib.request.urlopen(put_req, context=ctx) as put_res:
        print(f"[SUCCESS] Index pattern wazuh-alerts-* berhasil diperbarui! Status: {put_res.status}")

if __name__ == "__main__":
    main()
