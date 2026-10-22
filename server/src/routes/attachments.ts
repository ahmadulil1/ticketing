import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";
import { config } from "../config/index.js";
import fs from "fs";
import { createGalleryAccess, readGalleryAccess } from "../lib/gallery-access.js";
import {
  saveAttachment,
  listAttachments,
} from "../lib/attachments.js";

/**
 * Lampiran (gambar).
 *
 * - GET    /attachments/:id            -> serve file (dipakai <img src>)
 * - GET    /attachments/ticket/:id      -> semua lampiran sebuah tiket
 * - POST   /attachments/ticket/:id      -> upload gambar (multipart)
 *
 * Akses:
 * - Admin/agent: JWT biasa.
 * - Tamu (desktop app): device_id + device_secret, cuma tiketnya sendiri.
 * - Query `?token=<jwt>` juga diterima supaya <img src> bisa auth
 *   (tag <img> tak bisa kirim header Authorization).
 */

async function verifyAccess(
  request: any,
  ticketId: string
): Promise<{ id: string; role: string } | null> {
  if (request.query?.gallery_token) {
    return request.method === "GET" ? readGalleryAccess(String(request.query.gallery_token), ticketId) : null;
  }
  // 1. JWT (header Authorization ATAU query token untuk <img>)
  try {
    await request.jwtVerify();
    return request.user as { id: string; role: string };
  } catch {
    const q = request.query as { token?: string };
    if (q.token) {
      try {
        return request.server.jwt.verify(q.token) as { id: string; role: string };
      } catch {
        /* lanjut ke device */
      }
    }
  }

  // 2. Tamu: device_id + device_secret
  const q = request.query as { device_id?: string; device_secret?: string };
  if (!q.device_id || !q.device_secret) return null;

  const cred = await db.query(
    "SELECT device_id FROM device_credentials WHERE device_id = $1 AND device_secret = $2",
    [q.device_id, q.device_secret]
  );
  if (!cred.rows[0]) return null;

  const own = await db.query(
    "SELECT id FROM tickets WHERE id = $1 AND device_id = $2",
    [ticketId, q.device_id]
  );
  if (!own.rows[0]) return null;

  return { id: q.device_id, role: "user" };
}

const attachmentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/ticket/:ticketId/gallery-link", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const user = await verifyAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ticket = (await db.query("SELECT requester_id, device_id FROM tickets WHERE id = $1", [ticketId])).rows[0];
    if (!ticket) return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    if (user.role === "user" && ticket.requester_id !== user.id && ticket.device_id !== user.id) return reply.status(403).send({ error: "Akses ditolak" });
    reply.header("Cache-Control", "no-store");
    return { token: createGalleryAccess(ticketId, user), expires_in: 600 };
  });
  // ---------------------------------------------------------------------
  // Serve file lampiran
  // ---------------------------------------------------------------------
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const res = await db.query(
      "SELECT * FROM attachments WHERE id = $1",
      [id]
    );
    const att = res.rows[0];
    if (!att) {
      return reply.status(404).send({ error: "Lampiran tidak ditemukan" });
    }

    // Cek akses based on tiketnya
    const ticket = await db.query(
      "SELECT id, requester_id, device_id FROM tickets WHERE id = $1",
      [att.ticket_id]
    );
    if (!ticket.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    const user = await verifyAccess(request, att.ticket_id);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const t = ticket.rows[0];
    if (user.role === "user" && t.requester_id !== user.id && t.device_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    if (user.role === "user" && att.message_id) {
      const message = await db.query("SELECT message_type FROM messages WHERE id = $1", [att.message_id]);
      if (!message.rows[0] || message.rows[0].message_type === "internal") {
        return reply.status(403).send({ error: "Akses ditolak" });
      }
    }

    // File-nya ada di storage_path
    const filePath = att.storage_path;
    if (!filePath || !fs.existsSync(filePath)) {
      return reply.status(404).send({ error: "File tidak ada di storage" });
    }

    reply.header("Content-Type", att.mime_type || "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(att.original_name || "gambar")}"`
    );
    reply.header("Cache-Control", "no-store");
    return reply.send(fs.createReadStream(filePath));
  });

  // ---------------------------------------------------------------------
  // Semua lampiran sebuah tiket
  // ---------------------------------------------------------------------
  fastify.get("/ticket/:ticketId", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const user = await verifyAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const ticket = await db.query(
      "SELECT id, requester_id, device_id FROM tickets WHERE id = $1",
      [ticketId]
    );
    if (!ticket.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }
    const t = ticket.rows[0];
    if (user.role === "user" && t.requester_id !== user.id && t.device_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    return listAttachments(ticketId, undefined, user.role === "user");
  });

  // ---------------------------------------------------------------------
  // Upload gambar
  // ---------------------------------------------------------------------
  fastify.post("/ticket/:ticketId", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const user = await verifyAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const ticket = await db.query(
      "SELECT id, requester_id, device_id, status FROM tickets WHERE id = $1",
      [ticketId]
    );
    if (!ticket.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }
    const t = ticket.rows[0];
    if (user.role === "user" && t.requester_id !== user.id && t.device_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    if (t.status === "ditutup") return reply.status(400).send({ error: "Tiket sudah ditutup" });
    const files = await request.saveRequestFiles();
    if (!files || files.length === 0) {
      return reply.status(400).send({ error: "Tidak ada file diunggah" });
    }
    if (files.length > config.storage.maxFiles) {
      return reply.status(400).send({
        error: `Maksimal ${config.storage.maxFiles} file`,
      });
    }

    try {
      const saved = [];
      for (const file of files) {
        saved.push(await saveAttachment(ticketId, file));
      }
      return reply.status(201).send(saved);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "File tidak valid" });
    }
  });
};

export default attachmentRoutes;
