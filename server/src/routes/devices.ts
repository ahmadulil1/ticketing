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
         hostname = COALESCE(NULLIF(EXCLUDED.hostname, ''), device_specs.hostname),
         cpu_model = COALESCE(NULLIF(EXCLUDED.cpu_model, ''), device_specs.cpu_model),
         ram_gb = COALESCE(EXCLUDED.ram_gb, device_specs.ram_gb),
         gpu_model = COALESCE(NULLIF(EXCLUDED.gpu_model, ''), device_specs.gpu_model),
         os_name = COALESCE(NULLIF(EXCLUDED.os_name, ''), device_specs.os_name),
         disks = COALESCE(EXCLUDED.disks, device_specs.disks),
         reported_at = CURRENT_TIMESTAMP`,
      [body.device_id, spec.hostname, spec.cpu_model, spec.ram_gb, spec.gpu_model, spec.os_name, spec.disks ? JSON.stringify(spec.disks) : null]
    );

    // Merge device by hostname: app bisa arrive dengan device_id baru (mis. reinstall
    // / ganti origin localStorage) tapi hostname sama -> pindahkan seluruh riwayat
    // ke device_id baru supaya tiket lama tidak orphan.
    if (spec.hostname) {
      const dup = await db.query(
        "SELECT device_id FROM device_specs WHERE hostname = $1 AND device_id <> $2 LIMIT 1",
        [spec.hostname, body.device_id]
      );
      if (dup.rows[0]) {
        const oldId = dup.rows[0].device_id;
        try {
          await db.query("UPDATE tickets SET device_id = $1 WHERE device_id = $2", [body.device_id, oldId]);
          await db.query("UPDATE inventories SET device_id = $1 WHERE device_id = $2", [body.device_id, oldId]);
          await db.query("DELETE FROM device_specs WHERE device_id = $1", [oldId]);
          await db.query("DELETE FROM device_credentials WHERE device_id = $1", [oldId]);
          console.log(`[devices] merge device ${oldId} -> ${body.device_id} (hostname sama)`);
        } catch (e: any) {
          console.error(`[devices] merge ${oldId} -> ${body.device_id} gagal:`, e?.message);
        }
      }
    }

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
      `WITH d AS (
         SELECT
           COALESCE(s.device_id, t.device_id) AS device_id,
           COALESCE(MAX(t.device_name), s.hostname, COALESCE(s.device_id, t.device_id)) AS device_name,
           MAX(s.os_name) AS os_name,
           MAX(s.lokasi) AS lokasi,
           COUNT(t.id) AS ticket_count,
           COUNT(t.id) FILTER (WHERE t.status NOT IN ('selesai', 'ditutup')) AS active_count,
           COUNT(t.id) FILTER (WHERE t.status = 'baru') AS baru_count,
           COALESCE(MAX(t.updated_at), s.reported_at) AS last_activity
         FROM device_specs s
         FULL OUTER JOIN tickets t ON t.device_id = s.device_id
         WHERE COALESCE(s.device_id, t.device_id) IS NOT NULL
         GROUP BY COALESCE(s.device_id, t.device_id), s.hostname, s.reported_at
       )
       SELECT d.*,
         COALESCE(d.lokasi, (
           SELECT i.lokasi FROM inventories i
           WHERE i.device_id = d.device_id
           ORDER BY i.updated_at DESC LIMIT 1
         )) AS lokasi
       FROM d
       ORDER BY d.last_activity DESC`
    );

    return result.rows;
  });

  // Pindah group perangkat. Group milik device (bukan per baris inventaris),
  // jadi semua baris inventaris device ini ikut agar tidak terpecah.
  fastify.patch("/:deviceId/group", async (request, reply) => {
    try { await request.jwtVerify(); }
    catch { return reply.status(401).send({ error: "Unauthorized" }); }
    const { role } = request.user as { role: string };
    if (role !== "admin" && role !== "agent") return reply.status(403).send({ error: "Akses ditolak" });

    const { deviceId } = request.params as { deviceId: string };
    const { lokasi } = request.body as { lokasi?: string };
    const group = (lokasi || "").trim() || null;

    // Device dari tiket belum tentu punya spec; upsert agar group bisa disimpan.
    await db.query(
      `INSERT INTO device_specs (device_id, lokasi) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET lokasi = EXCLUDED.lokasi`,
      [deviceId, group]
    );
    // Sinkronkan baris inventaris agar tampilan lama ikut konsisten.
    await db.query("UPDATE inventories SET lokasi = $1, updated_at = CURRENT_TIMESTAMP WHERE device_id = $2", [group, deviceId]);
    return { device_id: deviceId, lokasi: group };
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
         COALESCE(s.device_id, $1) AS device_id,
         COALESCE(MAX(t.device_name), s.hostname, $1) AS device_name,
         MAX(s.lokasi) AS lokasi,
         COUNT(t.id) AS ticket_count,
         COUNT(t.id) FILTER (WHERE t.status NOT IN ('selesai', 'ditutup')) AS active_count,
         COALESCE(MIN(t.created_at), s.reported_at) AS first_seen,
         COALESCE(MAX(t.updated_at), s.reported_at) AS last_activity
       FROM device_specs s
       FULL OUTER JOIN tickets t ON t.device_id = s.device_id
       WHERE COALESCE(s.device_id, t.device_id) = $1
       GROUP BY s.device_id, s.hostname, s.reported_at`,
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

    // Riwayat penggantian komponen: gabungan dari semua baris inventaris device ini.
    const hardwareEvents = await db.query(
      `SELECT e.id, e.event_date, e.jenis, e.komponen, e.old_detail, e.new_detail,
              e.catatan, e.created_at, i.no_inventaris, u.username AS created_by_name
       FROM hardware_events e
       JOIN inventories i ON i.id = e.inventory_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE i.device_id = $1
       ORDER BY e.event_date DESC, e.created_at DESC`,
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

    return {
      ...info.rows[0],
      tickets: tickets.rows,
      spec: spec.rows[0] || null,
      inventory: inv.rows[0] || null,
      hardware_events: hardwareEvents.rows,
    };
  });

  // Tambah riwayat penggantian komponen untuk device (pakai baris inventaris pertama).
  fastify.post("/:deviceId/hardware-events", async (request, reply) => {
    try { await request.jwtVerify(); }
    catch { return reply.status(401).send({ error: "Unauthorized" }); }
    const { role, id: userId } = request.user as { role: string; id: string };
    if (role !== "admin" && role !== "agent") return reply.status(403).send({ error: "Akses ditolak" });

    const { deviceId } = request.params as { deviceId: string };
    const inv = await db.query("SELECT id FROM inventories WHERE device_id = $1 ORDER BY created_at LIMIT 1", [deviceId]);
    if (!inv.rows[0]) return reply.status(404).send({ error: "Device belum punya aset terdaftar" });

    const { event_date, jenis = "ganti", komponen, old_detail, new_detail, catatan } = (request.body || {}) as any;
    if (typeof komponen !== "string" || !komponen.trim() || komponen.trim().length > 100) return reply.status(400).send({ error: "Komponen wajib diisi, maksimal 100 karakter" });
    if (typeof event_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(event_date) || !Number.isFinite(Date.parse(event_date)) || new Date(event_date).toISOString().slice(0, 10) !== event_date) return reply.status(400).send({ error: "Tanggal tidak valid" });
    if (!["ganti", "upgrade", "perbaikan"].includes(jenis)) return reply.status(400).send({ error: "Jenis riwayat tidak valid" });
    if ([old_detail, new_detail, catatan].some(value => value !== undefined && (typeof value !== "string" || value.length > 2000))) return reply.status(400).send({ error: "Detail maksimal 2000 karakter" });

    await db.query(
      `INSERT INTO hardware_events (inventory_id, event_date, jenis, komponen, old_detail, new_detail, catatan, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [inv.rows[0].id, event_date, jenis || "ganti", String(komponen).trim(), old_detail || null, new_detail || null, catatan || null, userId]
    );
    return { success: true };
  });
};

export default deviceRoutes;
