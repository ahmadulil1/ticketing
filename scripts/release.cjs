#!/usr/bin/env node
/**
 * Rilis desktop app: pasang installer + tulis manifest updater (latest.json).
 *
 * Jalankan DI SERVER (atau dari mana saja yang punya akses tulis ke
 * folder downloads):
 *
 *   node scripts/release.cjs --version 1.1.0 --exe /tmp/Ticketing_1.1.0_x64-setup.exe
 *   node scripts/release.cjs --version 1.1.0 --from-github --notes "Remote desktop"
 *
 * Opsi:
 *   --version <v>       versi rilis (wajib). Mis. 1.1.0
 *   --exe <path>        file installer .exe yang SUDAH ada di mesin ini
 *   --from-github       ambil .exe dari GitHub Release tag v<version>
 *   --repo owner/name   repo GitHub (default ahmadulil1/ticketing)
 *   --notes "..."       catatan rilis (default: pakai dari GitHub Release)
 *   --downloads <dir>   folder download (default /var/www/ticketing/downloads)
 *
 * Yang dilakukan:
 *   1. salin .exe + .sig ke folder downloads (nama ber versi + Ticketing-setup.exe)
 *   2. tulis latest.json (merge: platform lain tetap dipertahankan)
 *   3. signature diambil dari file .sig Tauri
 *
 * Tanpa file .sig, updater akan MENOLAK rilis ini — jadi script berhenti
 * dengan pesan jelas, bukan menulis manifest yang gagal di tangan user.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(name);

const VERSION = arg("--version");
const REPO = arg("--repo", "ahmadulil1/ticketing");
const DOWNLOADS = arg("--downloads", "/var/www/ticketing/downloads");
const TOKEN = process.env.GITHUB_TOKEN || "";
const PLATFORM = "windows-x86_64";

if (!VERSION) {
  console.error("ERROR: --version wajib. Contoh: --version 1.1.0");
  process.exit(1);
}

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "ticketing-release-script",
          Accept: "application/octet-stream",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(get(res.headers.location, headers));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} untuk ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("timeout")));
  });
}

async function fromGithub() {
  const tag = `v${VERSION}`;
  console.log(`Mengambil release ${tag} dari ${REPO} ...`);
  const meta = JSON.parse(
    (await get(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      Accept: "application/vnd.github+json",
    })).toString("utf8")
  );

  const assets = meta.assets || [];
  const exeAsset = assets.find((a) => /\.exe$/i.test(a.name));
  const sigAsset = assets.find((a) => /\.exe\.sig$/i.test(a.name));
  if (!exeAsset) {
    fail(
      `Release ${tag} belum punya asset .exe. Upload dulu:\n` +
        `  gh release upload ${tag} <file>.exe --repo ${REPO}\n` +
        `  gh release upload ${tag} <file>.exe.sig --repo ${REPO}`
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-"));
  const exePath = path.join(tmp, exeAsset.name);
  const sigPath = exePath + ".sig";

  fs.writeFileSync(exePath, await get(exeAsset.browser_download_url));
  console.log(`  ✓ ${exeAsset.name} (${(fs.statSync(exePath).size / 1024 / 1024).toFixed(1)} MB)`);

  if (sigAsset) {
    fs.writeFileSync(sigPath, await get(sigAsset.browser_download_url));
    console.log(`  ✓ ${sigAsset.name}`);
  } else {
    console.warn("  ! Tidak ada asset .sig di GitHub — signature diambil dari file lokal bila ada.");
  }

  const notes = arg("--notes") || meta.body || meta.name || `Rilis ${VERSION}`;
  return { exePath, sigPath, notes };
}

async function main() {
  let exePath = arg("--exe");
  let sigPath = exePath ? exePath + ".sig" : null;
  let notes = arg("--notes");

  if (has("--from-github") || !exePath) {
    const gh = await fromGithub();
    exePath = gh.exePath;
    if (!sigPath) sigPath = gh.sigPath;
    if (!notes) notes = gh.notes;
  }

  if (!fs.existsSync(exePath)) fail(`File installer tidak ada: ${exePath}`);
  if (!sigPath || !fs.existsSync(sigPath)) {
    fail(
      `File signature (.sig) tidak ada: ${sigPath}\n` +
        `Updater Tauri akan menolak rilis tanpa signature. Ensure dulu:\n` +
        `  npm run tauri build   (dengan TAURI_SIGNING_PRIVATE_KEY terpasang)`
    );
  }

  fs.mkdirSync(DOWNLOADS, { recursive: true });

  // Satu file installer saja di server: Ticketing-setup.exe (nama stabil).
  // Link /download dan /downloads/Ticketing-setup.exe sama-sama menunjuk
  // file ini, jadi tak ada lagi link per-versi yang harus diinvalidasi.
  const baseName = "Ticketing-setup.exe";
  const target = path.join(DOWNLOADS, baseName);

  fs.copyFileSync(exePath, target);
  fs.copyFileSync(sigPath, target + ".sig");
  try {
    fs.chmodSync(target, 0o644);
    fs.chmodSync(target + ".sig", 0o644);
  } catch {}

  const signature = fs.readFileSync(sigPath, "utf8").trim();

  // Merge dengan manifest lama supaya platform lain tidak hilang
  const manifestPath = path.join(DOWNLOADS, "latest.json");
  let manifest = { platforms: {} };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      console.warn("! latest.json lama tidak bisa dibaca, dibuat ulang.");
    }
  }
  manifest.version = VERSION;
  manifest.notes = notes || `Rilis ${VERSION}`;
  manifest.pub_date = new Date().toISOString();
  manifest.platforms = manifest.platforms || {};
  manifest.platforms[PLATFORM] = {
    signature,
    url: `https://ticketing.marisoncloud.com/downloads/${baseName}`,
  };
  // baseName = Ticketing-setup.exe (nama stabil, satu link untuk semua versi)
  manifest.release_id = `ticketing-${VERSION}`;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // Entri macOS (opsional). Artefak updater macOS = Ticketing.app.tar.gz (+ .sig).
  // Pakai --macos untuk mengaktifkannya; tanpa flag, entri macOS yang lama
  // tetap dipertahankan apa adanya.
  if (has("--macos")) {
    const tarball = path.join(DOWNLOADS, "Ticketing.app.tar.gz");
    const tarSig = tarball + ".sig";
    if (fs.existsSync(tarball) && fs.existsSync(tarSig)) {
      manifest.platforms["darwin-x86_64"] = {
        signature: fs.readFileSync(tarSig, "utf8").trim(),
        // Query versi: cache key berbeda tiap rilis, jadi edge Cloudflare
        // tak mungkin menyajikan artefak rilis sebelumnya.
        url: `https://ticketing.marisoncloud.com/downloads/Ticketing.app.tar.gz?v=${VERSION}`,
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log("  macOS   : Ticketing.app.tar.gz (darwin-x86_64)");
    } else {
      console.warn("  ! Tiketing.app.tar.gz / .sig tidak ada di downloads — entri macOS dilewati.");
    }
  }

  console.log("");
  console.log(`Rilis ${VERSION} terpasang:`);
  console.log(`  file    : ${target}`);
  console.log(`  short   : https://ticketing.marisoncloud.com/download`);
  console.log(`  manifest: ${manifestPath}`);
  console.log("");
  console.log("Link:");
  console.log(`  https://ticketing.marisoncloud.com/download`);
  console.log(`  https://ticketing.marisoncloud.com/downloads/${baseName}`);
  console.log(`  https://ticketing.marisoncloud.com/downloads/latest.json`);
}

main().catch((e) => {
  console.error("GAGAL: " + (e && e.message ? e.message : e));
  process.exit(1);
});
