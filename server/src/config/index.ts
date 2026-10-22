import path from "path";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET wajib diatur pada production");
}

export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "ticketing",
    password: process.env.DB_PASSWORD || "ticketing123",
    database: process.env.DB_NAME || "ticketing",
  },
  
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || "dev-only-secret",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  
  storage: {
    path: process.env.STORAGE_PATH || "/data/uploads",
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 10,
    allowedTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"],
  },
  
  ticket: {
    prefix: "TKT",
    reopenDays: 3,
    reopenDeadlineHour: 17, // tiket selesai bisa dibuka kembali sampai jam 17:00 hari yang sama
  },

  // Integrasi SIGAP (staging). Login admin Ticketing memakai akun SIGAP.
  sigap: {
    baseUrl: process.env.SIGAP_BASE_URL || "https://sigap.marison-testing.biz.id",
    // Daftar email SIGAP yang boleh jadi admin Ticketing (pisahkan koma).
    // Email diikat ke ID SIGAP pada login pertama, lalu ID itu yang dipakai.
    adminEmails: process.env.SIGAP_ADMIN_EMAILS || "",
    // Nama lengkap, urutan sama dengan adminEmails (opsional).
    adminNames: process.env.SIGAP_ADMIN_NAMES || "",
  },
};
