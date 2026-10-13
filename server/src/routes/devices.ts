import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  // Report spec dari desktop app (tanpa JWT; device self-identify via device_id-nya)
  fastify.post("/report", async (request, reply) => {
    const body = request.body as any;
    if (!body?.device_id || typeof body.device_id !== "string" || body.device_id.length > 100) {
      return reply.status(400).send({ error: "device_id wajib" });
    }
    const spec = {
      hostname: String(body.hostname || "").slice(0, 255) || null,
      cpu_model: String(body.cpu_model || "").slice(0, 255) || null,
      ram_gb: Number.isFinite(body.ram_gb) ? Math.round(body.ram_gb) : null,
      gpu_model: String(body.gpu_model || "").slice(0, 255) || null,
      os_name: String(body.os_name || "").slice(0, 255) || null,
      disks: Array.isArray(body.disks) ? body.disks.slice(0, 20) : null,
    };
    await db.query(
      `INSERT INTO device_specs (device_id, hostname, cpu_model, ram_gb, gpu_model, os_name, disks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (device_id) DO UPDATE SET
         hostname = EXCLUDED.hostname,
         cpu_model = EXCLUDED.cpu_model,
         ram_gb = EXCLUDED.ram_gb,
         gpu_model = EXCLUDED.gpu_model,
         os_name = EXCLUDED.os_name,
         disks = EXCLUDED.disks,
         reported_at = CURRENT_TIMESTAMP`,
      [body.device_id, spec.hostname, spec.cpu_model, spec.ram_gb, spec.gpu_model, spec.os_name, spec.disks ? JSON.stringify(spec.disks) : null]
    );

    // Auto-buat aset inventaris untuk device baru (admin isi no/lokasi manual,
    // lalu masukkan ke cabang/group manual lewat UI)
    const has = await db.query(`SELECT id FROM inventories WHERE device_id = $1`, [body.device_id]);
    if (!has.rows[0]) {
      for (let i = 0; i < 5; i++) {
        const noInv = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        try {
          await db.query(
            `INSERT INTO inventories (no_inventaris, device_id) VALUES ($1, $2)`,
            [noInv, body.device_id]
          );
          break;
        } catch (e: any) {
          if (e.code !== "23505") throw e;
        }
      }
    }
    return { ok: true };
  });

  // List semua device (agent/admin only)
  fastify.get("/", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = request.user as { role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const result = await db.query(
      `SELECT
         device_id,
         MAX(device_name) AS device_name,
         COUNT(*) AS ticket_count,
         COUNT(*) FILTER (WHERE status NOT IN ('selesai', 'ditutup')) AS active_count,
         COUNT(*) FILTER (WHERE status = 'baru') AS baru_count,
         MAX(updated_at) AS last_activity
       FROM tickets
       WHERE device_id IS NOT NULL
       GROUP BY device_id
       ORDER BY MAX(updated_at) DESC`
    );

    return result.rows;
  });

  // Detail device + semua tiketnya
  fastify.get("/:deviceId", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = request.user as { role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const { deviceId } = request.params as { deviceId: string };

    const info = await db.query(
      `SELECT
         device_id,
         MAX(device_name) AS device_name,
         COUNT(*) AS ticket_count,
         COUNT(*) FILTER (WHERE status NOT IN ('selesai', 'ditutup')) AS active_count,
         MAX(created_at) AS first_seen,
         MAX(updated_at) AS last_activity
       FROM tickets
       WHERE device_id = $1
       GROUP BY device_id`,
      [deviceId]
    );

    if (!info.rows[0]) {
      return reply.status(404).send({ error: "Device tidak ditemukan" });
    }

    const spec = await db.query(`SELECT * FROM device_specs WHERE device_id = $1`, [deviceId]);
    const inv = await db.query(
      `SELECT id, no_inventaris FROM inventories WHERE device_id = $1 LIMIT 1`,
      [deviceId]
    );

    const tickets = await db.query(
      `SELECT t.*, a.username AS assignee_name
       FROM tickets t
       LEFT JOIN users a ON t.assignee_id = a.id
       WHERE t.device_id = $1
       ORDER BY t.updated_at DESC`,
      [deviceId]
    );

    return { ...info.rows[0], tickets: tickets.rows, spec: spec.rows[0] || null, inventory: inv.rows[0] || null };
  });
};

export default deviceRoutes;
