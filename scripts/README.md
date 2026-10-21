# Panduan Rilis Desktop App

Rilis desktop app punya 3 bagian: **build**, **distribusi**, **manifest updater**.
Semua harus berurutan — kalau manifest ditulis duluan, user versi lama akan
download file yang belum ada.

```
build (Windows)  ->  upload (GitHub Release)  ->  manifest (server)  ->  user update
```

---

## 1. Build

### Opsi A — di mesin Windows (paling praktis)

```powershell
git fetch origin
git checkout release/1.1.0
git pull
powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Version 1.1.0
```

Script itu: cari signing key → `npm run tauri build` → upload `.exe` + `.sig`
ke GitHub Release (pakai `gh` CLI).

### Opsi B — GitHub Actions

1. Repo → **Settings → Secrets and variables → Actions** → New repository secret:
   - `TAURI_SIGNING_PRIVATE_KEY` → isi file private key Tauri
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → password key (boleh kosong)
2. **Actions → Rilis Windows → Run workflow** → isi versi.
   Workflow ini juga jalan otomatis kalau push tag: `git tag v1.1.0 && git push origin v1.1.0`.

Hasil: `desktop/src-tauri/target/release/bundle/nsis/Ticketing_<versi>_x64-setup.exe`
(+ `.sig`).

> **Penting:** tanpa `.sig`, Tauri updater akan menolak file itu. Kalau `TAURI_SIGNING_PRIVATE_KEY`
> kosong, build tetap jalan tapi tidak menghasilkan `.sig` — rilis jadi tidak bisa
> auto-update.

### Signing key

Key privat Tauri tidak ada di repo (harus dirahasiakan). Kalau hilang:

```bash
npm run tauri signer generate -w ~/.tauri/ticketing.key -p <password>
```

Lalu **ganti `pubkey`** di `desktop/src-tauri/tauri.conf.json` dengan public key
baru. Konsekuensinya: user versi lama (1.0.7) **tidak bisa auto-update** ke
rilis baru — mereka harus install manual sekali. Setelah itu auto-update normal
lagi.

---

## 2. Distribusi

Aset taruh di GitHub Release (tag `v<versi>`):
- `Ticketing_<versi>_x64-setup.exe`
- `Ticketing_<versi>_x64-setup.exe.sig`

macOS: `Ticketing_<versi>_x64.dmg` (opsional, buat user mac).

---

## 3. Manifest updater (server)

Server menyajikan `/downloads/latest.json` — inilah yang dibaca aplikasi buat
cek versi.

```bash
# di server (atau dari mesin lain yang bisa akses)
node scripts/release.cjs --version 1.1.0 --from-github
```

Script itu:
1. tarik `.exe` + `.sig` dari GitHub Release
2. salin ke `/var/www/ticketing/downloads/` (nama ber-versi **dan** `Ticketing-setup.exe`)
3. tulis `latest.json` — versi, catatan, signature dari file `.sig`, URL download
4. platform lain di manifest lama tetap dipertahankan (merge)

Alternatif kalau file sudah ada di server:

```bash
node scripts/release.cjs --version 1.1.0 --exe /tmp/Ticketing_1.1.0_x64-setup.exe
```

Cek hasilnya:

```bash
curl -s https://ticketing.marisoncloud.com/downloads/latest.json
```

---

## Link download (stabil)

| Link | Isi |
|---|---|
| `https://ticketing.marisoncloud.com/download` | 302 → installer Windows terbaru |
| `https://ticketing.marisoncloud.com/downloads/Ticketing-setup.exe` | installer Windows terbaru |
| `https://ticketing.marisoncloud.com/downloads/Ticketing_<versi>_x64-setup.exe` | versi tertentu |
| `https://ticketing.marisoncloud.com/downloads/Ticketing.dmg` | installer macOS |
| `https://ticketing.marisoncloud.com/downloads/latest.json` | manifest updater |

Link `/download` dipakai juga tombol download di panel web admin.

---

## Checklist rilis

- [ ] `npm run tauri build` sukses (desktop)
- [ ] `.exe` **dan** `.sig` ada
- [ ] versi sama di 3 file: `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`
- [ ] aset terupload ke GitHub Release tag `v<versi>`
- [ ] `node scripts/release.cjs --version <versi> --from-github` dijalankan di server
- [ ] `curl -s .../downloads/latest.json` → versi baru + signature terisi
- [ ] `curl -sI .../download` → 302 ke file versi baru
