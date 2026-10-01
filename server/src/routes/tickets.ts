import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";
import { config } from "../config/index.js";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import util from "util";
import sharp from "sharp";
import PDFDocument from "pdfkit";
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

const ALLOWED_IMAGE = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"];

async function saveAttachment(ticketId: string, file: any) {
  if (!ALLOWED_IMAGE.includes((file.mimetype || "").toLowerCase())) return null;

  const buffer = await file.toBuffer();
  if (buffer.length > config.storage.maxFileSize) return null;

  // Konversi ke WebP (libwebp via sharp)
  const webpBuffer = await sharp(buffer)
    .webp({ quality: 82 })
    .toBuffer();

  const storedName = `${uuidv4()}.webp`;
  const uploadDir = path.join(config.storage.path, ticketId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, storedName);
  await writeFile(filePath, webpBuffer);

  const result = await db.query(
    `INSERT INTO attachments (ticket_id, original_name, stored_name, mime_type, size, storage_path, scan_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'clean') RETURNING *`,
    [ticketId, file.filename, storedName, "image/webp", webpBuffer.length, filePath]
  );

  return result.rows[0];
}

async function generateTicketNumber(): Promise<string> {
  const date = dayjs().format("YYYYMMDD");
  const result = await db.query(
    `SELECT ticket_number FROM tickets 
     WHERE ticket_number LIKE $1 
     ORDER BY ticket_number DESC LIMIT 1`,
    [`TKT-${date}-%`]
  );
  
  let sequence = 1;
  if (result.rows[0]) {
    const lastNumber = result.rows[0].ticket_number;
    sequence = parseInt(lastNumber.split("-")[2]) + 1;
  }
  
  return `TKT-${date}-${sequence.toString().padStart(4, "0")}`;
}

