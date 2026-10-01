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
    maxFileSize: 20 * 1024 * 1024, // 20MB
    maxFiles: 5,
    allowedTypes: ["image/png", "image/jpeg", "image/jpg", "application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
  },
  
  ticket: {
    prefix: "TKT",
    reopenDays: 3,
  },
};
