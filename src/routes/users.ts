import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // List users (admin/agent only)
  fastify.get("/", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string; role: string };
    if (user.role === "user") {
      return reply.status(403).send({ error: "Akses ditolak" });
    }
    
    const result = await db.query(
      "SELECT id, username, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    
    return result.rows;
  });
  
  // Get user by ID
  fastify.get("/:id", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string; role: string };
    const { id } = request.params as { id: string };
    
    // Only admin/agent or own user can access
    if (user.role === "user" && user.id !== id) {
      return reply.status(403).send({ error: "Akses ditolak" });
    }
    
    const result = await db.query(
      "SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE id = $1",
      [id]
    );
    
    if (!result.rows[0]) {
      return reply.status(404).send({ error: "User tidak ditemukan" });
    }
    
    return result.rows[0];
  });
  
  // Update user
  fastify.patch("/:id", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    
    const user = request.user as { id: string; role: string };
    const { id } = request.params as { id: string };
    const { fullName, email, isActive, role: newRole } = request.body as {
      fullName?: string;
      email?: string;
      isActive?: boolean;
      role?: string;
    };
    
    // Only admin can change role and isActive
    // Users can only update their own fullName and email
    if (user.role === "user") {
      if (user.id !== id) {
        return reply.status(403).send({ error: "Akses ditolak" });
      }
      if (isActive !== undefined || newRole !== undefined) {
        return reply.status(403).send({ error: "Tidak dapat mengubah role atau status" });
      }
    }
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (fullName !== undefined) {
      updates.push(`full_name = $${paramIndex}`);
      params.push(fullName);
      paramIndex++;
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }
    if (isActive !== undefined && user.role === "admin") {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }
    if (newRole !== undefined && user.role === "admin") {
      updates.push(`role = $${paramIndex}`);
      params.push(newRole);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return reply.status(400).send({ error: "Tidak ada data untuk diupdate" });
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, username, email, full_name, role, is_active`,
      params
    );
    
    return result.rows[0];
  });
};

export default userRoutes;
