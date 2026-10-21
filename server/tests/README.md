# Test Server

Skrip test integrasi untuk backend Ticketing. Jalankan **di server** (butuh `pg`, `ws`, `bcrypt` dari `node_modules` app):

```bash
# salin ke server lalu jalankan dari /opt/ticketing
cp server/tests/remote-desktop.test.mjs   root@192.168.0.100:/opt/ticketing/
cp server/tests/internal-notes.test.mjs   root@192.168.0.100:/opt/ticketing/
cp server/tests/remote-timeout.test.mjs   root@192.168.0.100:/opt/ticketing/
cd /opt/ticketing && node remote-desktop.test.mjs
```

| File | Yang diuji |
|------|-------------|
| `remote-desktop.test.mjs` | Auth device secret, guard REST, guard WS, sesi remote, relay frame (device→agent), relay input (agent→device), patch status, `remote_ended`, riwayat, timeout 30 menit |
| `remote-timeout.test.mjs` | Sesi idle > 30 menit ditandai `timeout` **dan** device menerima `remote_ended` (biar app berhenti capture, bukan lanjut 24 jam) |
| `internal-notes.test.mjs` | Catatan internal tidak bocor ke tamu: filter GET, filter unread, tidak bisa kirim internal, WS push tidak menyalin internal ke tamu, agent tetap dapat |

Keduanya membersihkan data test sendiri di akhir. Keduanya **tidak** butuh JWT admin yang valid — skrip membuat user admin test sendiri lalu menghapusnya.

## Verifikasi manual remote desktop

1. Jalankan app desktop di PC target (`desktop/src-tauri/target/debug/ticketing-desktop`).
2. Login ke web admin → menu **Device** → klik device → **Remote Desktop**.
3. Di PC target akan muncul bar merah di bawah pet: *"X minta akses remote"* → klik **Izinkan**.
4. Klik **Buka Viewer** di web admin → layar PC target tampil live; gerakkan mouse/ketik di gambar → terkontrol di PC target.
5. Tombol **Hentikan** di bar merah pet mengakhiri sesi.
