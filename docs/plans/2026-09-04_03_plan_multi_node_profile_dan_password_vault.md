# 🛡️ Enterprise Architecture Plan: Multi-Node SSH Device Tabs & Strict Password Vault
**RS Indriati Boyolali — IT Infrastructure & Hardware NOC Monitoring**  
**Document ID**: `2026-09-04_03`  
**Standard**: ISO/IEC 27001 Credential Protection & Enterprise Multi-Target Telemetry Architecture

---

## 1. 🎯 Executive Summary & Objectives

Sebagai arsitektur sistem pemantauan skala enterprise (*20+ Years Veteran SysAdmin Standards*), sistem monitoring NOC memerlukan:
1. **Strict Password Protection (Zero-Leak Credential Policy)**:
   - Password SSH wajib terproteksi penuh dalam bentuk titik-titik (`●●●●●●`), **tanpa tombol intip (eye toggle ditiadakan)**.
   - Kolom password **dikunci dari aksi Copy / Cut / Inspect Clipboard** (`oncopy="return false;"`, `oncut="return false;"`, `user-select: none;`).
   - Backend API tidak boleh mengirimkan password mentah (*plaintext*) saat query GET profil, hanya mengirimkan status verifikasi `hasPassword: true` dan hash/masker.
2. **Multi-Node Concurrent Profile & Top Tabbed Navigation**:
   - Menyimpan beberapa profil perangkat SSH yang sudah berhasil terhubung (misal: *Laptop Target 1*, *Laptop Target 2*, *PC Server Lokal*, *Server VM*).
   - Menjalankan **Multi-Threaded Concurrent SSH Poller Pool** di backend sehingga semua perangkat dipantau secara simultan dan independen di latar belakang.
   - Menyediakan **Top Multi-Device Tab Bar** di bagian paling atas dashboard untuk beralih instan antar perangkat hanya dengan satu klik.

---

## 2. 🏗️ Arsitektur Sistem Multi-Node Concurrent

```mermaid
graph TD
    subgraph Frontend_NOC [Enterprise NOC Dashboard UI]
        TAB[Top Multi-Device Tab Bar: Node 1 | Node 2 | Node 3 | + Add Device]
        DASH[Active Device Telemetry View: CPU Dials, Multi-SSD, RAM DIMMs, Windows Events]
        MODAL[Encrypted Profile Manager & Device Vault Modal]
    end

    subgraph Backend_Engine [server.py — Multi-Threaded Poller Pool]
        ROUTER[HTTP API Gateway :8088]
        POOL[Worker Pool: Daemon Threads]
        T1[Thread 1: Polling Laptop Acer 172.16.4.205]
        T2[Thread 2: Polling Local Host PC 127.0.0.1]
        T3[Thread 3: Polling Secondary Laptop 172.16.4.40]
        VAULT[(config.json — Saved Node Profiles Vault)]
        MEM[(In-Memory Telemetry Cache per Node)]
    end

    TAB -->|Switch Active Tab| ROUTER
    MODAL -->|Save / Edit Profile| ROUTER
    ROUTER --> VAULT
    ROUTER --> MEM
    POOL --> T1 & T2 & T3
    T1 & T2 & T3 -->|Update Telemetry| MEM
    MEM --> DASH
```

---

## 3. 🔒 Kebijakan Keamanan Password (Strict Password Vault)

| Fitur Keamanan | Implementasi Teknis |
| :--- | :--- |
| **Masking Penuh** | `type="password"`, `autocomplete="new-password"` — Karakter selalu ditampilkan sebagai `●●●●●●`. |
| **Peniadaan Tombol Intip** | Tombol 👁️ (Show/Hide Password) dihapus secara total agar tidak dapat dibuka di layar. |
| **Blokir Copy / Cut / Drag** | Atribut `oncopy="return false;"`, `oncut="return false;"`, `draggable="false"`, `style="user-select:none;"` mencegah ekstraksi password ke clipboard. |
| **Zero Plaintext In Transit (GET)** | Endpoint `GET /api/nodes` dan `GET /api/ssh-config` **TIDAK PERNAH** mengembalikan string password asli, hanya mengembalikan `hasPassword: true`. |
| **Preserve Password On Update** | Jika user mengedit nama/IP tanpa mengisi password baru, backend tetap mempertahankan password yang tersimpan aman. |

