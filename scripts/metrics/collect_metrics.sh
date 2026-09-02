#!/usr/bin/env bash
# ==============================================================================
# Enterprise Wazuh System Metrics Collector for Linux / Ubuntu 22
# RS Indriati Boyolali - IT Infrastructure & Security
# Features: Multi-Drive, Swap, Core Services Health, TCP Sockets
# ==============================================================================

HOSTNAME=$(hostname)
OS="linux"

# 1. CPU Usage (%)
CPU_IDLE=$(top -bn1 | grep -E "%Cpu\(s\)|Cpu\(s\)" | awk -F',' '{for(i=1;i<=NF;i++) if($i ~ /id/) print $i}' | awk '{gsub(/[^0-9.]/,""); print $1}')
if [ -n "$CPU_IDLE" ]; then CPU_USAGE=$(awk -v id="$CPU_IDLE" 'BEGIN {printf "%.1f", 100 - id}'); else CPU_USAGE=0.0; fi

# 2. RAM Usage (Physical Memory)
RAM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
RAM_USED=$(free -m | awk '/Mem:/ {print $3}')
if [ -n "$RAM_TOTAL" ] && [ "$RAM_TOTAL" -gt 0 ]; then
    RAM_PCT=$(awk -v used="$RAM_USED" -v total="$RAM_TOTAL" 'BEGIN {printf "%.1f", (used/total)*100}')
else
    RAM_TOTAL=0; RAM_USED=0; RAM_PCT=0.0
fi

# 3. Swap Memory Usage
SWAP_TOTAL=$(free -m | awk '/Swap:/ {print $2}')
SWAP_USED=$(free -m | awk '/Swap:/ {print $3}')
if [ -n "$SWAP_TOTAL" ] && [ "$SWAP_TOTAL" -gt 0 ]; then
    SWAP_PCT=$(awk -v used="$SWAP_USED" -v total="$SWAP_TOTAL" 'BEGIN {printf "%.1f", (used/total)*100}')
else
    SWAP_TOTAL=0; SWAP_USED=0; SWAP_PCT=0.0
fi

# 4. Multi-Drive Storage Auto-Discovery (All Mounted Partitions)
DISK_TOTAL_GB=0
DISK_USED_GB=0
WORST_DISK_PCT=0.0
WORST_DISK_MOUNT="/"
DISK_SUMMARY_LIST=()

while read -r total used avail pct mount; do
    t_gb=$(echo "$total" | tr -d 'G')
    u_gb=$(echo "$used" | tr -d 'G')
    p_num=$(echo "$pct" | tr -d '%')
    DISK_TOTAL_GB=$(awk -v t="$DISK_TOTAL_GB" -v add="$t_gb" 'BEGIN {printf "%.1f", t + add}')
    DISK_USED_GB=$(awk -v u="$DISK_USED_GB" -v add="$u_gb" 'BEGIN {printf "%.1f", u + add}')
    
    is_worse=$(awk -v p="$p_num" -v w="$WORST_DISK_PCT" 'BEGIN {print (p > w) ? 1 : 0}')
    if [ "$is_worse" -eq 1 ]; then
        WORST_DISK_PCT=$p_num
        WORST_DISK_MOUNT=$mount
    fi
    DISK_SUMMARY_LIST+=("$mount ($pct - $avail free)")
done < <(df -BG -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | awk 'NR>1 {print $2, $3, $4, $5, $6}')

if [ -n "$DISK_TOTAL_GB" ] && [ $(awk -v t="$DISK_TOTAL_GB" 'BEGIN {print (t > 0) ? 1 : 0}') -eq 1 ]; then
    GLOBAL_DISK_PCT=$(awk -v u="$DISK_USED_GB" -v t="$DISK_TOTAL_GB" 'BEGIN {printf "%.1f", (u/t)*100}')
else
    GLOBAL_DISK_PCT=0.0
fi
DISKS_SUMMARY=$(IFS=', '; echo "${DISK_SUMMARY_LIST[*]}")

