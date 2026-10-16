import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/index.js";
import { db, initDb } from "./database.js";
import { initRedis, redis, subClient } from "./redis.js";

// Routes
import authRoutes from "./routes/auth.js";
import ticketRoutes from "./routes/tickets.js";
import messageRoutes from "./routes/messages.js";
import userRoutes from "./routes/users.js";
import deviceRoutes from "./routes/devices.js";
import inventoryRoutes from "./routes/inventory.js";
import groupRoutes from "./routes/groups.js";

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // Register plugins
  const allowedOrigins = new Set([
    "http://192.168.0.100",
    "https://ticketing.marisoncloud.com",
    "http://localhost:5173",
    "http://localhost:1420",
    "tauri://localhost",
    "https://tauri.localhost",
  ]);
  await fastify.register(cors, {
    // Native/Tauri dan non-browser tak mengirim Origin; browser wajib whitelist.
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
  });
  await fastify.register(websocket);
  await fastify.register(multipart, {
    limits: {
      fileSize: config.storage.maxFileSize,
      // ponytail: files limit sengaja longgar — plugin kirim pesan Inggris (FST_FILES_LIMIT)
      // yang tak bisa di-override error handler global. Validasi jumlah ada di route.
      files: 64,
    },
  });
  await fastify.register(jwt, {
    secret: config.jwt.secret,
  });
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  // Decorate fastify with db and redis
  fastify.decorate("db", db);
  fastify.decorate("redis", redis);

  // Health check
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Register routes
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(ticketRoutes, { prefix: "/api/tickets" });
  await fastify.register(messageRoutes, { prefix: "/api/messages" });
  await fastify.register(userRoutes, { prefix: "/api/users" });
  await fastify.register(deviceRoutes, { prefix: "/api/devices" });
  await fastify.register(inventoryRoutes, { prefix: "/api/inventories" });
  await fastify.register(groupRoutes, { prefix: "/api/device-groups" });

  // WebSocket for real-time chat
  fastify.register(async function (fastify) {
    // Client registry: WS bridge butuh akses ke socket subscriptions.
    // fastify.websocketServer di plugin ini tak reliable, jadi simpan manual.
    const subs = new Map<string, Set<any>>();

    subClient.on("pmessage", (pattern, channel, payload) => {
      try {
        const m = channel.match(/^ticket:(.+?)(?::user:(.+))?$/);
        if (!m) return;
        const ticketId = m[1];
        const deviceId = m[2] || null;
        const data = JSON.parse(payload);
        const targets = subs.get(ticketId);
        let sent = 0;
        if (targets) {
          for (const socket of targets) {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ ...data, ticketId, deviceId }));
              sent++;
            }
          }
        }
        // __list__ mode: refresh daftar tiket + badge unread + typing
        if (data.type === "new_message" || data.type === "message_read" || data.type === "typing") {
          const listers = subs.get("__list__");
          if (listers) {
            for (const socket of listers) {
              const allowed = socket.isAgent || (socket.deviceId && socket.deviceId === deviceId);
              if (socket.readyState === 1 && allowed) {
                socket.send(JSON.stringify({ ...data, ticketId, deviceId }));
                sent++;
              } else {
                // Prune socket mati supaya Set tak mengembang
                listers.delete(socket);
                if (listers.size === 0) subs.delete("__list__");
              }
            }
          }
        }
        console.log(`[ws-bridge] ${channel} -> ${sent} clients (subs: ${subs.size})`);
      } catch (e) {
        console.error("[ws-bridge] error:", e);
      }
    });

    fastify.get("/ws", { websocket: true }, (connection: any, req: any) => {
      // @fastify/websocket v11: connection adalah WebSocket langsung
      const socket: any = connection.socket ?? connection;
      socket.on("message", async (message: Buffer) => {
        try {
          if (message.length > 4096) return socket.close(1009, "Pesan terlalu besar");
          const data = JSON.parse(message.toString());
          if (data.type === "subscribe" && data.ticketId) {
            let isAgent = false;
            if (data.token) {
              try {
                const user = fastify.jwt.verify(data.token) as { role?: string };
                isAgent = user.role === "agent" || user.role === "admin";
              } catch {}
            }
            const deviceId = typeof data.deviceId === "string" ? data.deviceId : "";
            if (!isAgent && !deviceId) return socket.close(1008, "Autentikasi wajib");

            if (data.ticketId !== "__list__" && !isAgent) {
              const owned = await db.query(
                "SELECT 1 FROM tickets WHERE id = $1 AND device_id = $2",
                [data.ticketId, deviceId]
              );
              if (!owned.rows[0]) return socket.close(1008, "Akses ditolak");
            }
            socket.isAgent = isAgent;
            socket.deviceId = deviceId || null;
            socket.ticketId = data.ticketId;
            if (!subs.has(data.ticketId)) subs.set(data.ticketId, new Set());
            subs.get(data.ticketId)!.add(socket);
            console.log(`[ws] subscribed ${data.ticketId} (subs: ${subs.size})`);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      socket.on("close", () => {
        for (const [tid, set] of subs) {
          set.delete(socket);
          if (set.size === 0) subs.delete(tid);
        }
        console.log(`[ws] closed (subs: ${subs.size})`);
      });
    });
    // Subscribe ke semua event ticket (new_message, typing)
    await subClient.psubscribe("ticket:*");
  });

  // Initialize services
  await initDb();
  await initRedis();

  // ponytail: @fastify/multipart tolak duluan dgn pesan Inggris (FST_FILES_LIMIT /
  // FST_REQ_FILE_TOO_LARGE) — terjemahkan jadi pesan Indonesia yang jelas.
  fastify.setErrorHandler((err: any, _request, reply) => {
    const code = err?.code;
    if (code === "FST_FILES_LIMIT") {
      return reply.status(400).send({ error: `Maksimal ${config.storage.maxFiles} file` });
    }
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      const maxMB = Math.round(config.storage.maxFileSize / (1024 * 1024));
      return reply.status(400).send({ error: `File melebihi ${maxMB}MB` });
    }
    // Body parse error umum
    if (err?.validation || code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return reply.status(400).send({ error: "Data tidak valid" });
    }
    fastify.log.error(err);
    reply.status(err?.statusCode || 500).send({ error: err?.message || "Server error" });
  });

  return fastify;
}

export async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
