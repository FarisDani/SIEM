# ⚡ Enterprise Telemetry Plan: Optimasi Kode & Arsitektur Ultra-Low Latency Telemetry
**RS Indriati Boyolali — IT Infrastructure & Hardware NOC Monitoring**  
**Document ID**: `2026-10-19_02`  
**Status**: 📝 New Plan / Ready for Execution  
**Target Goal**: Memangkas latensi telemetri SSH dari ~2,900 ms menjadi **< 15–50 ms** (Realtime NOC Grade)  
**Standard**: High-Concurrency Non-Blocking Poller & Zero-Overhead Remote Probes  

---

## 1. 🔍 Root Cause Analysis: Mengapa Latensi Saat Ini Masih Tinggi?

Melalui inspeksi mendalam pada codebase `hardware-dashboard/server.py`, ditemukan 5 *bottleneck* utama yang menyebabkan latensi dan lonjakan angka ms di dashboard:

### A. Metrik Latensi Terkontaminasi oleh Eksekusi Inventory Berat (Paling Fatal)
Pada `server.py` baris 1487–1754:
```python
t0 = time.time()
# 1. Jalankan Quick Command...
# 2. Jika cycle_count % 4 == 0:
#       Jalankan Full Inventory (WMI, Disks, Partisi, EventLog, Ryzen Master, Top Processes)...
rtt_ms = round((time.time() - t0) * 1000, 1)  # <-- Latensi dihitung setelah SEMUA selesai!
```
* **Masalah**: Waktu eksekusi WMI dan PowerShell di remote host (yang memakan waktu 2–3 detik) **ikut terhitung ke dalam `latency_ms`**.
* **Dampak**: Operator melihat latensi melonjak hingga **2,900 ms** atau **26,000 ms**, padahal koneksi fisik jaringan sebenarnya hanya butuh 2–10 ms! Quick metric (CPU, RAM) ikut terblokir (*freeze*) setiap kali siklus inventory berjalan.

### B. Linux Target Menjalankan Runtime Python Berulang Kali
Pada `LINUX_QUICK_CMD`:
```python
LINUX_QUICK_CMD = f"python3 -c \"import base64; exec(base64.b64decode('{b64_lq}').decode('utf-8'))\""
```
* **Masalah**: Setiap detik, host Linux harus memanggil binary `python3`, mengalokasikan memori runtime Python, melakukan decode Base64, dan mengompilasi string.
* **Overhead**: Membuka proses Python di Linux memakan waktu **35–80 ms**. Padahal Linux kernel menyediakan semua metrik instan di `/proc/stat` yang bisa dibaca murni via Bash dalam **< 1 ms**!

### C. Nagle's Algorithm & TCP Socket Overhead
* **Masalah**: Library Paramiko secara default tidak mengaktifkan socket flag `TCP_NODELAY`. Protokol TCP menahan paket-paket kecil untuk digabung (*delayed ACK* 40–200 ms).
* Selain itu, terdapat baris kode yang membuka-tutup socket raw TCP tambahan setiap 3 siklus (`socket.create_connection`) yang membebani port firewall target.

### D. Windows Quick Probe Membaca Terlalu Banyak Objek WMI Secara Berulang
Pada target Windows, jika counter performa lambat, script melakukan fallback berulang ke `Get-CimInstance Win32_Processor`, `Get-Counter`, dan pemindaian MSAcpi thermal zone secara serial.

---

## 2. 🎯 Target Indikator Keberhasilan (KPI Optimasi)

| Parameter | Kondisi Saat Ini (Existing) | Target Pasca-Optimasi (Low-Latency) |
| :--- | :--- | :--- |
| **Realtime Telemetry Latency (LAN/Office)** | 800 ms – 2,950 ms (fluktuatif) | **5 ms – 25 ms** (stabil) |
| **Realtime Telemetry Latency (Linux VM / Host-Only)** | 120 ms – 350 ms | **< 3 ms** |
| **Quick Probe Update Interval** | Terblokir tiap siklus ke-4 (jeda 3s) | **1000 ms murni (Non-blocking)** |
| **Linux Remote CPU Footprint** | Spawn `python3` per-detik | **0% CPU** (Pure Kernel `/proc` reader) |
| **Jitter / Lonjakan Angka Latensi** | Sangat tinggi saat inventory run | **Hampir 0 (Pemisahan Thread Async)** |

---

## 3. 🛠️ Rencana Aksi Teknis (Action Items)

