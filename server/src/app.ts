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
import remoteRoutes from "./routes/remote.js";

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
    "http://tauri.localhost",
    "https://tauri.localhost",
  ]);
  // Dev Tauri/vite pakai port acak di localhost (mis. 127.0.0.1:1430); izinkan semua.
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  await fastify.register(cors, {
    // Native/Tauri dan non-browser tak mengirim Origin; browser wajib whitelist.
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin) || localOrigin.test(origin)),
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
  await fastify.register(remoteRoutes, { prefix: "/api/remote" });

  // WebSocket for real-time chat + remote desktop signaling
  fastify.register(async function (fastify) {
    // Client registry: WS bridge butuh akses ke socket subscriptions.
    // fastify.websocketServer di plugin ini tak reliable, jadi simpan manual.
    const subs = new Map<string, Set<any>>();

    subClient.on("pmessage", (pattern, channel, payload) => {
      try {
        // Chat signaling: ticket:{ticketId}
        let m = channel.match(/^ticket:(.+?)(?::user:(.+))?$/);
        if (m) {
          const ticketId = m[1];
          const deviceId = m[2] || null;
          const data = JSON.parse(payload);
          // Catatan internal hanya untuk agent/admin. Jangan dikirim ke tamu,
          // baik lewat push WS maupun refresh badge __list__.
          const isInternal =
            data.type === "new_message" && data.message?.message_type === "internal";
          const targets = subs.get(ticketId);
          let sent = 0;
          if (targets) {
            for (const socket of targets) {
              if (isInternal && !socket.isAgent) continue;
              if (socket.readyState === 1) {
                socket.send(JSON.stringify({ ...data, ticketId, deviceId }));
                sent++;
              }
            }
          }
          if (data.type === "new_message" || data.type === "message_read" || data.type === "typing") {
            const listers = subs.get("__list__");
            if (listers) {
              for (const socket of listers) {
                const allowed = socket.isAgent || (socket.deviceId && socket.deviceId === deviceId);
                if (isInternal && !socket.isAgent) continue;
                if (socket.readyState === 1 && allowed) {
                  socket.send(JSON.stringify({ ...data, ticketId, deviceId }));
                  sent++;
                } else {
                  listers.delete(socket);
                  if (listers.size === 0) subs.delete("__list__");
                }
              }
            }
          }
          console.log(`[ws-bridge] ${channel} -> ${sent} clients (subs: ${subs.size})`);
          return;
        }

        // Remote desktop signaling: remote:{deviceId}
        m = channel.match(/^remote:(.+)$/);
        if (m) {
          const deviceId = m[1];
          const data = JSON.parse(payload);
          const targets = subs.get(`remote:${deviceId}`);
          let sent = 0;
          if (targets) {
            for (const socket of targets) {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify(data));
                sent++;
              }
            }
          }
          console.log(`[ws-remote] ${channel} -> ${sent} clients (subs: ${subs.size})`);
          return;
        }
      } catch (e) {
        console.error("[ws-bridge] error:", e);
      }
    });

    fastify.get("/ws", { websocket: true }, (connection: any, req: any) => {
      // @fastify/websocket v11: connection adalah WebSocket langsung
      const socket: any = connection.socket ?? connection;
      socket.on("message", async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          // Frame layar (base64 PNG) jauh lebih besar dari pesan chat biasa.
          if (data.type === "remote_frame") {
            if (message.length > 20 * 1024 * 1024) {
              return socket.close(1009, "Frame terlalu besar");
            }
          } else if (message.length > 4096) {
            return socket.close(1009, "Pesan terlalu besar");
          }

          // Chat signaling subscribe: ticket:{ticketId} or __list__
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
            return;
          }

          // Remote desktop signaling subscribe: remote:{deviceId}
          if (data.type === "subscribe-remote" && data.deviceId) {
            const deviceId = typeof data.deviceId === "string" ? data.deviceId : "";

            // Agent/admin (web viewer): wajib JWT role agent/admin
            let isAgent = false;
            if (data.token) {
              try {
                const user = fastify.jwt.verify(data.token) as { role?: string };
                isAgent = user.role === "agent" || user.role === "admin";
              } catch {}
            }
            if (data.isAgent === true) {
              if (!isAgent) return socket.close(1008, "Akses ditolak");
            } else {
              // Agent desktop: deviceId + deviceSecret harus cocok
              const secret = typeof data.deviceSecret === "string" ? data.deviceSecret : "";
              const cred = await db.query(
                "SELECT 1 FROM device_credentials WHERE device_id = $1 AND device_secret = $2",
                [deviceId, secret]
              );
              if (!cred.rows[0]) return socket.close(1008, "Device tidak terautentikasi");
            }

            socket.isAgent = isAgent;
            socket.deviceId = deviceId || null;
            const channel = `remote:${deviceId}`;
            if (!subs.has(channel)) subs.set(channel, new Set());
            subs.get(channel)!.add(socket);
            console.log(`[ws-remote] subscribed ${channel} (subs: ${subs.size})`);

            // Catch-up: device yang baru subscribe mungkin kelewatan
            // remote_request yang dikirim sebelum device online.
            if (!isAgent) {
              try {
                const pending = await db.query(
                  `SELECT id, device_id, agent_id, agent_name, status, started_at
                   FROM remote_sessions
                   WHERE device_id = $1 AND status = 'pending'
                   ORDER BY started_at DESC LIMIT 5`,
                  [deviceId]
                );
                for (const row of pending.rows) {
                  socket.send(
                    JSON.stringify({
                      type: "remote_request",
                      sessionId: row.id,
                      device_id: row.device_id,
                      agent_id: row.agent_id,
                      agent_name: row.agent_name,
                      timestamp: row.started_at,
                    })
                  );
                }
                if (pending.rows.length) {
                  console.log(`[ws-remote] catch-up ${pending.rows.length} pending untuk ${deviceId}`);
                }
              } catch (e) {
                console.error("[ws-remote] catch-up error:", e);
              }
            }
            return;
          }

          // -----------------------------------------------------------------
          // Relay frame (device -> agent) dan input (agent -> device)
          // Kirim ke semua anggota channel remote:{deviceId} kecuali pengirim.
          // -----------------------------------------------------------------
          if (data.type === "remote_frame" || data.type === "remote_input") {
            if (!socket.deviceId) return socket.close(1008, "Belum subscribe");
            // Frame hanya boleh dikirim device; input hanya boleh dari agent
            if (data.type === "remote_frame" && socket.isAgent) {
              return socket.close(1008, "Akses ditolak");
            }
            if (data.type === "remote_input" && !socket.isAgent) {
              return socket.close(1008, "Akses ditolak");
            }
            const targets = subs.get(`remote:${socket.deviceId}`);
            let sent = 0;
            if (targets) {
              for (const target of targets) {
                if (target !== socket && target.readyState === 1) {
                  target.send(JSON.stringify(data));
                  sent++;
                }
              }
            }
            console.log(`[ws-remote] relay ${data.type} -> ${sent} clients`);
            return;
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
    // Subscribe ke semua event ticket dan remote signaling
    await subClient.psubscribe("ticket:*", "remote:*");
  });

  // Initialize services
  await initDb();
  await initRedis();

  // Cleanup berkala sesi remote yang idle > 30 menit.
  // Tanpa interval ini, timeout cuma kepicu saat ada request API — kalau admin
  // tinggalin viewer, sesi menggantung & device capture terus jalan.
  const { expireRemoteSessions } = await import("./routes/remote.js");
  setInterval(() => {
    expireRemoteSessions().catch((e) => console.error("[remote] cleanup error:", e));
  }, 60_000);

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
