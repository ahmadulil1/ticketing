import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";

// Guest akses: tiket milik device_id yang dikirim di query
async function verifyTicketAccess(
  request: any,
  ticketId: string
): Promise<{ id: string; role: string } | null> {
  let user: { id: string; role: string } | null = null;
  try {
    await request.jwtVerify();
    user = request.user as { id: string; role: string };
  } catch {
    const { device_id } = request.query as { device_id?: string };
    if (!device_id) return null;
    const own = await db.query(
      "SELECT id FROM tickets WHERE id = $1 AND device_id = $2",
      [ticketId, device_id]
    );
    if (!own.rows[0]) return null;
    user = { id: device_id, role: "user" };
  }
  return user;
}

const messageRoutes: FastifyPluginAsync = async (fastify) => {
  // Get messages for a ticket
  fastify.get("/ticket/:ticketId", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const { page = "1", limit = "50" } = request.query as { page?: string; limit?: string };

    const user = await verifyTicketAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const ticketResult = await db.query("SELECT * FROM tickets WHERE id = $1", [ticketId]);
    if (!ticketResult.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    const ticket = ticketResult.rows[0];
    if (user.role === "user" && ticket.requester_id !== user.id && ticket.device_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await db.query(
      `SELECT m.*, u.username as sender_name, u.full_name as sender_full_name
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [ticketId, parseInt(limit), offset]
    );

    return result.rows;
  });
  
  // Mark messages as read (read receipts)
  fastify.post("/ticket/:ticketId/read", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const user = await verifyTicketAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    // Tandai semua pesan dari pihak lain yang belum dibaca
    const otherRole = user.role === "user" ? "agent" : "user";
    await db.query(
      `UPDATE messages
       SET read_at = CURRENT_TIMESTAMP
       WHERE ticket_id = $1 AND sender_role = $2 AND read_at IS NULL`,
      [ticketId, otherRole]
    );

    // Broadcast read receipt ke lawan biar badge unread turun instan
    const redis = (fastify as any).redis;
    if (redis) {
      await redis.publish(
        `ticket:${ticketId}`,
        JSON.stringify({ type: "message_read", ticketId, readBy: user.role })
      );
    }

    return { success: true };
  });

  // Jumlah pesan belum dibaca per tiket (untuk badge lonceng / titik merah)
  fastify.get("/unread", async (request, reply) => {
    let role = "user";
    let deviceId: string | null = null;
    try {
      await request.jwtVerify();
      role = (request.user as { role: string }).role;
    } catch {
      const q = request.query as { device_id?: string };
      if (!q.device_id) return reply.status(401).send({ error: "Unauthorized" });
      deviceId = q.device_id;
    }

    // admin/agent: hitung pesan dari user; guest: hitung pesan dari agent di tiket device-nya
    const result = await db.query(
      `SELECT m.ticket_id, COUNT(*)::int AS unread
       FROM messages m
       WHERE m.read_at IS NULL
         AND m.sender_role = $1
         ${deviceId ? "AND m.ticket_id IN (SELECT id FROM tickets WHERE device_id = $2)" : ""}
       GROUP BY m.ticket_id`,
      deviceId ? ["agent", deviceId] : ["user"]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) counts[row.ticket_id] = row.unread;
    return counts;
  });

  // Typing indicator (Redis, TTL 5 detik)
  fastify.post("/ticket/:ticketId/typing", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const user = await verifyTicketAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { isTyping } = request.body as { isTyping?: boolean };

    const redis = (fastify as any).redis;
    if (!redis) return { success: false };

    if (isTyping) {
      await redis.set(`typing:${ticketId}:${user.id}`, JSON.stringify({
        userId: user.id,
        username: user.id,
        role: user.role,
        at: Date.now(),
      }), "EX", 5);
    } else {
      await redis.del(`typing:${ticketId}:${user.id}`);
    }

    // Broadcast via pub/sub
    await redis.publish(
      `ticket:${ticketId}`,
      JSON.stringify({ type: "typing", ticketId, userId: user.id, role: user.role, isTyping })
    );

    return { success: true };
  });

  // Who is typing
  fastify.get("/ticket/:ticketId/typing", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const redis = (fastify as any).redis;
    if (!redis) return [];

    const user = await verifyTicketAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const keys = await redis.keys(`typing:${ticketId}:*`);
    if (!keys || keys.length === 0) return [];

    const values = await redis.mget(...keys);
    const typing = [];
    for (const v of values) {
      if (!v) continue;
      try {
        const t = JSON.parse(v);
        // Jangan laporkan typing diri sendiri
        if (t.userId === user.id) continue;
        typing.push(t);
      } catch {}
    }
    return typing;
  });

  // Send message
  fastify.post("/ticket/:ticketId", async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const { body, clientRequestId, message_type } = request.body as {
      body: string;
      clientRequestId?: string;
      message_type?: string;
    };

    // Validation
    if (!body || body.trim().length === 0) {
      return reply.status(400).send({ error: "Pesan tidak boleh kosong" });
    }
    if (body.length > 5000) {
      return reply.status(400).send({ error: "Pesan maksimal 5000 karakter" });
    }

    const user = await verifyTicketAccess(request, ticketId);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    // Check ticket exists and not closed
    const ticketResult = await db.query("SELECT * FROM tickets WHERE id = $1", [ticketId]);
    if (!ticketResult.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    const ticket = ticketResult.rows[0];
    if (ticket.status === "ditutup") {
      return reply.status(400).send({ error: "Tiket sudah ditutup" });
    }

    if (user.role === "user" && ticket.requester_id !== user.id && ticket.device_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }
    
    // Idempotency check
    const requestId = clientRequestId || uuidv4();
    const existing = await db.query(
      "SELECT * FROM messages WHERE client_request_id = $1",
      [requestId]
    );
    if (existing.rows[0]) {
      return reply.status(200).send(existing.rows[0]);
    }
    
    // Determine sender_role
    const senderRole = user.role === "user" ? "user" : "agent";
    const msgType = user.role === "agent" && message_type === "internal" ? "internal" : "public";

    // sender_id: null untuk guest (identity device, bukan user terdaftar)
    const realSenderId = user.role === "user" ? null : user.id;

    const result = await db.query(
      `INSERT INTO messages (id, ticket_id, sender_id, sender_role, message_type, body, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [uuidv4(), ticketId, realSenderId, senderRole, msgType, body, requestId]
    );
    
    // Update ticket updated_at
    await db.query("UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [ticketId]);
    
    const message = result.rows[0];
    
    // Broadcast via Redis pub/sub
    const redis = fastify.redis;
    if (redis) {
      await redis.publish(
        `ticket:${ticketId}`,
        JSON.stringify({
          type: "new_message",
          message: message,
        })
      );
    }
    
    return reply.status(201).send(message);
  });
  
  // Retry failed message
  fastify.post("/ticket/:ticketId/retry", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const { ticketId } = request.params as { ticketId: string };
    const { clientRequestId, body } = request.body as { clientRequestId: string; body: string };
    
    if (!clientRequestId) {
      return reply.status(400).send({ error: "clientRequestId wajib diisi" });
    }
    
    // Check if already exists
    const existing = await db.query(
      "SELECT * FROM messages WHERE client_request_id = $1",
      [clientRequestId]
    );
    if (existing.rows[0]) {
      return reply.status(200).send(existing.rows[0]);
    }
    
    // Create new message
    const user = request.user as { id: string; role: string };
    const senderRole = user.role === "user" ? "user" : "agent";
    
    const result = await db.query(
      `INSERT INTO messages (id, ticket_id, sender_id, sender_role, message_type, body, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [uuidv4(), ticketId, user.id, senderRole, "public", body, clientRequestId]
    );
    
    return reply.status(201).send(result.rows[0]);
  });
};

export default messageRoutes;