```
┌────────────────────────────────────────────────────────────────────────┐
│                    ARSITEKTUR DUAL-PIPELINE BARU                       │
├──────────────────────────────────┬─────────────────────────────────────┤
│   FAST PATH: Realtime Streamer   │     SLOW PATH: Background Worker    │
│   (Frekuensi: 1000ms / 1 Detik)  │     (Frekuensi: 20–30 Detik)        │
│                                  │                                     │
│  • CPU Load & Live Temp          │  • Win32_DiskDrive & Partisi Fisik  │
│  • RAM Used & Swap GiB           │  • RAM Module Part Number & Timings │
│  • Network Live KB/s (Rx/Tx)     │  • Top 25 Processes Tree            │
│  • Disk Active % & Throughput    │  • Windows Event Viewer Logs        │
│                                  │  • Active Network Sockets           │
│  [ Latensi Murni RTT: 5-15ms ]   │  [ Berjalan Asinkron di Background ]│
└──────────────────────────────────┴─────────────────────────────────────┘
```

### Langkah 1: Isolasi Pengukuran Latensi Jaringan Murni (Pure RTT)
* Pindahkan titik ukur `latency_ms` hanya pada durasi eksekusi *Quick Probe*:
  ```python
  t_quick_start = time.perf_counter()
  stdin, stdout, stderr = client.exec_command(active_quick_cmd, timeout=exec_quick_timeout)
  quick_output = stdout.read().decode("utf-8", errors="ignore")
  pure_rtt_ms = round((time.perf_counter() - t_quick_start) * 1000, 1)
  ```
* Nilai `latency_ms` yang tampil di dashboard menjadi murni waktu tempuh jaringan + sensor instan, tanpa tercampur waktu parsing WMI.

### Langkah 2: Decoupled Polling (Pemisahan Thread Inventory)
* Jangan biarkan *Full Inventory* memblokir loop *Quick Probe*.
* Buat *background inventory worker* terpisah per-node yang berjalan setiap **20–30 detik sekali** (karena kapasitas disk, modul RAM, dan BIOS tidak berubah setiap detik).
* Thread utama tetap mengirim telemetri live per-detik secara mulus dan konsisten tanpa jeda (*freeze*).

### Langkah 3: Optimasi Probe Linux Menjadi Native `/proc` Engine
Ganti pemanggilan `python3 -c` dengan Bash built-in one-liner super ringan:
```bash
# Pure Shell: 0 fork runtime Python, instan < 1 ms
cat << 'EOF'
read -r _ u n s i io ir st g < /proc/stat; total=$((u+n+s+i+io+ir+st+g)); idle=$((i+io));
echo "$HOSTNAME";
echo "$(( (total-idle)*100 / total ))";
grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs;
cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "__NA__";
EOF
```
* **Hasil**: Menghemat 100% overhead startup Python di target Linux VM/Server.

### Langkah 4: Optimasi Socket & Paramiko Transport
* Aktifkan flag `TCP_NODELAY` pada socket Paramiko:
  ```python
  transport = client.get_transport()
  if transport and transport.sock:
      transport.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
  ```
* Hapus probe socket raw buatan yang berjalan tiap 3 siklus untuk menghindari *socket port exhaustion*.

### Langkah 5: Optimasi Windows Probe (`quick_ps`)
* Ringkas perintah PowerShell quick probe agar hanya membaca counter performa utama tanpa memanggil cmdlet berat WMI secara serial.
* Simpan instance session counter jika memungkinkan, atau manfaatkan native batch parsing.

---

## 4. 📅 Rencana Tahapan Eksekusi (Execution Plan)

1. **Fase 1: Refactoring Pengukuran RTT & Socket TCP_NODELAY di `server.py`**
   - Memperbaiki kalkulasi `latency_ms` agar mencerminkan RTT cepat murni.
   - Mengaktifkan `TCP_NODELAY` pada Paramiko.
2. **Fase 2: Asynchronous Inventory Decoupling**
   - Memisahkan polling data berat (Disk/EventLog/Processes) ke background cycle interval 25 detik.
   - Memastikan thread realtime berdetak setiap 1 detik tanpa *stuttering*.
3. **Fase 3: Implementasi Native Shell Quick Probe untuk Linux Target**
   - Memperbarui `LINUX_QUICK_CMD` dari Python menjadi native Linux proc-reader.
4. **Fase 4: Verifikasi & Benchmark Pengujian**
   - Menguji latensi pada `node_96bb8bdc` (Acer Laptop), `node_d6f41b59` (Linux VM), dan `node_local_pc`.
   - Memastikan angka latensi di UI dashboard turun ke level *single-digit / low double-digit* ms.

---

## 5. 🚦 Persetujuan Eksekusi
- Dokumen rencana telah disimpan di repository: `docs/plans/2026-10-19_02_plan_optimasi_kode_dan_ultra_low_latency_telemetry.md`.
- Jika Anda menyetujui rencana optimasi ini, beri instruksi **"Lanjutkan eksekusi optimasi"** untuk segera kita terapkan ke kode program.
