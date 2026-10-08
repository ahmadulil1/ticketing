import { config } from "./config/index.js";
import pg from "pg";
const { Pool } = pg;

export const db = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
});

export async function initDb() {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'agent', 'admin')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key VARCHAR(100) UNIQUE,
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        requester_id UUID REFERENCES users(id),
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'baru' CHECK (status IN ('baru', 'sedang_ditangani', 'menunggu_pengguna', 'selesai', 'ditutup', 'dibuka_kembali')),
        priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('rendah', 'normal', 'tinggi', 'urgent')),
        category_id UUID,
        assignee_id UUID REFERENCES users(id),
        device_id VARCHAR(100),
        device_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        closed_at TIMESTAMP,
        reopened_at TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id),
        sender_role VARCHAR(20) NOT NULL,
        message_type VARCHAR(20) DEFAULT 'public' CHECK (message_type IN ('public', 'internal', 'system')),
        body TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        client_request_id VARCHAR(100) UNIQUE
      );
      
      CREATE TABLE IF NOT EXISTS attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        size BIGINT,
        storage_path TEXT,
        scan_status VARCHAR(20) DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'blocked')),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID REFERENCES tickets(id),
        actor_id UUID REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tickets_idempotency ON tickets(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_messages_client_request ON messages(client_request_id);
    `);
    // Migration kolom baru (idempotent)
    await client.query(`
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_tickets_device ON tickets(device_id);

      CREATE TABLE IF NOT EXISTS device_specs (
        device_id VARCHAR(100) PRIMARY KEY,
        hostname VARCHAR(255),
        cpu_model VARCHAR(255),
        ram_gb INTEGER,
        gpu_model VARCHAR(255),
        os_name VARCHAR(255),
        disks JSONB,
        reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        no_inventaris VARCHAR(100) UNIQUE NOT NULL,
        device_id VARCHAR(100) REFERENCES device_specs(device_id),
        lokasi VARCHAR(255),
        catatan TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hardware_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID REFERENCES inventories(id) ON DELETE CASCADE,
        event_date DATE NOT NULL,
        jenis VARCHAR(20) DEFAULT 'ganti' CHECK (jenis IN ('ganti', 'upgrade', 'perbaikan')),
        komponen VARCHAR(100) NOT NULL,
        old_detail TEXT,
        new_detail TEXT,
        catatan TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS device_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_hw_events_inventory ON hardware_events(inventory_id, event_date DESC);

      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lokasi VARCHAR(255);
    `);
    console.log("Database tables created");
  } finally {
    client.release();
  }
}
