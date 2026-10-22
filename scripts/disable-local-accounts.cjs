#!/usr/bin/env node
/**
 * Nonaktifkan seluruh akun lokal Ticketing.
 *
 * Login lokal sudah dimatikan di sisi API (POST /auth/login -> 403), jadi
 * akun lokal tak bisa dipakai login. Skrip ini additionally:
 *   1. backup tabel users ke file SQL
 *   2. mengacak password semua akun lokal (bcrypt random)
 *   3. is_active = false
 *
 * Baris TIDAK dihapus: tiket/chat/audit masih mereferensinya. Menghapus baris
 * akan memutus riwayat (data loss), jadi barisnya tetap ada dengan kredensial mati.
 *
 * Jalankan di server:
 *   node scripts/disable-local-accounts.cjs
 *   node scripts/disable-local-accounts.cjs --apply   (tanpa --apply = dry run)
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const APPLY = process.argv.includes("--apply");
const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "ticketing",
  password: process.env.DB_PASSWORD || "ticketing123",
  database: process.env.DB_NAME || "ticketing",
});

(async () => {
  const rows = (await db.query("SELECT id, username, email, role, is_active FROM users ORDER BY username")).rows;
  console.log(`Akun lokal ditemukan: ${rows.length}`);
  for (const r of rows) {
    console.log(`  - ${r.username} <${r.email}> role=${r.role} active=${r.is_active}`);
  }
  if (!APPLY) {
    console.log("\nDry run. Jalankan ulang dengan --apply untuk menerapkan.");
    await db.end();
    return;
  }

  // 1. backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join("/var/www/ticketing", `users-backup-${stamp}.sql`);
  const lines = [
    `-- backup users ${new Date().toISOString()}`,
    ...rows.map(
      (r) =>
        `-- ${r.username} | ${r.email} | ${r.role} | active=${r.is_active} | id=${r.id}`
    ),
  ];
  try {
    fs.writeFileSync(backupFile, lines.join("\n") + "\n");
    console.log(`\nBackup: ${backupFile}`);
  } catch (e) {
    console.log(`\n! Gagal menulis backup (${e.message}) — lanjut tetap, tapi cek file manual.`);
  }

  // 2. matikan kredensial
  for (const r of rows) {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    await db.query(
      "UPDATE users SET password = $1, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [hash, r.id]
    );
  }
  console.log(`\n${rows.length} akun lokal dinonaktifkan (password diacak, is_active=false).`);
  console.log("Baris tetap disimpan agar riwayat tiket/chat/audit utuh.");
  await db.end();
})().catch((e) => {
  console.error("GAGAL: " + e.message);
  process.exit(1);
});
