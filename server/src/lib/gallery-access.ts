import { randomBytes } from "node:crypto";

// ponytail: tautan sementara hanya hidup di proses API ini; restart membatalkan
// semuanya. Pindahkan ke Redis jika API memakai beberapa instance.
const grants = new Map<string, { ticketId: string; user: { id: string; role: string }; expires: number }>();
export function createGalleryAccess(ticketId: string, user: { id: string; role: string }) {
  for (const [key, grant] of grants) if (grant.expires <= Date.now()) grants.delete(key);
  if (grants.size >= 2000) throw new Error("Terlalu banyak tautan galeri aktif");
  const token = randomBytes(32).toString("hex");
  grants.set(token, { ticketId, user, expires: Date.now() + 10 * 60_000 });
  return token;
}
export function readGalleryAccess(token: string, ticketId: string) {
  const grant = grants.get(token);
  if (!grant || grant.expires <= Date.now() || grant.ticketId !== ticketId) return null;
  return grant.user;
}
