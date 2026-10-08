import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
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
  await fastify.register(cors, { origin: "*" });
  await fastify.register(websocket);
  await fastify.register(multipart, {
    limits: {
      fileSize: config.storage.maxFileSize,
      files: config.storage.maxFiles,
    },
  });
  await fastify.register(jwt, {
    secret: config.jwt.secret,
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
              if (socket.readyState === 1) {
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
      socket.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "subscribe" && data.ticketId) {
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
