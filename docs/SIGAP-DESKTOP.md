# Integrasi SIGAP di Aplikasi Ticketing Desktop

Rujukan kontrak: `DESKTOP_STAGING_CONTRACT.md` (SIGAP Desktop Staging Contract,
2026-10-22, AUTH-09 / Issue #718).

Integrasi ada **di dalam aplikasi Ticketing Tauri yang sudah ada** — tidak ada
aplikasi desktop SIGAP terpisah. Admin tetap lewat web.

## Arsitektur

```
Frontend (React)          Rust (Tauri)                       SIGAP staging
-----------------          -----------------------------       --------------------
panel notifikasi  ─IPC──> pairing / token / refresh          POST /api/desktop/pairings
badge unread             polling notifikasi (1 loop)  ─HTTP─> POST /api/desktop/token
klik notifikasi          secure store (Credential Manager/    GET  /api/desktop/me
                          Keychain)                            GET  /api/desktop/notifications
                                                            POST /api/desktop/refresh
                                                            POST /api/desktop/logout
```

Aturan yang dijaga:

- **Token hanya hidup di Rust.** Access token hanya di memori; refresh token
  disimpan di Windows Credential Manager / macOS Keychain (crate `keyring`).
  Tidak ada token di localStorage, store frontend, log, atau telemetry.
- **Frontend tak pernah pegang kredensial.** Semua request HTTP ber-kredensial
  dilakukan Rust ke origin staging persis (`https://sigap.marison-testing.biz.id`),
  tanpa mengikuti redirect, tanpa cookie, tanpa kredensial di query string.
- **Satu loop notifikasi per akun**, hidup di state Rust (bukan per window),
  interval 30 detik + jitter, backoff saat 429/5xx/offline.
- **Pairing** dibuat di Rust: verifier acak 43 karakter (URL-safe),
  `S256 = BASE64URL_NO_PAD(SHA256(verifier))`, installation UUID persisten per
  pengguna OS, nama perangkat dari hostname (hostname hanya metadata tampilan).
- **Persetujuan lewat browser sistem**: `verification_uri` divalidasi dulu
  (HTTPS, host staging persis, path `/desktop/authorize`, query `request` UUID)
  baru dibuka. Tidak ada deep link, tidak ada local listener.
- **Notifikasi dibaca ≠ ditandai terbaca.** `/notifications/:id/read` hanya
  dipanggil saat pengguna membuka notifikasi.
- **Klik notifikasi** membuka origin staging + `path` tervalidasi (relatif,
  tanpa `..`, tanpa karakter kontrol) di browser sistem. Tanpa token di URL.
- **Popup layar terkunci default generik** ("SIGAP / Ada notifikasi baru");
  isi detail bisa diaktifkan pengguna lewat toggle.

## Berkas

| Berkas | Isi |
|---|---|
| `desktop/src-tauri/src/sigap/consts.rs` | Konstanta kontrak (origin, client id, interval) |
| `desktop/src-tauri/src/sigap/client.rs` | Klien HTTP + tipe payload/respons kontrak |
| `desktop/src-tauri/src/sigap/creds.rs` | Credential Manager / Keychain |
| `desktop/src-tauri/src/sigap/mod.rs` | State, commands, pairing, refresh single-flight |
| `desktop/src-tauri/src/sigap/notify.rs` | Loop polling, pagination, seen-ID, popup |
| `desktop/src-tauri/src/sigap/tests.rs` | Tes kontrak (mock server lokal) |
| `desktop/src/services/sigap.ts` | Bridges IPC (tanpa token) |
| `desktop/src/components/SigapPanel.tsx` | UI: pairing, inbox, status, preferensi |

## Build

### Windows (cross-compile dari macOS)

```bash
brew install nsis lld llvm
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin

export PATH="/usr/local/opt/llvm/bin:/usr/local/opt/lld/bin:$HOME/.cargo/bin:$PATH"
export XWIN_ACCEPT_LICENSE=1
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ticketing.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.tauri/ticketing.key.password)"

cd desktop
npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

Hasil: `desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
Skrip lengkap: `scripts/build-windows-mac.sh`.

### macOS

```bash
cd desktop && npm run tauri build -- --bundles app
```

> **Status 1.1.12: build & tes macOS belum dijalankan** (staging macOS ditunda).
> Lihat bagian "Batas yang belum diuji".

## Tes

### Otomatis (Rust, mock server lokal)

```bash
cd desktop/src-tauri && cargo test
```

15 tes: challenge S256 (vektor RFC 7636), verifier acak, validasi
`verification_uri` (menolak http/host lain/path lain/request bukan UUID),
validasi `path` (menolak cross-origin, `..`, kontrol karakter), payload pairing,
polling token (202 pending / 429 slow_down / 401 ditolak), parsing token sukses,
paginasi + cursor `before`, `mark_read` dengan Bearer, `me`, redirect lintas
origin tidak diikuti, dan logika pagination (berhenti di ID lama, dedup ID,
baseline ambil semua halaman).

### Manual (paket terpasang di Windows)

Checklist di bawah. Semua dijalankan dari **paket terpasang** (bukan dev
server), di staging.

| # | Skenario | Yang diharapkan | Status |
|---|---|---|---|
| 1 | Pairing: klik "Hubungkan SIGAP" | Kode 8 digit tampil, browser SIGAP terbuka | belum |
| 2 | Setujui perangkat di browser | Status jadi "Terhubung", nama akun muncul | belum |
| 3 | Kode salah / tolak di browser | Status "Sesi berakhir", ada pesan alasan | belum |
| 4 | Tidak menyetujui dalam 5 menit | Kode kedaluwarsa, status kembali "Tak terhubung" | belum |
| 5 | Restart aplikasi | Sesi tetap (token tersimpan di Credential Manager) | belum |
| 6 | Refresh token | otomatis, tanpa diminta user | belum |
| 7 | Ganti password SIGAP | sesi desktop berakhir, minta hubungkan ulang | belum |
| 8 | Izin notifikasi ditolak | panel tetap jalan, inbox tetap terisi, ada pemberitahuan izin | belum |
| 9 | Izin notifikasi diizinkan | popup native muncul (bukti OS, bukan browser) | belum |
| 10 | Offline lalu online | backlog tertangkap, tanpa duplikat | belum |
| 11 | Notifikasi > 50 | paginasi jalan, tak ada item hilang/duplikat | belum |
| 12 | Klik notifikasi | browser terbuka di origin staging + path, item jadi terbaca | belum |
| 13 | Logout | kredensial lokal hilang, sesi dicabut di server | belum |
| 14 | Ganti akun | pairing ulang, notifikasi akun lama tidak muncul | belum |
| 15 | Dua window terbuka | notifikasi tidak tampil dua kali | belum |
| 16 | Cabut perangkat dari Settings SIGAP | akses berikutnya ditolak (401) | belum |

Semua uji memakai **staging**, tidak boleh production.

## Bukti

| Bukti | Status |
|---|---|
| Tes kontrak Rust (15 pass) | `cd desktop/src-tauri && cargo test` |
| Tampilan panel (terputus) | `docs/screenshots/sigap-panel-terputus.png` |
| Tampilan inbox + kode pairing | belum — butuh route staging aktif |
| Popup native Windows | belum — harus dari paket terpasang |
| Popup native macOS | belum (staging macOS ditunda) |

## Mismatch ke tim SIGAP (per 2026-10-22)

`https://sigap.marison-testing.biz.id` hidup, `/desktop/authorize` ada, tapi
**seluruh route `/api/desktop/*` membalas 404**:

```
GET  /api/desktop/me             -> 404 {"error":"Not found","requestId":"req-2ab"}
POST /api/desktop/pairings        -> 404 {"error":"Not found","requestId":"req-2a8"}
POST /api/desktop/token           -> 404
GET  /api/desktop/notifications   -> 404
POST /api/desktop/refresh         -> 404
POST /api/desktop/logout          -> 404
```

Artinya route desktop belum di-deploy/aktif di staging (kontrak menyebut
"Rollback app routes to disabled"). Klien desktop sudah siap; pairing tak bisa
rampung sampai route diaktifkan. Klien **tidak** membuat endpoint/field
sendiri dan tidak melewati validasi apa pun.

## Batas yang belum diuji

- **Popup native Windows**: belum dibuktikan dari paket terpasang. Tes browser
  tak membuktikan notifikasi native.
- **Popup native macOS**: belum diuji (staging macOS ditunda).
- **Login/ditolak/kedaluwarsa dari server sungguhan**: belum diuji, karena
  route staging 404.
- **Password SIGAP diubah / pencabutan dari Settings**: belum diuji.
- **Catch-up offline besar**: logika pagination ada tesnya, tapi belum diuji
  terhadap server sungguhan.
- **Aplikasi benar-benar ditutup**: tidak menerima popup (butuh WNS/APNs —
  di luar scope kontrak ini). Ditampilkan eksplisit di panel.
- **Multi-window**: loop notifikasi di Rust (satu per proses), tapi belum
  diuji dengan dua window terbuka bersamaan.
- Installer belum punya sertifikat Authenticode, jadi SmartScreen masih
  menagih sekali saat instalasi.
