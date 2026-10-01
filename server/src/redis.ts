import Redis from "ioredis";
import { config } from "./config/index.js";

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

export async function initRedis() {
  try {
    await redis.ping();
    console.log("Redis connected");
  } catch (err) {
    console.error("Redis connection error:", err);
  }
}

// Pub/sub for real-time
export const pubClient = new Redis({ host: config.redis.host, port: config.redis.port });
export const subClient = new Redis({ host: config.redis.host, port: config.redis.port });