---

## 4. 💻 Struktur Multi-Profile Vault (`config.json`)

```json
{
  "active_node_id": "node_laptop_acer",
  "nodes": [
    {
      "id": "node_laptop_acer",
      "name": "Laptop Acer Nitro i5",
      "host": "172.16.4.205",
      "port": 22,
      "user": "laptop-69pj06ep\\acer",
      "password": "...",
      "key_path": "",
      "poll_interval_seconds": 2.0,
      "enabled": true
    },
    {
      "id": "node_local_pc",
      "name": "Local PC NOC Server",
      "host": "127.0.0.1",
      "port": 0,
      "user": "LOCAL",
      "password": "",
      "key_path": "",
      "poll_interval_seconds": 2.0,
      "enabled": true
    }
  ]
}
```

---

## 5. 🛠️ Rencana Perubahan Komponen

### A. Backend Engine: [`server.py`](file:///d:/Faris/Github/SEIM/hardware-dashboard/server.py)
1. **Multi-Threaded Worker Pool**:
   - Mengganti poller tunggal dengan `NodePollerManager` yang mengelola thread SSH independen untuk setiap profil node yang aktif.
2. **REST API Endpoints Baru**:
   - `GET /api/nodes`: Mengambil daftar semua profil perangkat beserta ringkasan status live (*Connected, Suhu, Latensi, Hostname*).
   - `POST /api/nodes`: Menambah atau memperbarui profil perangkat (dengan validasi password aman).
   - `DELETE /api/nodes?id=<node_id>`: Menghapus profil perangkat.
   - `GET /api/hardware-metrics?node=<node_id>`: Mengambil telemetri lengkap untuk node yang sedang dipilih pada tab aktif.

### B. Frontend Layout: [`index.html`](file:///d:/Faris/Github/SEIM/hardware-dashboard/index.html)
1. **Top Multi-Device Tab Bar**:
   - Menambahkan bar navigasi tab modern di paling atas dashboard:
     - Tab Badge Aktif: `[ 🟢 Laptop Acer Nitro (172.16.4.205) • 50°C • 24ms ]`
     - Tab Badge Lain: `[ 💻 Local Host PC • 42°C ]`
     - Tombol Tambah: `[ ➕ Tambah Perangkat SSH ]`
2. **Profile Manager & Device Modal**:
   - Modal input perangkat baru dengan kolom: Nama Alias Perangkat, IP Target, Port, Username, dan Password (dengan proteksi anti-copy & full dots).

### C. Frontend Controller: [`app.js`](file:///d:/Faris/Github/SEIM/hardware-dashboard/app.js)
1. **Multi-Tab Controller**:
   - Render tab perangkat secara dinamis dari API `/api/nodes`.
   - Menangani perpindahan tab aktif dengan *seamless transition* tanpa refresh halaman.
2. **Profile CRUD Handlers**:
   - Form submit untuk tambah/edit profil perangkat dan hapus profil dengan konfirmasi aman.
   - Validasi keamanan password di sisi client.

---

## 6. 🧪 Rencana Pengujian & Validasi

1. **Uji Keamanan Password**:
   - Memastikan password tidak bisa di-copy ke clipboard (`Ctrl+C` / Right Click Copy dinonaktifkan).
   - Memastikan tidak ada tombol untuk melihat password menjadi teks biasa.
   - Memastikan inspect network browser pada `GET /api/nodes` tidak memuat password asli.
2. **Uji Multi-Device Tab**:
   - Menambahkan 2 perangkat target berbeda.
   - Menguji klik antar tab: Memastikan sensor CPU, RAM, SSD, dan Event Logs berganti sesuai data perangkat yang dipilih secara instan.
3. **Uji Concurrent Polling**:
   - Memastikan background server memantau kedua perangkat secara bersamaan tanpa saling mengganggu atau blocking.
