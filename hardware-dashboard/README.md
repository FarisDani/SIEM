# ⚡ Dedicated Hardware Telemetry & Remote SSH Sensor NOC Dashboard
**RS Indriati Boyolali — IT Infrastructure & Hardware NOC**

Aplikasi **Hardware Monitoring Dashboard Standalone** yang dibangun khusus untuk memantau telemetri sensor fisik perangkat keras (*Hardware Sensors*) secara *real-time* baik dari **Local Host PC** maupun dari **Laptop Target via Remote SSH (Port 22)** tanpa perlu menginstall agent di laptop target.

---

## 🌟 Fitur Utama Dashboard

| Fitur | Deskripsi |
|---|---|
| **📡 Remote SSH Node Telemetry** | Memantau laptop target secara langsung melalui koneksi SSH (Port 22) dengan kalkulasi latensi RTT (ms). |
| **🔄 Live Node Switcher** | Beralih instan antara **Remote SSH Target**, **Local Host PC**, dan **Interactive Simulation Mode** dari header web. |
| **🌡️ Suhu (*Temperatures*)** | CPU Package & Cores, GPU Core/Hotspot, NVMe SSD, dan Motherboard/VRM dengan *Circular Radial Gauge* adaptif. |
| **💨 Kecepatan Kipas (*Fan Speeds*)** | Animasi putaran tachometer RPM dan % PWM untuk CPU Fan, GPU Fan, dan Case Fan (dengan alarm otomatis jika kipas macet `<400 RPM`). |
| **⚡ Voltase (*Power Delivery*)** | Visualisasi toleransi standar ATX / Baterai Laptop `+12.0V` (11.40V - 12.60V), `+5.0V`, `+3.3V`, CPU Vcore, dan total Wattage. |
| **🚨 Alerts & Incident Logs** | Banner alarm darurat dan log kejadian real-time yang dapat difilter (*ALL, CRITICAL, WARNING, INFO*). |
| **🕹️ Interactive Simulator** | Tombol uji instan untuk mendemokan kondisi *Overheat (96°C)*, *Kipas Macet (0 RPM)*, dan *Drop Voltase (10.6V)*. |

---

## 🚀 Cara Menjalankan Dashboard (Plug & Play)

### 1. Menjalankan Dashboard (1-Klik)
1. Buka folder ini di File Explorer: `d:\Faris\Github\SEIM\hardware-dashboard\`
2. Klik ganda file: **`start_hardware_dashboard.bat`**
3. Server otomatis berjalan dan browser Anda akan langsung membuka **`http://localhost:8088`**.

### 2. Menghubungkan Laptop Target via SSH
1. Ikuti panduan setup di: [`docs/panduan_setup_ssh_laptop_hardware_dashboard.md`](file:///d:/Faris/Github/SEIM/docs/panduan_setup_ssh_laptop_hardware_dashboard.md).
2. Di web dashboard `http://localhost:8088`, klik tombol ikon **⚙️ (Pengaturan SSH)** di kanan atas.
3. Masukkan **IP Laptop Target** dan **User SSH**, lalu klik **"Simpan & Hubungkan"**.
4. Status akan langsung berubah menjadi **`🟢 SSH CONNECTED`** lengkap dengan grafik suhu dan putaran kipas laptop target!

---

## 📁 Struktur Berkas

```
hardware-dashboard/
├── index.html                  <-- Frontend Single Page Application (Tailwind CSS)
├── styles.css                  <-- Styling Glassmorphism, Glow Neon, & Keyframe Animations
├── app.js                      <-- Logika Sensor Real-time, Rule Engine, & SSH Client Manager
├── server.py                   <-- Python Telemetry & SSH Remote Gateway Server (Port 8088)
├── config.json                 <-- Konfigurasi target SSH dan mode polling
├── start_hardware_dashboard.bat<-- Launcher 1-klik untuk Windows
└── README.md                   <-- Panduan ini
```
