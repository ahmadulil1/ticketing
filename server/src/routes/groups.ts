import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

async function requireStaff(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const user = request.user as { role: string };
  if (user.role === "user") {
    return reply.status(403).send({ error: "Akses ditolak" });
  }
  return user;
}

// Master lokasi/group device. GET publik (form tiket guest butuh daftar ini),
// tulap hanya agent/admin.
const groupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    const res = await db.query(
      `SELECT id, nama, created_at FROM device_groups ORDER BY nama`
    );
    return res.rows;
  });

  fastify.post("/", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { nama } = request.body as { nama?: string };
    const trimmed = (nama || "").trim();
    if (!trimmed) {
      return reply.status(400).send({ error: "Nama group wajib diisi" });
    }
    if (trimmed.length > 100) {
      return reply.status(400).send({ error: "Nama group maksimal 100 karakter" });
    }
    try {
      const res = await db.query(
        `INSERT INTO device_groups (nama) VALUES ($1) RETURNING id, nama, created_at`,
        [trimmed]
      );
      return reply.status(201).send(res.rows[0]);
    } catch (e: any) {
      if (e.code === "23505") {
        return reply.status(409).send({ error: "Nama group sudah dipakai" });
      }
      throw e;
    }
  });

  fastify.delete("/:id", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const res = await db.query(`DELETE FROM device_groups WHERE id = $1`, [id]);
    if ((res.rowCount ?? 0) === 0) {
      return reply.status(404).send({ error: "Group tidak ditemukan" });
    }
    return { deleted: res.rowCount };
  });

  // Rename group; nama lama di inventaris & tiket tidak di-sync otomatis
  // (lokasi disimpan sebagai string). ponytail: sync bisa di-add saat > 50 group.
  fastify.patch("/:id", async (request, reply) => {
    const staff: any = await requireStaff(request, reply);
    if (!staff) return;
    const { id } = request.params as { id: string };
    const { nama } = request.body as { nama?: string };
    const trimmed = (nama || "").trim();
    if (!trimmed) {
      return reply.status(400).send({ error: "Nama group wajib diisi" });
    }
    try {
      const res = await db.query(
        `UPDATE device_groups SET nama = $1 WHERE id = $2 RETURNING id, nama, created_at`,
        [trimmed, id]
      );
      if (!res.rows[0]) {
        return reply.status(404).send({ error: "Group tidak ditemukan" });
      }
      return res.rows[0];
    } catch (e: any) {
      if (e.code === "23505") {
        return reply.status(409).send({ error: "Nama group sudah dipakai" });
      }
      throw e;
    }
  });
};

export default groupRoutes;
