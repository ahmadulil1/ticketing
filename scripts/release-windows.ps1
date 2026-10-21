<#
.SYNOPSIS
  Build + rilis Ticketing Desktop untuk Windows.

.DESCRIPTION
  Menjalankan build Tauri (wajib pakai signing key supaya updater bisa
  verifikasi), lalu meng-upload .exe + .sig ke GitHub Release.
  Setelah itu, jalankan di server:
      node scripts/release.cjs --version <versi> --from-github

.PARAMETER Version
  Versi rilis, mis. 1.1.0

.PARAMETER Key
  Path ke private key Tauri (kalau tidak di-set, pakai env TAURI_SIGNING_PRIVATE_KEY
  atau file .key di %USERPROFILE%\.tauri\)

.PARAMETER AllowUnsigned
  Izin build tanpa signing key. Hasilnya TIDAK punya .sig, jadi tidak bisa
  dipakai untuk auto-update. Hanya untuk tes lokal.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Version 1.1.0
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Repo = "ahmadulil1/ticketing",
  [string]$Key = "",
  [string]$Notes = "",
  [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"

function Say($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

$root = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $root "desktop"

# ---------------------------------------------------------------- signing key
if (-not $Key) {
  if ($env:TAURI_SIGNING_PRIVATE_KEY) {
    Say "Signing key dari env TAURI_SIGNING_PRIVATE_KEY"
  } else {
    $candidates = @()
    if ($env:USERPROFILE) {
      $candidates += (Join-Path $env:USERPROFILE ".tauri")
      $candidates += (Join-Path $env:USERPROFILE ".tauri\*.key")
    }
    $candidates += (Join-Path $desktop "src-tauri\*.key")
    foreach ($c in $candidates) {
      $hit = Get-ChildItem -Path $c -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $Key = $hit.FullName; break }
    }
  }
}

if ($Key) {
  Say "Signing key: $Key"
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw $Key)
  if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    # Key bisa punya password. Tanya, jangan asal kosongkan — build signing
    # akan gagal kalau passwordnya salah.
    $pw = Read-Host "Password signing key (tekan Enter kalau key tak ada password)"
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $pw
    if ([string]::IsNullOrEmpty($pw)) {
      Say "Password dikosongkan."
    } else {
      Say "Password diterima."
    }
  } else {
    Say "Password dari env TAURI_SIGNING_PRIVATE_KEY_PASSWORD."
  }
} elseif ($AllowUnsigned) {
  Write-Warning "TIDAK ADA signing key. Build TANPA signature (-AllowUnsigned)."
  Write-Warning "Rilis tanpa .sig = user 1.0.7 tidak bisa auto-update."
} else {
  Write-Warning "TIDAK ADA signing key. Rilis tanpa .sig tidak berguna untuk auto-update."
  Write-Warning ""
  Write-Warning "Cari key lama di: %USERPROFILE%\.tauri\*.key"
  Write-Warning "Kalau memang hilang, buat key baru:"
  Write-Warning "  cd desktop; npm run tauri signer generate -w \$env:USERPROFILE\.tauri\ticketing.key -p <password>"
  Write-Warning "Lalu ganti \"pubkey\" di desktop\src-tauri\tauri.conf.json dengan public key baru."
  Write-Warning "CATATAN: key baru = user 1.0.7 harus install manual sekali."
  Write-Warning ""
  $ans = Read-Host "Lanjut tanpa signature? ketik 'ya' (atau -AllowUnsigned)"
  if ($ans -ne "ya") { throw "Dibatalkan: signing key tidak ada." }
}

# ------------------------------------------------------------------- build
Say "Build Tauri (bisa 3-10 menit)..."
Push-Location $desktop
try {
  npm install
  npm run tauri build
} finally {
  Pop-Location
}

$nsis = Join-Path $desktop "src-tauri\target\release\bundle\nsis"
if (-not (Test-Path $nsis)) { throw "Folder NSIS tidak ditemukan: $nsis" }

$exe = Get-ChildItem -Path $nsis -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { throw "Tidak ada .exe hasil build di $nsis" }
$sig = "$($exe.FullName).sig"

Say "Installer: $($exe.Name)"
$hasSig = Test-Path $sig
if ($hasSig) {
  Say "Signature : $(Split-Path $sig -Leaf)"
} else {
  Write-Warning "TIDAK ADA .sig — updater akan MENOLAK rilis ini."
  Write-Warning "Jangan lanjut ke update manifest di server tanpa signature."
}

# ------------------------------------------------------------- upload GitHub
$tag = "v$Version"
if (Get-Command gh -ErrorAction SilentlyContinue) {
  Say "Upload ke GitHub Release $tag ..."
  gh release view $tag --repo $Repo 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Say "Release $tag belum ada, dibuat..."
    gh release create $tag --repo $Repo --title "Ticketing Desktop $Version" --notes $Notes --draft
  }
  gh release upload $tag $exe.FullName --repo $Repo --clobber
  if (Test-Path $sig) { gh release upload $tag $sig --repo $Repo --clobber }
  Say "Upload selesai."
} else {
  Write-Warning "gh CLI tidak ada. Upload manual lewat browser:"
  Write-Warning "  https://github.com/$Repo/releases/tag/$tag"
  Write-Warning "  files: $($exe.Name) dan $($exe.Name).sig"
}

Say "Langkah berikutnya (di server):"
if ($hasSig) {
  Write-Host "  node scripts/release.cjs --version $Version --from-github"
  Write-Host ""
  Write-Host "Lalu cek: https://ticketing.marisoncloud.com/downloads/latest.json"
} else {
  Write-Host "  BELUM BOLEH update manifest — .sig tidak ada."
  Write-Host "  Rilis tanpa signature = user 1.0.7 tidak bisa auto-update."
}
