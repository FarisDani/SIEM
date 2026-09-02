#!/usr/bin/env bash
# ==============================================================================
# Setup System Metrics Monitoring on Linux / Ubuntu Agent
# RS Indriati Boyolali - IT Infrastructure & Security
# ==============================================================================

if [ "$EUID" -ne 0 ]; then
  echo "Harap jalankan script ini dengan sudo: sudo bash setup_linux_metrics.sh"
  exit 1
fi

AGENT_DIR="/var/ossec"
SCRIPTS_DIR="$AGENT_DIR/scripts"
CONF_FILE="$AGENT_DIR/etc/ossec.conf"
SCRIPT_SRC="$(dirname "$0")/metrics/collect_metrics.sh"

echo "[1/4] Menyiapkan direktori scripts di agent..."
mkdir -p "$SCRIPTS_DIR"

echo "[2/4] Menyalin script collect_metrics.sh..."
if [ -f "$SCRIPT_SRC" ]; then
    cp "$SCRIPT_SRC" "$SCRIPTS_DIR/collect_metrics.sh"
else
    # Fallback jika dijalankan langsung via curl/wget
    cat << 'EOF' > "$SCRIPTS_DIR/collect_metrics.sh"
#!/usr/bin/env bash
HOSTNAME=$(hostname)
OS="linux"
CPU_IDLE=$(top -bn1 | grep -E "%Cpu\(s\)|Cpu\(s\)" | awk -F',' '{for(i=1;i<=NF;i++) if($i ~ /id/) print $i}' | awk '{gsub(/[^0-9.]/,""); print $1}')
if [ -n "$CPU_IDLE" ]; then CPU_USAGE=$(awk -v id="$CPU_IDLE" 'BEGIN {printf "%.1f", 100 - id}'); else CPU_USAGE=0.0; fi
RAM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
RAM_USED=$(free -m | awk '/Mem:/ {print $3}')
if [ -n "$RAM_TOTAL" ] && [ "$RAM_TOTAL" -gt 0 ]; then RAM_PCT=$(awk -v used="$RAM_USED" -v total="$RAM_TOTAL" 'BEGIN {printf "%.1f", (used/total)*100}'); else RAM_TOTAL=0; RAM_USED=0; RAM_PCT=0.0; fi
DISK_TOTAL_GB=$(df -BG / | awk 'NR==2 {gsub("G",""); print $2}')
DISK_USED_GB=$(df -BG / | awk 'NR==2 {gsub("G",""); print $3}')
DISK_PCT=$(df / | awk 'NR==2 {gsub("%",""); print $5}')
if [ -z "$DISK_TOTAL_GB" ]; then DISK_TOTAL_GB=0; fi
if [ -z "$DISK_USED_GB" ]; then DISK_USED_GB=0; fi
if [ -z "$DISK_PCT" ]; then DISK_PCT=0; fi
UPTIME_SECONDS=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
UPTIME_HOURS=$(awk -v s="$UPTIME_SECONDS" 'BEGIN {printf "%.1f", s/3600}')
TOP_PROC=$(ps -eo comm,%cpu --sort=-%cpu 2>/dev/null | sed 1d | head -n1 | awk '{print $1" ("$2"%)"}')
if [ -z "$TOP_PROC" ]; then TOP_PROC="N/A"; fi
printf '{"integration":"system-metrics","host":"%s","os":"%s","cpu_pct":%s,"ram_used_mb":%s,"ram_total_mb":%s,"ram_pct":%s,"disk_used_gb":%s,"disk_total_gb":%s,"disk_pct":%s,"uptime_hours":%s,"top_process":"%s"}\n' \
    "$HOSTNAME" "$OS" "$CPU_USAGE" "$RAM_USED" "$RAM_TOTAL" "$RAM_PCT" "$DISK_USED_GB" "$DISK_TOTAL_GB" "$DISK_PCT" "$UPTIME_HOURS" "$TOP_PROC"
EOF
fi

chmod +x "$SCRIPTS_DIR/collect_metrics.sh"

echo "[3/4] Menambahkan modul wodle command ke ossec.conf..."
if grep -q "system-performance" "$CONF_FILE"; then
    echo "[INFO] Modul system-performance sudah ada di $CONF_FILE"
else
    # Sisipkan sebelum </ossec_config>
    sed -i '/<\/ossec_config>/i \
  <!-- Real-Time System Metrics Monitoring -->\
  <wodle name="command">\
    <disabled>no</disabled>\
    <tag>system-performance</tag>\
    <command>/var/ossec/scripts/collect_metrics.sh</command>\
    <interval>30s</interval>\
    <run_on_start>yes</run_on_start>\
    <timeout>10</timeout>\
  </wodle>' "$CONF_FILE"
    echo "[OK] Modul system-performance berhasil ditambahkan ke ossec.conf"
fi

echo "[4/4] Merestart service wazuh-agent..."
systemctl restart wazuh-agent
echo "======================================================="
echo "[SUCCESS] Agent Linux berhasil dikonfigurasi & aktif!"
echo "======================================================="
