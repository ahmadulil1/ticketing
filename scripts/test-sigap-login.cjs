/**
 * Tes integrasi login admin Ticketing via SIGAP.
 *
 * Menjalankan mock server SIGAP (login email+password), lalu menguji API
 * Ticketing yang diarahkan ke mock tersebut.
 *
 * Jalankan di server (API harus diarahkan ke mock lebih dulu):
 *   node test-sigap-login.cjs
 */
const http = require("http");
const { Pool } = require("pg");

const API = process.env.API_URL || "http://127.0.0.1:3000/api";
const MOCK_PORT = 3999;

const MOCK_USERS = {
  "ahmad@marison.id": { id: "11111111-1111-4111-8111-111111111111", name: "Ahmad Ulil Albab", password: "rahasia-ahmad" },
  "aldama@marison.id": { id: "22222222-2222-4222-8222-222222222222", name: "Aldama", password: "rahasia-aldama" },
  "orang@marison.id": { id: "33333333-3333-4333-8333-333333333333", name: "Bukan Admin", password: "rahasia-lain" },
};

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log("  PASS ", name);
  } else {
    fail++;
    console.log("  FAIL ", name, extra);
  }
};

function startMock() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/api/auth/login" && req.method === "POST") {
          let payload = {};
          try {
            payload = JSON.parse(body || "{}");
          } catch {}
          const u = MOCK_USERS[(payload.email || "").toLowerCase()];
          if (u && u.password === payload.password) {
            const user = { id: u.id, email: payload.email, full_name: u.name };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ session: { user }, user }));
          } else {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Email atau password salah." }));
          }
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });
    });
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function post(path, body, token) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

(async () => {
  const db = new Pool({
    host: "localhost",
    user: "ticketing",
    password: "ticketing123",
    database: "ticketing",
  });
  const mock = await startMock();
  try {
    // 1. login akun yang diizinkan
    const a = await post("/auth/login/sigap", { email: "ahmad@marison.id", password: "rahasia-ahmad" });
    ok("login SIGAP yang diizinkan -> 200", a.status === 200, JSON.stringify(a.json).slice(0, 160));
    ok("token diterbitkan", !!a.json?.token);
    ok("role admin", a.json?.user?.role === "admin", JSON.stringify(a.json?.user));
    ok("nama dari SIGAP", a.json?.user?.fullName === "Ahmad Ulil Albab", a.json?.user?.fullName);
    ok("sigapUserId diteruskan", a.json?.user?.sigapUserId === MOCK_USERS["ahmad@marison.id"].id);

    // 2. token valid untuk /auth/me
    if (a.json?.token) {
      const me = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + a.json.token } });
      ok("token dipakai /auth/me -> 200", me.status === 200, "status=" + me.status);
    }

    // 3. akun SIGAP di luar daftar -> ditolak
    const b = await post("/auth/login/sigap", { email: "orang@marison.id", password: "rahasia-lain" });
    ok("SIGAP non-admin -> 403", b.status === 403, JSON.stringify(b.json).slice(0, 120));

    // 4. password salah -> 401
    const c = await post("/auth/login/sigap", { email: "ahmad@marison.id", password: "salah" });
    ok("password salah -> 401", c.status === 401, JSON.stringify(c.json).slice(0, 120));

    // 5. login lokal dimatikan
    const d = await post("/auth/login", { username: "admin", password: "admin123" });
    ok("login lokal -> 403", d.status === 403, JSON.stringify(d.json).slice(0, 120));

    // 6. allowlist terikat ke ID SIGAP
    const row = (await db.query("SELECT sigap_user_id, bound_at FROM sigap_admins WHERE email = $1", ["ahmad@marison.id"])).rows[0];
    ok("ID SIGAP terikat di allowlist", row?.sigap_user_id === MOCK_USERS["ahmad@marison.id"].id, JSON.stringify(row));

    // 7. baris user lokal: role admin, aktif, password tak bisa dipakai
    const u = (await db.query("SELECT * FROM users WHERE sigap_user_id = $1", [MOCK_USERS["ahmad@marison.id"].id])).rows[0];
    ok("baris user lokal dibuat", !!u);
    ok("role admin", u?.role === "admin", u?.role);
    ok("aktif", u?.is_active === true);
    const bcrypt = require("bcrypt");
    ok("password lokal bukan kredensial nyata", u && !(await bcrypt.compare("rahasia-ahmad", u.password)));

    // 8. akun kedua ( Aldama ) juga boleh
    const e = await post("/auth/login/sigap", { email: "aldama@marison.id", password: "rahasia-aldama" });
    ok("login admin kedua -> 200", e.status === 200, JSON.stringify(e.json).slice(0, 120));
  } finally {
    await db.query("DELETE FROM users WHERE sigap_user_id IS NOT NULL");
    await db.query("UPDATE sigap_admins SET sigap_user_id = NULL, bound_at = NULL");
    mock.close();
    await db.end();
  }
  console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
