# PROMPT SEMENTARA: build rilis Windows 1.1.0
# HAPUS FILE INI SETELAH SELESAI (langkah 9)

Repo `ahmadulil1/ticketing`, branch `release/1.1.0`. Mesin ini Windows.
Tugas: build installer NSIS 1.1.0 yang bertanda tangan, upload ke GitHub Release `v1.1.0`.

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
   - Ketemu: pakai (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` kalau ada password).
   - Tidak ketemu: BERHENTI dan tanya user. Key baru berarti `pubkey` di
     `tauri.conf.json` diganti dan user 1.0.7 harus install manual sekali.
5. Build + upload:
   `powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Version 1.1.0`
   Hasil harus ada `.exe` dan `.exe.sig` di `desktop\src-tauri\target\release\bundle\nsis\`.
   Tanpa `.sig`, anggap gagal.
6. Verifikasi: `gh release view v1.1.0 --repo ahmadulil1/ticketing --json assets`
   harus memuat `.exe` dan `.exe.sig`. Install `.exe` di mesin ini, buka app, pastikan jalan.
   Remote Desktop harus bilang "belum tersedia di platform ini".
7. Kalau ada perbaikan (langkah 3), `git push origin release/1.1.0`.
8. Beri user perintah ini untuk dijalankan di server (jangan SSH sendiri):
   `node /opt/ticketing/scripts/release.cjs --version 1.1.0 --from-github`
9. Setelah langkah 6-8 beres dan user konfirmasi: hapus prompt ini.
   `git rm PROMPT-WINDOWS.md && git commit -m "chore: hapus prompt build Windows (selesai)" && git push origin release/1.1.0`

## Laporan ke user
Hasil `cargo check`, ada atau tidaknya `.sig`, link Release, dan perintah server (langkah 8).
