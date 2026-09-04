import paramiko
import json

cfg = json.load(open('config.json'))
ssh_cfg = cfg['ssh']

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    hostname=ssh_cfg['host'],
    port=ssh_cfg['port'],
    username=ssh_cfg['user'],
    password=ssh_cfg['password'],
    timeout=5.0
)

# 1 simple, rock-solid powershell command without nested quote escaping issues
clean_cmd = 'powershell -NoProfile -Command "hostname; (Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue).CurrentTemperature; (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue).Name; (Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).EstimatedChargeRemaining; (Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).DesignVoltage"'

stdin, stdout, stderr = client.exec_command(clean_cmd)
lines = [l.strip() for l in stdout.read().decode('utf-8', errors='ignore').splitlines() if l.strip()]
print("PARSED LINES:", lines)
client.close()
