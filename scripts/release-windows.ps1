<#
.SYNOPSIS
  Build + rilis Ticketing Desktop untuk Windows.

.DESCRIPTION
  Menjalankan build Tauri (wajib pakai signing key supaya updater bisa
  verifikasi), lalu meng-upload .exe + .sig ke GitHub Release.
  Setelah itu, jalankan di server:
      node scripts/release.js --version <versi> --from-github

.PARAMETER Version
  Versi rilis, mis. 1.1.0

.PARAMETER Key
  Path ke private key Tauri (kalau tidak di-set, pakai env TAURI_SIGNING_PRIVATE_KEY
  atau file .key di %USERPROFILE%\.tauri\)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Version 1.1.0
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Repo = "ahmadulil1/ticketing",
  [string]$Key = "",
  [string]$Notes = ""
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
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
    Say "Password key kosong (kalau key punya password, set TAURI_SIGNING_PRIVATE_KEY_PASSWORD)"
  }
} else {
  Write-Warning "TIDAK ADA signing key. Build tetap jalan, tapi TIDAK menghasilkan .sig"
  Write-Warning "Rilis tanpa .sig = user tidak bisa auto-update. Lanjut? (Ctrl+C untuk batal)"
  $null = Read-Host "Ketik 'ya' untuk lanjut"
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
if (Test-Path $sig) {
  Say "Signature : $(Split-Path $sig -Leaf)"
} else {
  Write-Warning "Tidak ada .sig — updater tidak akan bisa memverifikasi rilis ini."
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
Write-Host "  node scripts/release.js --version $Version --from-github"
Write-Host ""
Write-Host "Lalu cek: https://ticketing.marisoncloud.com/downloads/latest.json"
