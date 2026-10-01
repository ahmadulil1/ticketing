import path from "path";

export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || "0.0.0.0",
  
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
    secret: process.env.JWT_SECRET || "ticketing-secret-key-change-in-production",
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
};
