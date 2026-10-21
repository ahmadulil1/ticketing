import pg from "pg";
import bcrypt from "bcrypt";
import WebSocket from "ws";
const { Pool } = pg;
const db = new Pool({
  host: "localhost", user: "ticketing", password: "ticketing123", database: "ticketing",
});
const API = "http://127.0.0.1:3000";
const DEVICE_ID = "internal-test-device-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, x = "") => {
  if (c) { console.log(`  PASS  ${n}`); pass++; }
  else { console.log(`  FAIL  ${n} ${x}`); fail++; }
};

(async () => {
  console.log("=== TEST: kebocoran catatan internal ===\n");

  // agent
  const u = await db.query("SELECT id FROM users WHERE username='int_test_agent'");
  if (!u.rows[0]) {
    await db.query(
      `INSERT INTO users (username,email,password,full_name,role)
       VALUES ('int_test_agent','int@local',$1,'Int Tester','admin')`,
      [await bcrypt.hash("test1234", 10)]
    );
  }
  const lr = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "int_test_agent", password: "test1234" }),
  });
  const { token } = await lr.json();
  check("login agent", !!token);

  // buat tiket tamu
  const tr = await fetch(`${API}/api/tickets/guest`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: DEVICE_ID, device_name: "int-test-pc",
      title: "Test internal note", description: "Deskripsi test minimal 50 karakter untuk lolos validasi server",
    }),
  });
  const ticket = await tr.json();
  check("buat tiket tamu", tr.status === 200 || tr.status === 201, `status=${tr.status}`);
  const ticketId = ticket.id || ticket.ticket?.id;
  check("punya ticket id", !!ticketId);

  // agent kirim pesan public + internal
  for (const mt of ["public", "internal"]) {
    const mr = await fetch(`${API}/api/messages/ticket/${ticketId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: `RAHASIA-${mt}-ini不应该tamuLihat`, message_type: mt }),
    });
    check(`kirim pesan ${mt}`, mr.status === 201, `status=${mr.status}`);
  }

  // tamu ambil messages
  const gr = await fetch(`${API}/api/messages/ticket/${ticketId}?device_id=${DEVICE_ID}`);
  const guestMsgs = await gr.json();
  const guestHasInternal = guestMsgs.some((m) => m.message_type === "internal");
  const guestHasSecret = guestMsgs.some((m) => (m.body || "").includes("RAHASIA-internal"));
  check("tamu tidak dapat pesan internal", !guestHasInternal, JSON.stringify(guestMsgs.map(m=>m.message_type)));
  check("tamu tidak dapat body internal", !guestHasSecret);
  check("tamu tetap dapat pesan public", guestMsgs.some((m) => m.message_type === "public"));

  // agent ambil messages
  const ar = await fetch(`${API}/api/messages/ticket/${ticketId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const agentMsgs = await ar.json();
  check("agent tetap dapat pesan internal", agentMsgs.some((m) => m.message_type === "internal"));
  check("agent dapat body internal", agentMsgs.some((m) => (m.body || "").includes("RAHASIA-internal")));

  // guest tidak boleh kirim internal
  const gi = await fetch(`${API}/api/messages/ticket/${ticketId}?device_id=${DEVICE_ID}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "coba jadi internal", message_type: "internal" }),
  });
  const giBody = await gi.json();
  check("tamu tidak bisa kirim internal (dipaksa public)",
    gi.status === 201 && giBody.message_type === "public", `status=${gi.status} type=${giBody.message_type}`);

  // unread count tamu
  const ur = await fetch(`${API}/api/messages/unread?device_id=${DEVICE_ID}`);
  const unread = await ur.json();
  const unreadVal = unread[ticketId] ?? 0;
  check("unread tamu hanya hitung pesan public", unreadVal === 1, `unread=${unreadVal} (harus 1, internal tak dihitung)`);

  // WS: tamu tidak boleh terima push internal
  const guestSocket = new WebSocket("ws://127.0.0.1:3000/ws");
  const guestMsgs2 = [];
  await new Promise((res) => {
    guestSocket.on("open", () => {
      guestSocket.send(JSON.stringify({ type: "subscribe", ticketId, deviceId: DEVICE_ID }));
      setTimeout(res, 400);
    });
    guestSocket.on("message", (d) => { try { guestMsgs2.push(JSON.parse(d.toString())); } catch {} });
  });
  // agent kirim internal baru
  await fetch(`${API}/api/messages/ticket/${ticketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body: "RAHASIA-internal-push", message_type: "internal" }),
  });
  await sleep(800);
  const guestGotInternalPush = guestMsgs2.some(
    (m) => m.type === "new_message" && m.message?.message_type === "internal"
  );
  check("WS tamu tidak terima push internal", !guestGotInternalPush,
    JSON.stringify(guestMsgs2.map((m) => m.type + (m.message ? ":" + m.message.message_type : ""))));

  // agent WS harus dapat
  const agentSocket = new WebSocket("ws://127.0.0.1:3000/ws");
  const agentMsgs2 = [];
  await new Promise((res) => {
    agentSocket.on("open", () => {
      agentSocket.send(JSON.stringify({ type: "subscribe", ticketId, token }));
      setTimeout(res, 400);
    });
    agentSocket.on("message", (d) => { try { agentMsgs2.push(JSON.parse(d.toString())); } catch {} });
  });
  await fetch(`${API}/api/messages/ticket/${ticketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body: "RAHASIA-internal-push2", message_type: "internal" }),
  });
  await sleep(800);
  check("WS agent terima push internal",
    agentMsgs2.some((m) => m.type === "new_message" && m.message?.message_type === "internal"));

  guestSocket.close(); agentSocket.close();
  await db.query("DELETE FROM messages WHERE ticket_id=$1", [ticketId]);
  await db.query("DELETE FROM tickets WHERE id=$1", [ticketId]);
  await db.query("DELETE FROM users WHERE username='int_test_agent'");
  await db.end();
  console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
