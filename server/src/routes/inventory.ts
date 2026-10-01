import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

async function requireStaff(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const user = request.user as { role: string; id: string };
  if (user.role === "user") {
    return reply.status(403).send({ error: "Akses ditolak" });
  }
  return user;
}

const LIST_SQL = `
  SELECT i.id, i.no_inventaris, i.device_id, i.lokasi, i.catatan, i.created_at, i.updated_at,
         s.hostname, s.cpu_model, s.ram_gb, s.gpu_model, s.os_name, s.disks, s.reported_at
  FROM inventories i
  LEFT JOIN device_specs s ON s.device_id = i.device_id`;

const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // List + cari (no_inventaris, hostname, lokasi)
  fastify.get("/", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { q } = request.query as { q?: string };
    let sql = LIST_SQL;
    const params: any[] = [];
    if (q) {
      sql += ` WHERE i.no_inventaris ILIKE $1 OR s.hostname ILIKE $1 OR i.lokasi ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY i.created_at DESC`;
    return (await db.query(sql, params)).rows;
  });

  fastify.post("/", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { no_inventaris, device_id, lokasi, catatan } = request.body as any;
    if (!no_inventaris || !String(no_inventaris).trim()) {
      return reply.status(400).send({ error: "No inventaris wajib diisi" });
    }
    const noInv = String(no_inventaris).trim();
    if (!/^[0-9]{9}$/.test(noInv)) {
      return reply.status(400).send({ error: "No inventaris harus 9 digit angka" });
    }
    try {
      const res = await db.query(
        `INSERT INTO inventories (no_inventaris, device_id, lokasi, catatan)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [String(no_inventaris).trim(), device_id || null, lokasi || null, catatan || null]
      );
      return await detail(res.rows[0].id);
    } catch (e: any) {
      if (e.code === "23505") {
        return reply.status(409).send({ error: "No inventaris sudah dipakai" });
      }
      if (e.code === "23503") {
        return reply.status(400).send({ error: "Device tidak dikenal" });
      }
      throw e;
    }
  });

  async function detail(id: string) {
    const inv = (await db.query(`${LIST_SQL} WHERE i.id = $1`, [id])).rows[0];
    if (inv) {
      const ev = await db.query(
        `SELECT e.*, u.username AS created_by_name
         FROM hardware_events e LEFT JOIN users u ON u.id = e.created_by
         WHERE e.inventory_id = $1 ORDER BY e.event_date DESC, e.created_at DESC`,
        [id]
      );
      inv.events = ev.rows;
      if (inv.device_id) {
        const t = await db.query(
          `SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status NOT IN ('selesai','ditutup')) AS aktif
           FROM tickets WHERE device_id = $1`,
          [inv.device_id]
        );
        inv.ticket_total = Number(t.rows[0].total);
        inv.ticket_aktif = Number(t.rows[0].aktif);
      }
    }
    return inv;
  }

  fastify.get("/:id", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const inv = await detail(id);
    if (!inv) return reply.status(404).send({ error: "Tidak ditemukan" });
    return inv;
  });

  fastify.patch("/:id", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const { no_inventaris, device_id, lokasi, catatan } = request.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    const full = (await db.query(`SELECT no_inventaris FROM inventories WHERE id = $1`, [id])).rows[0];
    if (!full) return reply.status(404).send({ error: "Tidak ditemukan" });
    if (typeof no_inventaris === "string" && no_inventaris.trim() && no_inventaris.trim() !== full.no_inventaris) push("no_inventaris", no_inventaris.trim());
    if (device_id !== undefined) push("device_id", device_id || null);
    if (lokasi !== undefined) push("lokasi", lokasi || null);
    if (catatan !== undefined) push("catatan", catatan || null);
    if (sets.length === 0) return detail(id);
    params.push(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    try {
      await db.query(`UPDATE inventories SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    } catch (e: any) {
      if (e.code === "23505") return reply.status(409).send({ error: "No inventaris sudah dipakai" });
      throw e;
    }
    return detail(id);
  });

  fastify.delete("/:id", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const res = await db.query(`DELETE FROM inventories WHERE id = $1`, [id]);
    return { deleted: res.rowCount ?? 0 };
  });

  // Riwayat hardware: tambah
  fastify.post("/:id/events", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const valid = await db.query(`SELECT id FROM inventories WHERE id = $1`, [id]);
    if (!valid.rows[0]) return reply.status(404).send({ error: "Inventaris tidak ditemukan" });
    const { event_date, jenis, komponen, old_detail, new_detail, catatan } = request.body as any;
    if (!komponen || !String(komponen).trim()) {
      return reply.status(400).send({ error: "Komponen wajib diisi" });
    }
    if (!event_date) return reply.status(400).send({ error: "Tanggal wajib diisi" });
    const res = await db.query(
      `INSERT INTO hardware_events (inventory_id, event_date, jenis, komponen, old_detail, new_detail, catatan, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [id, event_date, jenis || "ganti", String(komponen).trim(), old_detail || null, new_detail || null, catatan || null, staff.id]
    );
    return detail(id);
  });

  // Riwayat hardware: hapus
  fastify.delete("/events/:eventId", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { eventId } = request.params as { eventId: string };
    const res = await db.query(`DELETE FROM hardware_events WHERE id = $1`, [eventId]);
    if ((res.rowCount ?? 0) === 0) return reply.status(404).send({ error: "Event tidak ditemukan" });
    return { deleted: res.rowCount };
  });
};

export default inventoryRoutes;
