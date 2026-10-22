import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../database.js";
import { sigapLogin, SigapAuthError, SigapUnavailableError } from "../lib/sigap.js";

/**
 * Baris user lokal untuk admin SIGAP.
 *
 * Baris ini hanya "cermin" identitas: password diacak random sehingga login
 * lokal mustahil, dan role dipaksa 'admin'. Baris tetap disimpan supaya
 * tiket/chat/audit tetap punya rujukan yang valid.
 */
async function ensureLocalAdmin(sigapUser: {
  id: string;
  email: string;
  fullName: string;
}) {
  const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

  const existing = await db.query(
    "SELECT * FROM users WHERE sigap_user_id = $1 OR lower(email) = lower($2) LIMIT 1",
    [sigapUser.id, sigapUser.email]
  );
  if (existing.rows[0]) {
    const u = existing.rows[0];
    const updated = await db.query(
      `UPDATE users SET role = 'admin', is_active = true, sigap_user_id = $1,
              password = $2, full_name = COALESCE(NULLIF($3, ''), full_name),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 RETURNING *`,
      [sigapUser.id, randomHash, sigapUser.fullName, u.id]
    );
    return updated.rows[0];
  }

  // username unik dari email
  const base =
    "sigap_" +
    sigapUser.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 40);
  let username = base;
  for (let i = 2; i < 50; i++) {
    const exists = await db.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (!exists.rows[0]) break;
    username = `${base}_${i}`;
  }

  const inserted = await db.query(
    `INSERT INTO users (username, email, password, full_name, role, is_active, sigap_user_id)
     VALUES ($1, $2, $3, $4, 'admin', true, $5) RETURNING *`,
    [username, sigapUser.email, randomHash, sigapUser.fullName, sigapUser.id]
  );
  return inserted.rows[0];
}


const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Login lokal (username + password) dinonaktifkan.
  // Seluruh akun admin kini login lewat SIGAP: POST /login/sigap.
  fastify.post("/login", async (_request, reply) => {
    return reply.status(403).send({
      error: "Login lokal dinonaktifkan. Gunakan akun SIGAP.",
    });
  });

  // Login admin via SIGAP (staging).
  // Kredensial diteruskan ke server SIGAP, identitas diverifikasi terhadap
  // daftar admin (tabel sigap_admins), lalu Token Ticketing diterbitkan.
  fastify.post("/login/sigap", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const { email, password } = request.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      return reply.status(400).send({ error: "Email dan password wajib diisi" });
    }

    let sigapUser;
    try {
      sigapUser = await sigapLogin(email, password);
    } catch (err) {
      if (err instanceof SigapAuthError) {
        return reply.status(401).send({ error: err.message });
      }
      if (err instanceof SigapUnavailableError) {
        return reply.status(502).send({ error: err.message });
      }
      throw err;
    }

    // Allowlist admin: ID SIGAP yang sudah terikat, atau email yang masih
    // "pending" (diikat pada login pertama).
    const admin = await db.query(
      `SELECT * FROM sigap_admins
        WHERE is_active = true
          AND (sigap_user_id = $1 OR (sigap_user_id IS NULL AND lower(email) = lower($2)))
        LIMIT 1`,
      [sigapUser.id, sigapUser.email]
    );
    const adminRow = admin.rows[0];
    if (!adminRow) {
      return reply.status(403).send({
        error: "Akun SIGAP ini bukan admin Ticketing",
      });
    }

    // Bind ID SIGAP pada login pertama (email -> id tetap).
    if (!adminRow.sigap_user_id) {
      await db.query(
        `UPDATE sigap_admins SET sigap_user_id = $1, bound_at = CURRENT_TIMESTAMP, full_name = COALESCE(NULLIF($2,''), full_name) WHERE id = $3`,
        [sigapUser.id, sigapUser.fullName, adminRow.id]
      );
    }

    const local = await ensureLocalAdmin(sigapUser);
    const token = fastify.jwt.sign({
      id: local.id,
      username: local.username,
      role: local.role,
    });

    return {
      token,
      user: {
        id: local.id,
        username: local.username,
        email: local.email,
        fullName: local.full_name,
        role: local.role,
        sigapUserId: sigapUser.id,
      },
    };
  });
  
  // Register dinonaktifkan: akun admin hanya dari SIGAP.
  fastify.post("/register", async (_request, reply) => {
    return reply.status(403).send({
      error: "Pendaftaran akun dinonaktifkan. Akun admin berasal dari SIGAP.",
    });
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
