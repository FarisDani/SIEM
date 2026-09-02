import json
import ssl
import urllib.request

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

def clean_data():
    query = {
        "query": {
            "match": {
                "agent.name": "ubuntu22-target"
            }
        }
    }
    req = urllib.request.Request(
        f"{INDEXER_URL}/wazuh-alerts-*/_delete_by_query",
        data=json.dumps(query).encode(),
        headers=headers,
        method="POST"
    )
    with urllib.request.urlopen(req, context=ctx) as res:
        data = json.loads(res.read().decode())
        print(f"[SUCCESS] Dihapus: {data.get('deleted', 0)} dokumen dummy Ubuntu.")

if __name__ == "__main__":
    clean_data()
