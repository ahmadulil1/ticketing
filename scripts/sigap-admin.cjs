#!/usr/bin/env node
/**
 * Kelola daftar admin SIGAP (tabel sigap_admins).
 *
 *   node sigap-admin.cjs list
 *   node sigap-admin.cjs add <email> ["Nama Lengkap"]
 *   node sigap-admin.cjs remove <email>
 *
 * Email diikat ke ID SIGAP pada login pertama (kolom sigap_user_id).
 * Setelah terikat, hanya ID itu yang bisa login; email bisa diubah di SIGAP.
 */
const { Pool } = require("pg");
const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "ticketing",
  password: process.env.DB_PASSWORD || "ticketing123",
  database: process.env.DB_NAME || "ticketing",
});

const cmd = process.argv[2];
const email = (process.argv[3] || "").trim().toLowerCase();
const name = process.argv[4] || null;

(async () => {
  if (cmd === "list") {
    const rows = (
      await db.query(
        "SELECT email, full_name, sigap_user_id, bound_at, is_active FROM sigap_admins ORDER BY email"
      )
    ).rows;
    if (!rows.length) {
      console.log("Belum ada admin SIGAP terdaftar.");
    }
    for (const r of rows) {
      console.log(
        `  ${r.email} | ${r.full_name || "-"} | ${
          r.sigap_user_id ? "terikat: " + r.sigap_user_id : "belum terikat (login pertama akan mengikat)"
        } | active=${r.is_active}`
      );
    }
  } else if (cmd === "add") {
    if (!email) throw new Error("add <email> [nama]");
    await db.query(
      `INSERT INTO sigap_admins (email, full_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, sigap_admins.full_name), is_active = true`,
      [email, name]
    );
    console.log("Ditambahkan: " + email);
  } else if (cmd === "remove") {
    if (!email) throw new Error("remove <email>");
    await db.query("DELETE FROM sigap_admins WHERE email = $1", [email]);
    console.log("Dihapus: " + email);
  } else {
    console.log("Pakai: list | add <email> [nama] | remove <email>");
  }
  await db.end();
})().catch((e) => {
  console.error("GAGAL: " + e.message);
  process.exit(1);
});
