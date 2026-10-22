/**
 * Klien autentikasi web SIGAP (staging).
 *
 * Berbeda dari API desktop: ini endpoint web SIGAP (same-origin, cookie) yang
 * dipakai untuk login admin Ticketing. Ticketing meneruskan kredensial ke
 * SIGAP dari sisi server, lalu memverifikasi identitas yang dikembalikan
 * terhadap daftar admin (tabel `sigap_admins`).
 *
 * Aturan:
 * - Hanya ke origin staging persis, HTTPS, tanpa mengikuti redirect.
 * - Password hanya lewat sekali (ke SIGAP), tidak pernah disimpan/dicatat.
 * - Tanpa cookie: Node fetch tidak menyimpan cookie antar-request.
 */

import { config } from "../config/index.js";

const SIGAP_BASE_URL = config.sigap.baseUrl.replace(/\/+$/, "");
export interface SigapUser {
  id: string;
  email: string;
  fullName: string;
}

/** Galat autentikasi dari sisi SIGAP (kredensial salah / akun nonaktif). */
export class SigapAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigapAuthError";
  }
}

/** Galat teknis (jaringan, SIGAP tak terjangkau, respons tak terduga). */
export class SigapUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigapUnavailableError";
  }
}

/** SIGAP membatasi percobaan login (rate limit per email). */
export class SigapRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigapRateLimitError";
  }
}

function pickString(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Login ke SIGAP pakai email + password.
 * Mengembalikan identitas user SIGAP, atau melempar SigapAuthError /
 * SigapUnavailableError.
 */
export async function sigapLogin(email: string, password: string): Promise<SigapUser> {
  let resp: Response;
  try {
    resp = await fetch(`${SIGAP_BASE_URL}/api/auth/login`, {
      method: "POST",
      redirect: "manual", // jangan ikuti redirect lintas origin
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Header yang sama dipakai klien web resmi SIGAP.
        "X-SIGAP-Client": "web",
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new SigapUnavailableError(
      `Tidak bisa menghubungi server SIGAP: ${e?.message || e}`
    );
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new SigapAuthError("Email atau password salah");
  }
  if (resp.status === 429) {
    // Rate limit SIGAP (biasanya per email).
    throw new SigapRateLimitError("Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.");
  }
  if (resp.status >= 500) {
    throw new SigapUnavailableError("Server SIGAP sedang bermasalah");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new SigapUnavailableError(
      `SIGAP menolak permintaan login (HTTP ${resp.status})${body ? `: ${body.slice(0, 120)}` : ""}`
    );
  }

  const json: any = await resp.json().catch(() => null);
  const user = json?.user || json?.session?.user;
  if (!user) {
    throw new SigapUnavailableError("Respons login SIGAP tidak memuat data user");
  }

  const id = pickString(user, ["id", "user_id", "uuid"]);
  const userEmail = pickString(user, ["email", "user_email"]) || email.trim();
  const fullName =
    pickString(user, ["full_name", "fullName", "name", "nama"]) || userEmail;

  if (!id) {
    throw new SigapUnavailableError("Identitas user SIGAP tidak ditemukan");
  }

  return { id, email: userEmail, fullName };
}
