import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";

// Tandai sesi yang idle > 30 menit sebagai timeout.
// ponytail: WAJIB kabari device target (publish remote_ended) — kalau tidak,
// app desktop masih capture layar terus-menerus walau server sudah timeout.
export async function expireRemoteSessions() {
  const expired = await db.query(
    `UPDATE remote_sessions
     SET status = 'timeout', ended_at = CURRENT_TIMESTAMP
     WHERE status IN ('pending', 'accepted', 'active')
       AND last_activity < NOW() - INTERVAL '30 minutes'
     RETURNING id, device_id`
  );
  for (const row of expired.rows) {
    try {
      const { redis } = await import("../redis.js");
      await redis.publish(
        `remote:${row.device_id}`,
        JSON.stringify({
          type: "remote_ended",
          sessionId: row.id,
          reason: "timeout",
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error("[remote] publish timeout error:", e);
    }
  }
}

// Segera tandai idle session agar subsequent read bersih
expireRemoteSessions().catch(() => {});

/**
 * Verifikasi agent/admin lewat JWT. Return user atau null.
 * Remote desktop = fitur sensitif: hanya agent/admin boleh kendalikan PC.
 */
async function requireAgent(request: any): Promise<{ id: string; role: string; name: string } | null> {
  try {
    await request.jwtVerify();
  } catch {
    return null;
  }
  const user = request.user as { id: string; role: string; full_name?: string; username?: string };
  if (user.role !== "agent" && user.role !== "admin") return null;
  return {
    id: user.id,
    role: user.role,
    name: user.full_name || user.username || "Agent",
  };
}

/**
 * Verifikasi device lewat device_secret yang diregistrasi.
 * Dipakai oleh agent desktop (tak punya JWT agent).
 */
async function requireDevice(deviceId: string, secret: string): Promise<boolean> {
  if (!deviceId || !secret) return false;
  const res = await db.query(
    "SELECT 1 FROM device_credentials WHERE device_id = $1 AND device_secret = $2",
    [deviceId, secret]
  );
  return !!res.rows[0];
}

const remoteRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------
  // Registrasi device: desktop mendaftarkan rahasianya sekali.
  // Endpoint terbuka (self-service) tapi TIDAK boleh menimpa device
  // yang sudah terdaftar dengan secret berbeda (anti-hijack).
  // -------------------------------------------------------------------
  fastify.post("/register", async (request, reply) => {
    const { device_id, device_secret } = request.body as {
      device_id?: string;
      device_secret?: string;
    };
    if (!device_id || !device_secret) {
      return reply.status(400).send({ error: "device_id dan device_secret wajib" });
    }
    if (device_secret.length < 16) {
      return reply.status(400).send({ error: "device_secret terlalu pendek (min 16 karakter)" });
    }

    const existing = await db.query(
      "SELECT device_secret FROM device_credentials WHERE device_id = $1",
      [device_id]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].device_secret === device_secret) {
        return reply.send({ ok: true, registered: true });
      }
      return reply.status(409).send({ error: "Device sudah terdaftar dengan secret lain" });
    }

    await db.query(
      "INSERT INTO device_credentials (device_id, device_secret) VALUES ($1, $2) ON CONFLICT (device_id) DO NOTHING",
      [device_id, device_secret]
    );
    return reply.status(201).send({ ok: true, registered: true });
  });

  // -------------------------------------------------------------------
  // Agent (desktop) ambil sesi pending untuk device-nya
  // -------------------------------------------------------------------
  fastify.get("/pending", async (request, reply) => {
    const { device_id, device_secret } = request.query as {
      device_id?: string;
      device_secret?: string;
    };
    if (!device_id) return reply.status(400).send({ error: "device_id wajib" });
    if (!(await requireDevice(device_id, device_secret || ""))) {
      return reply.status(401).send({ error: "Device tidak terautentikasi" });
    }
    await expireRemoteSessions();

    const result = await db.query(
      `SELECT rs.*, u.username as agent_username, u.full_name as agent_full_name
       FROM remote_sessions rs
       LEFT JOIN users u ON rs.agent_id = u.id
       WHERE rs.device_id = $1 AND rs.status = 'pending'
       ORDER BY rs.started_at DESC`,
      [device_id]
    );
    return reply.send(result.rows);
  });

  // -------------------------------------------------------------------
  // Agent (desktop) update status sesi (accepted/rejected/ended/timeout)
  // -------------------------------------------------------------------
  fastify.patch("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { status, client_ip, note, device_id, device_secret } = request.body as {
      status?: string;
      client_ip?: string;
      note?: string;
      device_id?: string;
      device_secret?: string;
    };

    if (!status || !["accepted", "rejected", "ended", "timeout"].includes(status)) {
      return reply.status(400).send({ error: "status wajib dan valid" });
    }

    // Ambil sesi untuk cek device pemiliknya
    const sessionRes = await db.query(
      "SELECT device_id FROM remote_sessions WHERE id = $1",
      [sessionId]
    );
    if (!sessionRes.rows[0]) return reply.status(404).send({ error: "Session tidak ditemukan" });

    // Auth: agent JWT owns session, ATAU device secret pemilik device
    const agent = await requireAgent(request);
    const isOwnerDevice =
      device_id &&
      sessionRes.rows[0].device_id === device_id &&
      (await requireDevice(device_id, device_secret || ""));
    if (!agent && !isOwnerDevice) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (agent && agent.role !== "admin" && agent.role !== "agent") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    await expireRemoteSessions();

    const updateCols: string[] = [];
    const updateVals: any[] = [];
    let idx = 1;
    updateCols.push(`status = $${idx++}`);
    updateVals.push(status);
    if (status === "accepted") {
      updateCols.push(`accepted_at = $${idx++}`);
      updateVals.push(new Date().toISOString());
    }
    if (["ended", "timeout", "rejected"].includes(status)) {
      updateCols.push(`ended_at = $${idx++}`);
      updateVals.push(new Date().toISOString());
    }
    updateCols.push(`last_activity = $${idx++}`);
    updateVals.push(new Date().toISOString());
    if (client_ip) {
      updateCols.push(`client_ip = $${idx++}`);
      updateVals.push(client_ip);
    }
    if (note) {
      updateCols.push(`note = $${idx++}`);
      updateVals.push(note);
    }
    updateVals.push(sessionId);

    const result = await db.query(
      `UPDATE remote_sessions SET ${updateCols.join(", ")} WHERE id = $${idx} RETURNING *`,
      updateVals
    );
    if (!result.rows[0]) return reply.status(404).send({ error: "Session tidak ditemukan" });
    return reply.send(result.rows[0]);
  });

  // -------------------------------------------------------------------
  // Admin (web) buat remote session request baru
  // -------------------------------------------------------------------
  fastify.post("/", async (request, reply) => {
    const agent = await requireAgent(request);
    if (!agent) return reply.status(401).send({ error: "Unauthorized" });

    const { device_id, client_ip } = request.body as {
      device_id?: string;
      client_ip?: string;
    };
    if (!device_id) return reply.status(400).send({ error: "device_id wajib" });

    // Device harus terdaftar (ada secret) supaya bisa menerima request
    const known = await db.query(
      "SELECT 1 FROM device_credentials WHERE device_id = $1",
      [device_id]
    );
    if (!known.rows[0]) {
      return reply.status(404).send({ error: "Device belum terdaftar di aplikasi desktop" });
    }

    // Remote desktop (capture + kontrol) baru diimplementasi untuk macOS.
    // Tolak device lain di server juga — bukan cuma Andong di UI.
    const spec = await db.query(
      "SELECT os_name FROM device_specs WHERE device_id = $1",
      [device_id]
    );
    const osName = String(spec.rows[0]?.os_name || "").toLowerCase();
    if (osName && !osName.includes("darwin") && !osName.includes("mac")) {
      return reply.status(400).send({
        error: "Remote desktop hanya tersedia untuk PC macOS",
      });
    }

    // Cek apakah ada session pending/active untuk device ini
    const existing = await db.query(
      `SELECT id, status FROM remote_sessions
       WHERE device_id = $1 AND status IN ('pending', 'accepted', 'active')
       ORDER BY started_at DESC LIMIT 1`,
      [device_id]
    );
    if (existing.rows[0]) {
      return reply
        .status(409)
        .send({ error: "Ada sesi remote aktif/pending untuk device ini", session: existing.rows[0] });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO remote_sessions (id, device_id, agent_id, agent_name, status, client_ip, last_activity)
       VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_TIMESTAMP)`,
      [id, device_id, agent.id, agent.name, client_ip || null]
    );

    // Publish signaling ke device target
    try {
      const { redis } = await import("../redis.js");
      await redis.publish(
        `remote:${device_id}`,
        JSON.stringify({
          type: "remote_request",
          sessionId: id,
          device_id,
          agent_id: agent.id,
          agent_name: agent.name,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error("[remote] publish signal error:", e);
    }

    return reply.status(201).send({ id, status: "pending" });
  });

  // -------------------------------------------------------------------
  // Admin (web) daftar remote session (riwayat)
  // -------------------------------------------------------------------
  fastify.get("/", async (request, reply) => {
    const agent = await requireAgent(request);
    if (!agent) return reply.status(401).send({ error: "Unauthorized" });
    await expireRemoteSessions();

    const { device_id, status, limit = "50", page = "1" } = request.query as {
      device_id?: string;
      status?: string;
      limit?: string;
      page?: string;
    };

    let query = `SELECT rs.*, u.username as agent_username
                 FROM remote_sessions rs
                 LEFT JOIN users u ON rs.agent_id = u.id`;
    const vals: any[] = [];
    const conds: string[] = [];
    let idx = 1;
    if (device_id) {
      conds.push(`rs.device_id = $${idx++}`);
      vals.push(device_id);
    }
    if (status) {
      conds.push(`rs.status = $${idx++}`);
      vals.push(status);
    }
    if (conds.length) query += ` WHERE ${conds.join(" AND ")}`;
    query += ` ORDER BY rs.started_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    vals.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await db.query(query, vals);
    return reply.send(result.rows);
  });

  // -------------------------------------------------------------------
  // Admin (web) akhiri session secara paksa
  // -------------------------------------------------------------------
  fastify.delete("/:sessionId", async (request, reply) => {
    const agent = await requireAgent(request);
    if (!agent) return reply.status(401).send({ error: "Unauthorized" });

    const { sessionId } = request.params as { sessionId: string };
    await expireRemoteSessions();
    const result = await db.query(
      `UPDATE remote_sessions SET status = 'ended', ended_at = $1, last_activity = CURRENT_TIMESTAMP WHERE id = $2 AND status IN ('pending', 'accepted', 'active') RETURNING *`,
      [new Date().toISOString(), sessionId]
    );
    if (!result.rows[0]) {
      return reply.status(404).send({ error: "Session tidak ditemukan atau sudah berakhir" });
    }

    // Kabari device target supaya hentikan capture
    try {
      const { redis } = await import("../redis.js");
      await redis.publish(
        `remote:${result.rows[0].device_id}`,
        JSON.stringify({
          type: "remote_ended",
          sessionId,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error("[remote] publish ended error:", e);
    }

    return reply.send(result.rows[0]);
  });
};

export default remoteRoutes;
