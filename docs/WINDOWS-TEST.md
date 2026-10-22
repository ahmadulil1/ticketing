# Tes Remote Desktop di Windows

Checklist untuk verifies remote desktop Windows (fitur 1.1.1+).

## 1. Install

Di PC target (mis. ALDAMA):

1. Buka `https://ticketing.marisoncloud.com/download`
2. Jalankan `Ticketing_1.1.1_x64-setup.exe` (NSIS, installMode passive)
3. App jalan, pet muncul di pojok kanan bawah

> Auto-update **tidak** muncul untuk user 1.0.7 karena signing key updater
> diganti. Install manual sekali, setelah itu auto-update jalan normal.

## 2. Cek device terdaftar

Panel web → **Device**. PC target harus muncul dengan `os_name` berisi
"Windows". Kalau tidak muncul, berarti app belum sempat report (tunggu
beberapa detik, refresh).

## 3. Mulai sesi

1. Klik ikon 📹 di kartu device (atau tombol **Remote Desktop** di detail)
2. Di PC target, bar merah muncul di bawah pet:
   *"`<nama admin>` minta akses remote"* → klik **Izinkan**
3. Layar PC target harus tampil di browser dalam ~1 detik

## 4. Kontrol

| Aksi | Cara |
|---|---|
| Gerakkan kursor | Gerakkan mouse di layar viewer |
| Klik | Klik kiri / kanan di layar viewer |
| Ketik | Klik dulu layar viewer (fokus), lalu ketik |
| Shortcut | Ctrl+C / Ctrl+V / Alt+Tab harus jalan |

## 5. Kalau gagal

Semua error sisi client **dikirim ke server** dan muncul di panel web →
**Riwayat Remote** → kolom catatan. Jadi tak perlu buka devtools di PC target.

### Log file di PC target

Build release Windows tak punya console, jadi app menulis log ke file:

```
%LOCALAPPDATA%\com.ticketing.desktop\logs\ticketing-desktop.log
```

Isinya: versi app, status autostart, dan setiap error capture remote.
Kalau remote bermasalah, minta user kirim isi file ini.

> 1.1.3+: autostart **tak lagi** menggagalkan startup. Sebelumnya, kalau
> Windows menolak tulis registry (policy ketat / profil bersama), app mati
> total dan device tak pernah muncul. Sekarang app tetap jalan, cuma
> autostart yang tak aktif — isi log bilang "gagal aktifkan autostart".

| Pesan di Riwayat Remote | Arti & solusi |
|---|---|
| `Layar tampil hitam (PC terkunci atau sesi interaktif)` | PC terkunci, atau app jalan di sesi non-interaktif (RDP/service). Login di console fisik. |
| `GetDIBits gagal` | GDI tidak bisa baca layar. Coba jalankan app sebagai user yang sama, bukan lewat service. |
| `StretchBlt gagal` | Driver display bermasalah / display sedang dimatikan. |
| `SendInput ditolak Windows (UIPI?)` | Target aplikasi berjalan sebagai Administrator. Jalankan app biasa, atau Elevated juga untuk target. |
| `Session ... tidak aktif` | Sesi sudah berakhir di server (timeout 30 menit idle). |
| Tidak ada catatan, tapi layar tak muncul | Viewer belum subscribe. Tutup & buka ulang viewer, cek WS di panel admin. |

### Batas Windows yang tak bisa dielakkan

- **Layar UAC dan lock screen** tidak bisa ditangkap atau dikontrol.
- **Window yang berjalan sebagai Administrator** tidak bisa disuntik input dari
  app biasa (UIPI). Sama sebaliknya: app Elevated tak bisa disuntik input ke
  window biasa.
- **Multi-monitor**: versi ini memakai monitor utama saja.
- **DPI**: app sudah di-set Per-Monitor Aware V2, jadi capture resolusi
  penuh dan koordinat mouse akurat di layar berskala 125–150%.

## 6. Kalau mau diagnosa dari server

```bash
journalctl -u ticketing-api --since '5 min ago' | grep -E 'ws-remote|relay'
```

- `[ws-remote] subscribed remote:<deviceId>` → device tersambung
- `[ws-remote] relay remote_frame -> N clients` → frame mengalir (N = viewer aktif)
- Relay frame terus 0 → capture di sisi device bermasalah
