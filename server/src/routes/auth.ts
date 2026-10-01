import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { db } from "../database.js";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Login
  fastify.post("/login", async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    
    if (!username || !password) {
      return reply.status(400).send({ error: "Username dan password wajib diisi" });
    }
    
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1 AND is_active = true",
      [username]
    );
    
    const user = result.rows[0];
    if (!user) {
      return reply.status(401).send({ error: "Username atau password salah" });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return reply.status(401).send({ error: "Username atau password salah" });
    }
    
    const token = fastify.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    };
  });
  
  // Register (for admin only - MVP: allow all for testing)
  fastify.post("/register", async (request, reply) => {
    const { username, email, password, fullName, role } = request.body as {
      username: string;
      email: string;
      password: string;
      fullName?: string;
      role?: string;
    };
    
    if (!username || !email || !password) {
      return reply.status(400).send({ error: "Username, email, dan password wajib diisi" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
      const result = await db.query(
        `INSERT INTO users (username, email, password, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, full_name, role, created_at`,
        [username, email, hashedPassword, fullName || username, role || "user"]
      );
      
      return reply.status(201).send(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ error: "Username atau email sudah digunakan" });
      }
      throw err;
    }
  });
  
  // Get current user
  fastify.get("/me", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Token tidak valid" });
    }
    
    const user = request.user as { id: string };
    const result = await db.query(
      "SELECT id, username, email, full_name, role, created_at FROM users WHERE id = $1",
      [user.id]
    );
    
    if (!result.rows[0]) {
      return reply.status(404).send({ error: "User tidak ditemukan" });
    }
    
    return result.rows[0];
  });
};

export default authRoutes;