const ticketRoutes: FastifyPluginAsync = async (fastify) => {
  // List tickets (user: own tickets, agent/admin: all, guest: by device_id)
  fastify.get("/", async (request, reply) => {
    const { status, search, page = "1", limit = "50", from, to, priority, device_id } = request.query as {
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
      from?: string;
      to?: string;
      priority?: string;
      device_id?: string;
    };

    let user: { id: string; role: string } | null = null;
    try {
      await request.jwtVerify();
      user = request.user as { id: string; role: string };
    } catch {
      // Guest: harus pakai device_id
      if (!device_id) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
    }
    if (!user && !device_id) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    let query = `
      SELECT t.*, u.username as requester_name, u.full_name as requester_full_name,
             a.username as assignee_name,
             COUNT(*) OVER() AS total_count
      FROM tickets t
      LEFT JOIN users u ON t.requester_id = u.id
      LEFT JOIN users a ON t.assignee_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (user && user.role === "user") {
      query += ` AND t.requester_id = $${paramIndex}`;
      params.push(user.id);
      paramIndex++;
    }

    if (user && user.role === "user" && device_id) {
      query += ` AND t.device_id = $${paramIndex}`;
      params.push(device_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (from) {
      query += ` AND t.created_at >= $${paramIndex}`;
      params.push(from);
      paramIndex++;
    }

    if (to) {
      query += ` AND t.created_at < ($${paramIndex}::timestamp + interval '1 day')`;
      params.push(to);
      paramIndex++;
    }

    if (device_id && (!user || user.role !== "user")) {
      query += ` AND t.device_id = $${paramIndex}`;
      params.push(device_id);
      paramIndex++;
    }

    if (search) {
      query += ` AND (t.ticket_number ILIKE $${paramIndex} OR t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY t.updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await db.query(query, params);

    // Get unread counts for user
    if (user && user.role === "user") {
      for (const ticket of result.rows) {
        const unread = await db.query(
          `SELECT COUNT(*) FROM messages 
           WHERE ticket_id = $1 AND sender_role != 'user' AND created_at > 
           COALESCE((SELECT MAX(created_at) FROM messages WHERE ticket_id = $1 AND sender_id = $2), '1970-01-01')`,
          [ticket.id, user.id]
        );
        ticket.unread_count = parseInt(unread.rows[0].count);
      }
    }

    return result.rows;
  });
  
  // Create ticket
  fastify.post("/", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string };
    const { title, description } = request.body as { title: string; description: string };
    
    // Validation
    if (!title || title.length < 5 || title.length > 150) {
      return reply.status(400).send({ error: "Judul harus 5-150 karakter" });
    }
    if (!description || description.length < 10 || description.length > 10000) {
      return reply.status(400).send({ error: "Detail harus 10-10000 karakter" });
    }
    
    // Idempotency: client kirim header Idempotency-Key (PRD FR-05 / AC-03)
    const idempotencyKey = (request.headers["idempotency-key"] as string) || uuidv4();
    const ticketNumber = await generateTicketNumber();

    // Check idempotency
    const idempotentCheck = await db.query(
      "SELECT * FROM tickets WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    if (idempotentCheck.rows[0]) {
      return reply.status(200).send(idempotentCheck.rows[0]);
    }

    const result = await db.query(
      `INSERT INTO tickets (id, ticket_number, requester_id, title, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [uuidv4(), ticketNumber, user.id, title, description, idempotencyKey]
    );
    
    // Add system message
    await db.query(
      `INSERT INTO messages (ticket_id, sender_id, sender_role, message_type, body)
       VALUES ($1, $2, 'system', 'system', 'Tiket dibuat')`,
      [result.rows[0].id, user.id]
    );
    
    return reply.status(201).send(result.rows[0]);
  });
  
  // Guest ticket (device identity, tanpa login)
  fastify.post("/guest", async (request, reply) => {
    const { description, device_id, device_name, priority } = request.body as {
      description: string;
      device_id: string;
      device_name?: string;
      priority?: string;
    };

    if (!device_id || device_id.length < 4) {
      return reply.status(400).send({ error: "Device ID wajib diisi" });
    }
    if (!description || description.length < 10 || description.length > 10000) {
      return reply.status(400).send({ error: "Detail harus 10-10000 karakter" });
    }

    const validPriorities = ["rendah", "normal", "tinggi"];
    if (priority && !validPriorities.includes(priority)) {
      return reply.status(400).send({ error: "Prioritas tidak valid" });
    }

    // Idempotency
    const idempotencyKey = (request.headers["idempotency-key"] as string) || uuidv4();
    const idempotentCheck = await db.query(
      "SELECT * FROM tickets WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    if (idempotentCheck.rows[0]) {
      return reply.status(200).send(idempotentCheck.rows[0]);
    }

    const ticketNumber = await generateTicketNumber();
    const title = description.trim().slice(0, 60);

    const result = await db.query(
      `INSERT INTO tickets (id, ticket_number, title, description, idempotency_key, device_id, device_name, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [uuidv4(), ticketNumber, title, description, idempotencyKey, device_id, device_name || null, priority || "normal"]
    );

    await db.query(
      `INSERT INTO messages (ticket_id, sender_role, message_type, body)
       VALUES ($1, 'system', 'system', 'Tiket dibuat')`,
      [result.rows[0].id]
    );

    return reply.status(201).send(result.rows[0]);
  });

  // Guest upload attachment (verifikasi device)
  fastify.post("/guest/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { device_id } = request.query as { device_id?: string };

    if (!device_id) {
      return reply.status(400).send({ error: "device_id wajib diisi" });
    }

    const ticketResult = await db.query(
      "SELECT * FROM tickets WHERE id = $1 AND device_id = $2",
      [id, device_id]
    );
    if (!ticketResult.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    const files = await request.saveRequestFiles();
    if (!files || files.length === 0) {
      return reply.status(400).send({ error: "Tidak ada file diunggah" });
    }

    if (files.length > config.storage.maxFiles) {
      return reply.status(400).send({ error: `Maksimal ${config.storage.maxFiles} file` });
    }

    const attachments = [];
    for (const file of files) {
      const att = await saveAttachment(id, file);
      if (att) attachments.push(att);
    }

    return reply.status(201).send(attachments);
  });

  // Statistik dashboard (agent/admin only)
  fastify.get("/stats/summary", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const user = request.user as { role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const [byStatus, byPriority, totals, devices] = await Promise.all([
      db.query(`SELECT status, COUNT(*) AS count FROM tickets GROUP BY status`),
      db.query(`SELECT priority, COUNT(*) AS count FROM tickets GROUP BY priority`),
      db.query(`SELECT
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today_new,
                  COUNT(*) FILTER (WHERE status IN ('selesai','ditutup')) AS resolved,
                  COUNT(*) FILTER (WHERE device_id IS NOT NULL) AS from_guest,
                  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolve_seconds
                FROM tickets`),
      db.query(`SELECT COUNT(DISTINCT device_id) AS count FROM tickets WHERE device_id IS NOT NULL`),
    ]);

    return {
      by_status: byStatus.rows,
      by_priority: byPriority.rows,
      totals: totals.rows[0],
      device_count: parseInt(devices.rows[0].count),
    };
  });

  // Tren tiket 14 hari terakhir (untuk line chart)
  fastify.get("/stats/trend", async (request, reply) => {
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
         d::date AS date,
         COUNT(t.id) AS created,
         COUNT(t.id) FILTER (WHERE t.status IN ('selesai','ditutup')) AS resolved
       FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS d
       LEFT JOIN tickets t ON t.created_at::date = d::date
       GROUP BY d::date
       ORDER BY d::date`
    );

    return result.rows.map((r: any) => ({
      date: new Date(r.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      created: parseInt(r.created),
      resolved: parseInt(r.resolved),
    }));
  });

  // Export PDF (agent/admin only)
  fastify.get("/export/pdf", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const user = request.user as { role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const { status, priority, from, to, search, device_id } = request.query as {
      status?: string; priority?: string; from?: string; to?: string; search?: string; device_id?: string;
    };

    let query = `SELECT t.*, a.username AS assignee_name FROM tickets t
                 LEFT JOIN users a ON t.assignee_id = a.id WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (status) { query += ` AND t.status = $${i++}`; params.push(status); }
    if (priority) { query += ` AND t.priority = $${i++}`; params.push(priority); }
    if (from) { query += ` AND t.created_at >= $${i++}`; params.push(from); }
    if (to) { query += ` AND t.created_at < ($${i++}::timestamp + interval '1 day')`; params.push(to); }
    if (device_id) { query += ` AND t.device_id = $${i++}`; params.push(device_id); }
    if (search) { query += ` AND (t.ticket_number ILIKE $${i++} OR t.title ILIKE $${i++} OR t.description ILIKE $${i++})`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    reply.hijack();
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="tickets-export.pdf"`);
    reply.raw.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tickets-export.pdf"`,
    });
    doc.pipe(reply.raw);

    doc.fontSize(16).text("Laporan Tiket", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#555").text(`Dicetak: ${dayjs().format("DD/MM/YYYY HH:mm")} | Total: ${result.rows.length} tiket`, { align: "center" });
    doc.moveDown(1).fillColor("#000");

    const STATUS_LABEL: Record<string, string> = {
      baru: "Baru", sedang_ditangani: "Sedang Ditangani", menunggu_pengguna: "Menunggu Pengguna",
      selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
    };
    const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };

    for (const t of result.rows) {
      doc.fontSize(10).fillColor("#000").text(`${t.ticket_number} — ${STATUS_LABEL[t.status] || t.status}`, { continued: true });
      doc.fillColor("#777").fontSize(8).text(`  ${dayjs(t.created_at).format("DD/MM/YYYY HH:mm")}`);
      doc.fontSize(9).fillColor("#333").text(`Judul: ${t.title}`);
      doc.fontSize(9).fillColor("#555").text(
        `Prioritas: ${PRIO_LABEL[t.priority] || t.priority} | Device: ${t.device_name || t.device_id || "-"} | Agent: ${t.assignee_name || "Belum ditugaskan"}`
      );
      doc.moveDown(0.8);
      if (doc.y > 700) doc.addPage();
    }

    doc.end();
  });

  // Get ticket by ID
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    let user: { id: string; role: string } | null = null;
    try {
      await request.jwtVerify();
      user = request.user as { id: string; role: string };
    } catch {
      // Guest: boleh akses tiket milik device-nya
      const { device_id } = request.query as { device_id?: string };
      if (!device_id) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const own = await db.query("SELECT id FROM tickets WHERE id = $1 AND device_id = $2", [id, device_id]);
      if (!own.rows[0]) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
    }

    const result = await db.query(
      `SELECT t.*, u.username as requester_name, u.email as requester_email,
              u.full_name as requester_full_name, a.username as assignee_name
       FROM tickets t
       LEFT JOIN users u ON t.requester_id = u.id
       LEFT JOIN users a ON t.assignee_id = a.id
       WHERE t.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    const ticket = result.rows[0];

    // Authorization check
    if (user && user.role === "user" && ticket.requester_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }
    
    // Get attachments
    const attachments = await db.query(
      "SELECT * FROM attachments WHERE ticket_id = $1 ORDER BY uploaded_at",
      [id]
    );
    ticket.attachments = attachments.rows;
    
    return ticket;
  });
  
  // Assign ticket to agent (agent/admin only)
  fastify.patch("/:id/assign", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = request.user as { role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }

    const { id } = request.params as { id: string };
    const { assigneeId } = request.body as { assigneeId: string | null };

    const result = await db.query(
      `UPDATE tickets SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [assigneeId || null, id]
    );

    if (!result.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }

    return result.rows[0];
  });

  // Update ticket status
  fastify.patch("/:id/status", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string; role: string };
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    
    const validStatuses = ["baru", "sedang_ditangani", "menunggu_pengguna", "selesai", "ditutup", "dibuka_kembali"];
    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: "Status tidak valid" });
    }
    
    // Get ticket
    const ticketResult = await db.query("SELECT * FROM tickets WHERE id = $1", [id]);
    if (!ticketResult.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }
    
    const ticket = ticketResult.rows[0];
    
    // Authorization: only agent/admin can change status
    if (user.role === "user") {
      // User can only reopen ticket, dan hanya sampai jam 17:00 hari yang sama
      if (status !== "dibuka_kembali" || ticket.status !== "selesai") {
        return reply.status(403).send({ error: "Akses ditolak" });
      }
      const now = new Date();
      const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at) : now;
      const deadline = new Date(resolvedAt);
      deadline.setHours(config.ticket.reopenDeadlineHour, 0, 0, 0);
      if (now > deadline) {
        return reply.status(403).send({ error: "Batas waktu buka kembali telah berakhir (jam 17:00 hari tiket diselesaikan)" });
      }
    }
    
    const now = new Date();
    const updates: string[] = ["status = $1", "updated_at = $2"];
    const params: any[] = [status, now];
    
    if (status === "selesai") {
      updates.push("resolved_at = $3");
      params.push(now);
    }
    if (status === "ditutup") {
      updates.push("closed_at = $" + (params.length + 1));
      params.push(now);
    }
    if (status === "dibuka_kembali") {
      updates.push("reopened_at = $" + (params.length + 1));
      params.push(now);
    }
    
    params.push(id);
    const result = await db.query(
      `UPDATE tickets SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    
    // Audit log
    await db.query(
      `INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value)
       VALUES ($1, $2, 'status_changed', $3, $4)`,
      [id, user.id, ticket.status, status]
    );
    
    return result.rows[0];
  });
  
  // Upload attachment
  fastify.post("/:id/attachments", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string; role: string };
    const { id } = request.params as { id: string };
    
    // Check ticket exists and user has access
    const ticketResult = await db.query("SELECT * FROM tickets WHERE id = $1", [id]);
    if (!ticketResult.rows[0]) {
      return reply.status(404).send({ error: "Tiket tidak ditemukan" });
    }
    
    const ticket = ticketResult.rows[0];
    if (user.role === "user" && ticket.requester_id !== user.id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }
    
    const files = await request.saveRequestFiles();
    if (!files || files.length === 0) {
      return reply.status(400).send({ error: "Tidak ada file diunggah" });
    }
    
    if (files.length > config.storage.maxFiles) {
      return reply.status(400).send({ error: `Maksimal ${config.storage.maxFiles} file` });
    }
    
    const attachments = [];
    for (const file of files) {
      const att = await saveAttachment(id, file);
      if (att) attachments.push(att);
    }
    
    return reply.status(201).send(attachments);
  });
};

export default ticketRoutes;