# 5. Core Services Health Check
SERVICES_TO_CHECK=("wazuh-agent" "docker" "ssh" "sshd" "nginx" "apache2" "mysql" "mariadb" "postgresql")
CONFIG_FILE="/var/ossec/config/monitored_services.json"
if [ -f "$CONFIG_FILE" ]; then
    # Jika file json ada, baca list linux
    CUSTOM_SVCS=$(grep -A 20 '"linux"' "$CONFIG_FILE" | grep '"' | sed -e 's/.*"\(.*\)".*/\1/' -e '/linux/d')
    if [ -n "$CUSTOM_SVCS" ]; then
        SERVICES_TO_CHECK=($CUSTOM_SVCS)
    fi
fi

SERVICES_CHECKED=()
SERVICES_DOWN_LIST=()
for svc in "${SERVICES_TO_CHECK[@]}"; do
    if systemctl list-unit-files "$svc.service" 2>/dev/null | grep -q "$svc"; then
        if systemctl is-active --quiet "$svc"; then
            SERVICES_CHECKED+=("$svc:UP")
        else
            SERVICES_CHECKED+=("$svc:DOWN")
            SERVICES_DOWN_LIST+=("$svc")
        fi
    fi
done
SERVICES_SUMMARY=$(IFS=' | '; echo "${SERVICES_CHECKED[*]}")
if [ -z "$SERVICES_SUMMARY" ]; then SERVICES_SUMMARY="All Clean"; fi
SERVICES_DOWN_COUNT=${#SERVICES_DOWN_LIST[@]}
SERVICES_DOWN_NAMES=$(IFS=', '; echo "${SERVICES_DOWN_LIST[*]}")
if [ -z "$SERVICES_DOWN_NAMES" ]; then SERVICES_DOWN_NAMES="None"; fi

# 6. Active TCP Connections Count
ACTIVE_CONNS=$(ss -t state established 2>/dev/null | wc -l)
if [ -n "$ACTIVE_CONNS" ] && [ "$ACTIVE_CONNS" -gt 0 ]; then
    ACTIVE_CONNS=$((ACTIVE_CONNS - 1))
else
    ACTIVE_CONNS=0
fi

# 7. System Uptime (Hours)
UPTIME_SECONDS=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
UPTIME_HOURS=$(awk -v s="$UPTIME_SECONDS" 'BEGIN {printf "%.1f", s/3600}')

# 8. Top CPU Process
TOP_PROC=$(ps -eo comm,%cpu --sort=-%cpu 2>/dev/null | sed 1d | head -n1 | awk '{print $1" ("$2"%)"}')
if [ -z "$TOP_PROC" ]; then TOP_PROC="N/A"; fi

# 9. JSON Output
printf '{"integration":"system-metrics","host":"%s","os_type":"%s","cpu_pct":%s,"ram_used_mb":%s,"ram_total_mb":%s,"ram_pct":%s,"pagefile_pct":%s,"disk_used_gb":%s,"disk_total_gb":%s,"disk_pct":%s,"worst_disk_pct":%s,"worst_disk_drive":"%s","disks_summary":"%s","services_summary":"%s","services_down_count":%d,"services_down_names":"%s","active_connections":%d,"uptime_hours":%s,"top_process":"%s"}\n' \
    "$HOSTNAME" "$OS" "$CPU_USAGE" "$RAM_USED" "$RAM_TOTAL" "$RAM_PCT" "$SWAP_PCT" "$DISK_USED_GB" "$DISK_TOTAL_GB" "$GLOBAL_DISK_PCT" "$WORST_DISK_PCT" "$WORST_DISK_MOUNT" "$DISKS_SUMMARY" "$SERVICES_SUMMARY" "$SERVICES_DOWN_COUNT" "$SERVICES_DOWN_NAMES" "$ACTIVE_CONNS" "$UPTIME_HOURS" "$TOP_PROC"
