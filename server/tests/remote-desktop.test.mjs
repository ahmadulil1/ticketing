/**
 * E2E test remote desktop: auth, session, WS signaling, frame relay, input relay.
 * Jalankan di server: node /tmp/remote-e2e.mjs
 */
import pg from "pg";
import bcrypt from "bcrypt";
import WebSocket from "ws";

const { Pool } = pg;
const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "ticketing",
  password: process.env.DB_PASSWORD || "ticketing123",
  database: process.env.DB_NAME || "ticketing",
});
const API = "http://127.0.0.1:3000";
const WS_URL = "ws://127.0.0.1:3000/ws";
const DEVICE_ID = "e2e-test-device-001";
const DEVICE_SECRET = "e2e-secret-0123456789abcdefghijklmnop";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name} ${extra}`); fail++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureAgent() {
  const username = "e2e_agent";
  const existing = await db.query("SELECT id FROM users WHERE username=$1", [username]);
  if (existing.rows[0]) return existing.rows[0].id;
  const hash = await bcrypt.hash("e2epass123", 10);
  const res = await db.query(
    `INSERT INTO users (username, email, password, full_name, role)
     VALUES ($1,$2,$3,$4,'admin') RETURNING id`,
    [username, `${username}@e2e.local`, hash, "E2E Admin"]
  );
  console.log("  (agent test dibuat:", res.rows[0].id, ")");
  return res.rows[0].id;
}

async function login(username, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login gagal: ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

function wsConnect(payload, expectCloseCode = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const state = { ws, messages: [], closed: null, closeCode: null };
    ws.on("open", () => ws.send(JSON.stringify(payload)));
    ws.on("message", (d) => {
      try { state.messages.push(JSON.parse(d.toString())); } catch {}
    });
    ws.on("close", (code) => { state.closed = true; state.closeCode = code; });
    ws.on("error", () => {});
    setTimeout(() => resolve(state), 800);
    if (expectCloseCode !== null) {
      setTimeout(() => resolve(state), 800);
    }
  });
}

const findMsg = (state, type) => state.messages.find((m) => m.type === type);

(async () => {
  console.log("=== E2E Remote Desktop ===\n");

  // 0. Bersihkan sisa test
  await db.query("DELETE FROM remote_sessions WHERE device_id=$1", [DEVICE_ID]);
  await db.query("DELETE FROM device_credentials WHERE device_id=$1", [DEVICE_ID]);

  console.log("[1] Setup agent + login");
  await ensureAgent();
  const token = await login("e2e_agent", "e2epass123");
  check("login dapat token", !!token);

  console.log("\n[2] Register device (tanpa auth - self-service)");
  let r = await fetch(`${API}/api/remote/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: DEVICE_ID, device_secret: DEVICE_SECRET }),
  });
  check("register 201", r.status === 201, `got ${r.status}`);
  r = await fetch(`${API}/api/remote/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: DEVICE_ID, device_secret: "different-secret-xxxxxxxxxxxxxxx" }),
  });
  check("register ulang dgn secret lain ditolak (409)", r.status === 409, `got ${r.status}`);

  console.log("\n[3] Auth guard REST");
  r = await fetch(`${API}/api/remote/`);
  check("GET /remote tanpa auth = 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${API}/api/remote/`, { headers: { Authorization: `Bearer ${token}` } });
  check("GET /remote dengan token = 200", r.status === 200, `got ${r.status}`);
  r = await fetch(`${API}/api/remote/pending?device_id=${DEVICE_ID}`);
  check("GET /pending tanpa secret = 401", r.status === 401, `got ${r.status}`);
  r = await fetch(`${API}/api/remote/pending?device_id=${DEVICE_ID}&device_secret=${DEVICE_SECRET}`);
  check("GET /pending dengan secret = 200", r.status === 200, `got ${r.status}`);

  console.log("\n[4] WS auth guard");
  const badWs = await wsConnect({ type: "subscribe-remote", deviceId: DEVICE_ID, deviceSecret: "WRONG", isAgent: false });
  check("WS secret salah ditutup (1008)", badWs.closed && badWs.closeCode === 1008, `closed=${badWs.closed} code=${badWs.closeCode}`);
  const badAgent = await wsConnect({ type: "subscribe-remote", deviceId: DEVICE_ID, token: "bogus", isAgent: true });
  check("WS agent token palsu ditutup (1008)", badAgent.closed && badAgent.closeCode === 1008, `code=${badAgent.closeCode}`);

  console.log("\n[5] Buat sesi remote (agent)");
  r = await fetch(`${API}/api/remote/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_id: DEVICE_ID }),
  });
  const sess = await r.json();
  check("POST /remote = 201", r.status === 201, `got ${r.status} ${JSON.stringify(sess)}`);
  const sessionId = sess.id;
  r = await fetch(`${API}/api/remote/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_id: DEVICE_ID }),
  });
  check("POST /remote duplikat = 409", r.status === 409, `got ${r.status}`);

  console.log("\n[6] Device & agent subscribe WS");
  const devWs = await wsConnect({ type: "subscribe-remote", deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET, isAgent: false });
  check("device subscribe OK (tidak ditutup)", !devWs.closed);
  const reqMsg = findMsg(devWs, "remote_request");
  check("device terima remote_request", !!reqMsg, JSON.stringify(devWs.messages));
  check("remote_request punya sessionId", reqMsg?.sessionId === sessionId);
  check("remote_request agent_name terisi", !!reqMsg?.agent_name, reqMsg?.agent_name);

  const agentWs = await wsConnect({ type: "subscribe-remote", deviceId: DEVICE_ID, token, isAgent: true });
  check("agent subscribe OK (tidak ditutup)", !agentWs.closed);

  console.log("\n[7] Frame relay device -> agent");
  devWs.ws.send(JSON.stringify({ type: "remote_frame", session_id: sessionId, data: "AAAAFAKEPNGDATA", format: "png" }));
  await sleep(600);
  const frame = findMsg(agentWs, "remote_frame");
  check("agent terima remote_frame", !!frame);
  check("data frame utuh", frame?.data === "AAAAFAKEPNGDATA", frame?.data);

  console.log("\n[8] Input relay agent -> device");
  agentWs.ws.send(JSON.stringify({ type: "remote_input", session_id: sessionId, input: { type: "MouseMove", x: 10, y: 20 } }));
  await sleep(600);
  const inp = findMsg(devWs, "remote_input");
  check("device terima remote_input", !!inp, JSON.stringify(devWs.messages.map(m=>m.type)));
  check("koordinat input benar", inp?.input?.x === 10 && inp?.input?.y === 20);

  console.log("\n[9] Device update status sesi (accept) via device secret");
  r = await fetch(`${API}/api/remote/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "accepted", device_id: DEVICE_ID, device_secret: DEVICE_SECRET }),
  });
  check("PATCH accepted = 200", r.status === 200, `got ${r.status}`);
  const row = await db.query("SELECT status FROM remote_sessions WHERE id=$1", [sessionId]);
  check("status DB = accepted", row.rows[0]?.status === "accepted", row.rows[0]?.status);

  console.log("\n[10] Admin akhiri sesi -> device terima remote_ended");
  r = await fetch(`${API}/api/remote/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  check("DELETE = 200", r.status === 200, `got ${r.status}`);
  await sleep(600);
  check("device terima remote_ended", !!findMsg(devWs, "remote_ended"));

  console.log("\n[11] Riwayat sesi");
  r = await fetch(`${API}/api/remote/?device_id=${DEVICE_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const hist = await r.json();
  check("riwayat berisi 1 sesi", hist.length === 1, `len=${hist.length}`);
  check("riwayat status = ended", hist[0]?.status === "ended", hist[0]?.status);

  console.log("\n[12] Timeout idle 30 menit (simulasi)");
  await db.query("UPDATE remote_sessions SET last_activity = NOW() - INTERVAL '40 minutes', status='active' WHERE id=$1", [sessionId]);
  r = await fetch(`${API}/api/remote/?device_id=${DEVICE_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const hist2 = await r.json();
  check("sesi idle ditandai timeout", hist2[0]?.status === "timeout", hist2[0]?.status);

  devWs.ws.close(); agentWs.ws.close();
  await db.query("DELETE FROM remote_sessions WHERE device_id=$1", [DEVICE_ID]);
  await db.query("DELETE FROM device_credentials WHERE device_id=$1", [DEVICE_ID]);
  await db.end();

  console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
