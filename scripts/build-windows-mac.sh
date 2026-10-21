#!/usr/bin/env bash
#
# Build installer Windows dari macOS (cross-compile).
#
# Prasyarat (sekali saja):
#   brew install nsis lld
#   brew install llvm                     # untuk clang-cl / llvm-rc
#   rustup target add x86_64-pc-windows-msvc
#   cargo install cargo-xwin
#
# Pakai:
#   scripts/build-windows-mac.sh                        # tanpa signature
#   scripts/build-windows-mac.sh --config src-tauri/tauri.noupdate.conf.json
#
# Dengan signature (butuh private key):
#   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ticketing.key)"
#   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<password>"
#   scripts/build-windows-mac.sh                        # jangan pakai config noupdate
#
# Hasil: desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP="$ROOT/desktop"

# llvm (clang-cl, llvm-rc) + lld dipakai buat link ke PE Windows
export PATH="/usr/local/opt/llvm/bin:/usr/local/opt/lld/bin:$PATH"
# Terima lisensi Windows SDK saat pertama kali diunduh
export XWIN_ACCEPT_LICENSE=1

if ! command -v makensis >/dev/null 2>&1; then
  echo "ERROR: makensis tidak ada. Jalankan: brew install nsis" >&2
  exit 1
fi
if ! command -v cargo-xwin >/dev/null 2>&1 && ! cargo xwin --version >/dev/null 2>&1; then
  echo "ERROR: cargo-xwin tidak ada. Jalankan: cargo install cargo-xwin" >&2
  exit 1
fi

echo "==> Build Windows (cross-compile dari macOS)"
cd "$DESKTOP"

npm install

# Argumen tambahan diteruskan, mis:
#   scripts/build-windows-mac.sh --config src-tauri/tauri.noupdate.conf.json
npm run tauri build -- \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --bundles nsis \
  "$@"

echo ""
echo "==> Selesai. Cek hasil:"
find "$DESKTOP/src-tauri/target" -path "*bundle/nsis/*.exe" -maxdepth 6 2>/dev/null | tail -5
