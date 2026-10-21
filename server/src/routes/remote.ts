import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";

// Tandai sesi yang idle > 30 menit sebagai timeout
async function expireIdleSessions() {
  await db.query(
    `UPDATE remote_sessions
     SET status = 'timeout', ended_at = CURRENT_TIMESTAMP
     WHERE status IN ('pending', 'accepted', 'active')
       AND last_activity < NOW() - INTERVAL '30 minutes'`
  );
}

// Segera tandai idle session agar subsequent read bersih
expireIdleSessions().catch(() => {});

const remoteRoutes: FastifyPluginAsync = async (fastify) => {
  // Agent (desktop) meminta daftar remote session pending untuk device-nya
  fastify.get("/pending", async (request, reply) => {
    const { device_id } = request.query as { device_id?: string };
    if (!device_id) return reply.status(400).send({ error: "device_id wajib" });
    await expireIdleSessions();

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

  // Agent (desktop) mengupdate status session (accepted/rejected/ended/timeout)
  fastify.patch("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { status, client_ip, note } = request.body as {
      status?: string;
      client_ip?: string;
      note?: string;
    };

    if (!status || !["accepted", "rejected", "ended", "timeout"].includes(status)) {
      return reply.status(400).send({ error: "status wajib dan valid" });
    }
    await expireIdleSessions();

    const updateCols: string[] = [];
    const updateVals: any[] = [];
    let idx = 1;
    if (status) {
      updateCols.push(`status = $${idx++}`);
      updateVals.push(status);
      if (status === "accepted") updateCols.push(`accepted_at = $${idx++}`), updateVals.push(new Date().toISOString());
      if (["ended", "timeout", "rejected"].includes(status))
        updateCols.push(`ended_at = $${idx++}`), updateVals.push(new Date().toISOString());
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

  // Agent (desktop) mengupdate status session (accepted/rejected/ended/timeout)
  fastify.patch("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { status, client_ip, note } = request.body as {
      status?: string;
      client_ip?: string;
      note?: string;
    };

    if (!status || !["accepted", "rejected", "ended", "timeout"].includes(status)) {
      return reply.status(400).send({ error: "status wajib dan valid" });
    }

    const updateCols: string[] = [];
    const updateVals: any[] = [];
    let idx = 1;
    if (status) {
      updateCols.push(`status = $${idx++}`);
      updateVals.push(status);
      if (status === "accepted") updateCols.push(`accepted_at = $${idx++}`), updateVals.push(new Date().toISOString());
      if (["ended", "timeout", "rejected"].includes(status))
        updateCols.push(`ended_at = $${idx++}`), updateVals.push(new Date().toISOString());
    }
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

  // Admin (web) membuat remote session request baru
  fastify.post("/", async (request, reply) => {
    const { device_id, agent_id, agent_name, client_ip } = request.body as {
      device_id: string;
      agent_id?: string;
      agent_name?: string;
      client_ip?: string;
    };
    if (!device_id) return reply.status(400).send({ error: "device_id wajib" });

    // Cek apakah ada session pending/active untuk device ini
    const existing = await db.query(
      `SELECT id, status FROM remote_sessions
       WHERE device_id = $1 AND status IN ('pending', 'accepted', 'active')
       ORDER BY started_at DESC LIMIT 1`,
      [device_id]
    );
    if (existing.rows[0]) {
      return reply.status(409).send({ error: "Ada sesi remote aktif/pending untuk device ini", session: existing.rows[0] });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO remote_sessions (id, device_id, agent_id, agent_name, status, client_ip, last_activity)
       VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_TIMESTAMP)`,
      [id, device_id, agent_id || null, agent_name || null, client_ip || null]
    );

    // Publish signaling channel untuk agent desktop
    try {
      const { redis } = await import("../redis.js");
      await redis.publish(
        "remote:signal",
        JSON.stringify({
          type: "remote_request",
          sessionId: id,
          device_id,
          agent_id: agent_id || null,
          agent_name: agent_name || null,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error("[remote] publish signal error:", e);
    }

    return reply.status(201).send({ id, status: "pending" });
  });

  // Admin (web) daftar remote session
  fastify.get("/", async (request, reply) => {
    await expireIdleSessions();
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

  // Admin (web) akhiri session secara paksa
  fastify.delete("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    await expireIdleSessions();
    const result = await db.query(
      `UPDATE remote_sessions SET status = 'ended', ended_at = $1, last_activity = CURRENT_TIMESTAMP WHERE id = $2 AND status IN ('pending', 'accepted', 'active') RETURNING *`,
      [new Date().toISOString(), sessionId]
    );
    if (!result.rows[0]) return reply.status(404).send({ error: "Session tidak ditemukan atau sudah berakhir" });

    try {
      const { redis } = await import("../redis.js");
      await redis.publish(
        "remote:signal",
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
