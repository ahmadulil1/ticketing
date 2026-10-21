# PROMPT SEMENTARA: build rilis Windows 1.1.0
# HAPUS FILE INI SETELAH SELESAI (langkah 9)

Repo `ahmadulil1/ticketing`, branch `release/1.1.0`. Mesin ini Windows.
Tugas: build installer NSIS 1.1.0 yang bertanda tangan, upload ke GitHub Release `v1.1.0`.

## Yang sudah siap (jangan diulang)
- Branch `release/1.1.0` di GitHub: berisi kode 1.1.0 + script rilis.
- Release `v1.1.0` sudah ada (berisi dmg macOS). Tinggal tambah `.exe` + `.exe.sig`.
- Server sudah punya `scripts/release.cjs` yang tulis `/downloads/latest.json`.
- `latest.json` masih versi 1.0.7 (benar — berubah setelah langkah 8).

## Aturan
- Jangan push ke `main`. Push hanya ke `release/1.1.0`.
- Jangan commit signing key. Jangan cetak isi key atau password.
- Jangan generate signing key baru tanpa izin user (lihat langkah 4).
- Ragu atau ada error tak jelas: berhenti dan tanya user.

## Langkah
1. Cek prasyarat: `git`, `node` 20+, `rustup` (toolchain msvc), `gh auth status`.
   Kalau ada yang kurang, kasih tahu user dan berhenti.
2. `git fetch origin && git checkout release/1.1.0 && git pull`
3. Cek compile Windows: `cd desktop\src-tauri && cargo check`.
   Dugaan gagal karena `core-graphics` (khusus macOS) belum di-gate. Kalau gagal:
   - `Cargo.toml`: pindah `core-graphics = "0.23"` ke
     `[target.'cfg(target_os = "macos")'.dependencies]`.
   - `src/remote_input.rs`: beri `#[cfg(target_os = "macos")]` pada semua `use core_graphics::...`
     dan tipe `CG*` di luar fungsi yang sudah di-gate.
   - Ulang `cargo check` sampai bersih. Ubah hanya cfg gate, jangan sentuh logika macOS.
   - Commit: `fix(build): core-graphics hanya untuk macOS`.
4. Signing key: cari `%USERPROFILE%\.tauri\*.key`.
   - Ketemu: pakai. Skrip nanti menanyakan passwordnya (Enter kalau tak ada password).
   - Tidak ketemu: BERHENTI dan tanya user. Dua pilihan untuk user:
     a) key lama dicari di mesin lain (paling bagus — auto-update tetap jalan).
     b) key baru:
        `cd desktop; npm run tauri signer generate -w %USERPROFILE%\.tauri\ticketing.key -p <password>`
        lalu ganti `pubkey` di `desktop\src-tauri\tauri.conf.json` dengan public key baru.
        Konsekuensi: user 1.0.7 harus install 1.1.0 manual sekali.
   - Jangan pakai `-AllowUnsigned` untuk rilis resmi.
5. Build + upload:
   `powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Version 1.1.0`
   Hasil harus ada `.exe` DAN `.exe.sig` di `desktop\src-tauri\target\release\bundle\nsis\`.
   Tanpa `.sig` = gagal, jangan lanjut update manifest.
6. Verifikasi: `gh release view v1.1.0 --repo ahmadulil1/ticketing --json assets`
   harus memuat `.exe` dan `.exe.sig`. Install `.exe` di mesin ini, buka app, pastikan jalan.
   Remote Desktop harus bilang "belum tersedia di platform ini".
7. Kalau ada perbaikan (langkah 3), `git push origin release/1.1.0`.
8. Beri user perintah ini untuk dijalankan di server (jangan SSH sendiri):
   `node /opt/ticketing/scripts/release.cjs --version 1.1.0 --from-github`
   Lalu cek `https://ticketing.marisoncloud.com/downloads/latest.json` → versi 1.1.0 + signature terisi.
9. Setelah langkah 6-8 beres dan user konfirmasi: hapus prompt ini.
   `git rm PROMPT-WINDOWS.md && git commit -m "chore: hapus prompt build Windows (selesai)" && git push origin release/1.1.0`

## Catatan
- GitHub Actions (`release-windows.yml`) ada di branch ini tapi belum aktif: GitHub cuma
  menjalankan workflow yang ada di default branch (`main`). Jangan cari di tab Actions.
  Jalur ini (build lokal) yang dipakai.
- Kalau `gh` CLI tidak ada di mesin ini, upload manual lewat browser:
  https://github.com/ahmadulil1/ticketing/releases/tag/v1.1.0

## Laporan ke user
Hasil `cargo check`, ada atau tidaknya `.sig`, link Release, dan perintah server (langkah 8).
