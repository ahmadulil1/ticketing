import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

async function requireStaff(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  const user = request.user as { id: string; role: string };
  if (user.role !== "agent" && user.role !== "admin") {
    reply.status(403).send({ error: "Akses ditolak" });
    return null;
  }
  return user;
}

const templateRoutes: FastifyPluginAsync = async (fastify) => {
  // List templates
  fastify.get("/", async (request, reply) => {
    const user = await requireStaff(request, reply);
    if (!user) return;
    const result = await db.query(
      `SELECT t.*, COALESCE(u.full_name, u.username) AS creator_name
       FROM ticket_templates t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.name ASC`
    );
    return result.rows;
  });

  // Create template
  fastify.post("/", async (request, reply) => {
    const user = await requireStaff(request, reply);
    if (!user) return;
    const { name, body } = (request.body || {}) as { name?: string; body?: string };
    if (!name || typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return reply.status(400).send({ error: "Nama template wajib diisi (maks 100 karakter)" });
    }
    if (!body || typeof body !== "string" || !body.trim() || body.trim().length > 5000) {
      return reply.status(400).send({ error: "Isi template wajib diisi (maks 5000 karakter)" });
    }

    const res = await db.query(
      `INSERT INTO ticket_templates (name, body, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), body.trim(), user.id]
    );
    return reply.status(201).send(res.rows[0]);
  });

  // Update template
  fastify.patch("/:id", async (request, reply) => {
    const user = await requireStaff(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const { name, body } = (request.body || {}) as { name?: string; body?: string };

    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return reply.status(400).send({ error: "Nama template tidak valid" });
      }
      params.push(name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (body !== undefined) {
      if (typeof body !== "string" || !body.trim() || body.trim().length > 5000) {
        return reply.status(400).send({ error: "Isi template tidak valid" });
      }
      params.push(body.trim());
      updates.push(`body = $${params.length}`);
    }

    params.push(id);
    const res = await db.query(
      `UPDATE ticket_templates SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!res.rows[0]) return reply.status(404).send({ error: "Template tidak ditemukan" });
    return res.rows[0];
  });

  // Delete template
  fastify.delete("/:id", async (request, reply) => {
    const user = await requireStaff(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const res = await db.query("DELETE FROM ticket_templates WHERE id = $1 RETURNING id", [id]);
    if (!res.rows[0]) return reply.status(404).send({ error: "Template tidak ditemukan" });
    return { success: true };
  });
};

export default templateRoutes;
