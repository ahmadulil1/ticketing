import pg from "pg";
import WebSocket from "ws";
const { Pool } = pg;
const db = new Pool({
  host: "localhost", user: "ticketing", password: "ticketing123", database: "ticketing",
});
const API = "http://127.0.0.1:3000";
const DEVICE_ID = "e2e-timeout-device";
const DEVICE_SECRET = "e2e-timeout-secret-0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, x = "") => {
  if (c) { console.log(`  PASS  ${n}`); pass++; }
  else { console.log(`  FAIL  ${n} ${x}`); fail++; }
};

(async () => {
  console.log("=== TEST: timeout sesi remote mengabari device ===\n");

  await db.query("DELETE FROM remote_sessions WHERE device_id = $1", [DEVICE_ID]);
  await db.query(
    `INSERT INTO device_credentials (device_id, device_secret) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET device_secret = EXCLUDED.device_secret`,
    [DEVICE_ID, DEVICE_SECRET]
  );

  // device WS dengarkan remote_ended
  const got = [];
  const ws = new WebSocket("ws://127.0.0.1:3000/ws");
  await new Promise((res) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "subscribe-remote", deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET, isAgent: false,
      }));
      setTimeout(res, 400);
    });
    ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === "remote_ended") got.push(m);
    });
  });

  // buat sesi aktif lalu dipaksa idle 40 menit
  const s = await db.query(
    `INSERT INTO remote_sessions (device_id, status, last_activity)
     VALUES ($1, 'active', NOW() - INTERVAL '40 minutes') RETURNING id`,
    [DEVICE_ID]
  );
  const sid = s.rows[0].id;

  // picu cleanup lewat endpoint ber-privilege (butuh agent) — pakai agent test
  const lr = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "e2e_agent", password: "e2epass123" }),
  });
  const { token } = await lr.json();
  await fetch(`${API}/api/remote/?device_id=${DEVICE_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await sleep(1200);

  const st = await db.query("SELECT status FROM remote_sessions WHERE id = $1", [sid]);
  check("sesi ditandai timeout di DB", st.rows[0]?.status === "timeout", st.rows[0]?.status);
  check("device menerima remote_ended", got.length > 0, `diterima=${got.length}`);
  check("remote_ended punya reason=timeout", got[0]?.reason === "timeout", got[0]?.reason);
  check("remote_ended punya sessionId benar", got[0]?.sessionId === sid);

  ws.close();
  await db.query("DELETE FROM remote_sessions WHERE device_id = $1", [DEVICE_ID]);
  await db.query("DELETE FROM device_credentials WHERE device_id = $1", [DEVICE_ID]);
  await db.end();
  console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
