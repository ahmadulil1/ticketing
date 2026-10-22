import { db } from "../database.js";
import { config } from "../config/index.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import util from "util";
import sharp from "sharp";

const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

const ALLOWED_IMAGE = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"];

// Signature magic bytes: cegah spoofing mimetype (file .txt type=image/png)
const MAGIC: Array<{ bytes: number[]; label: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], label: "PNG" },
  { bytes: [0xff, 0xd8, 0xff], label: "JPEG" },
  { bytes: [0x47, 0x49, 0x46, 0x38], label: "GIF" },
  { bytes: [0x42, 0x4d], label: "BMP" },
  // WebP: "RIFF....WEBP"
  { bytes: [0x52, 0x49, 0x46, 0x46], label: "WEBP" },
];

export function detectImageFormat(buf: Buffer): string | null {
  for (const m of MAGIC) {
    if (buf.length >= m.bytes.length && m.bytes.every((b, i) => buf[i] === m.bytes[i])) {
      if (m.label === "WEBP") {
        if (buf.length < 12) return null;
        const webp = buf.slice(8, 12).toString("ascii");
        return webp === "WEBP" ? "WEBP" : null;
      }
      return m.label;
    }
  }
  return null;
}

/**
 * Simpan 1 gambar jadi lampiran.
 *
 * Dipakai untuk lampiran tiket (dari form tiket) dan lampiran chat pesan.
 * Semua gambar dikonversi ke WebP (sharp) supaya ringkas.
 *
 * `messageId` diisi kalau lampiran ini langsung menempel ke sebuah pesan.
 */
export async function saveAttachment(
  ticketId: string,
  file: any,
  messageId: string | null = null
) {
  // ponytail: lempar error jelas — return null diam-diam bikin frontend mengira sukses (AT-05/06)
  if (!ALLOWED_IMAGE.includes((file.mimetype || "").toLowerCase())) {
    throw new Error(`File "${file.filename}" bukan gambar yang diizinkan`);
  }

  // ponytail: @fastify/multipart v9 saveRequestFiles() menulis ke tmp file lalu
  // menguras stream — toBuffer() setelahnya kosong. Baca dari file tmp (filepath).
  const buffer = file.filepath
    ? fs.readFileSync(file.filepath)
    : ((file as any)._buf ?? await file.toBuffer());
  const maxMB = Math.round(config.storage.maxFileSize / (1024 * 1024));
  if (buffer.length > config.storage.maxFileSize) {
    throw new Error(`File "${file.filename}" melebihi ${maxMB}MB`);
  }

  const fmt = detectImageFormat(buffer);
  if (!fmt) {
    throw new Error(`File "${file.filename}" rusak atau bukan gambar valid`);
  }

  // Konversi ke WebP (libwebp via sharp)
  const webpBuffer = await sharp(buffer)
    .webp({ quality: 82 })
    .toBuffer();

  const storedName = `${uuidv4()}.webp`;
  const uploadDir = path.join(config.storage.path, ticketId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, storedName);
  await writeFile(filePath, webpBuffer);

  const result = await db.query(
    `INSERT INTO attachments (ticket_id, message_id, original_name, stored_name, mime_type, size, storage_path, scan_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'clean') RETURNING *`,
    [
      ticketId,
      messageId,
      file.filename,
      storedName,
      "image/webp",
      webpBuffer.length,
      filePath,
    ]
  );

  return result.rows[0];
}

/**
 * Lampirkan lampiran yang sudah terupload ke sebuah pesan.
 * Hanya lampiran milik tiket itu yang boleh ditautkan.
 */
export async function linkAttachments(
  ticketId: string,
  messageId: string,
  attachmentIds: string[]
) {
  if (!attachmentIds.length) return;
  await db.query(
    `UPDATE attachments SET message_id = $1
     WHERE id = ANY($2::uuid[]) AND ticket_id = $3 AND message_id IS NULL`,
    [messageId, attachmentIds, ticketId]
  );
}

/**
 * Ambil metadata lampiran (tanpa path file) untuk sebuah tiket.
 * `messageId` opsional — null = semua lampiran tiket.
 */
export async function listAttachments(ticketId: string, messageId?: string, hideInternal = false) {
  const params: any[] = [ticketId];
  let sql = `SELECT id, ticket_id, message_id, original_name, mime_type, size, uploaded_at
             FROM attachments WHERE ticket_id = $1`;
  if (messageId) {
    params.push(messageId);
    sql += ` AND message_id = $2`;
  }
  if (hideInternal) sql += ` AND (message_id IS NULL OR EXISTS (SELECT 1 FROM messages m WHERE m.id = attachments.message_id AND m.message_type <> 'internal'))`;
  sql += ` ORDER BY uploaded_at`;
  const res = await db.query(sql, params);
  return res.rows;
}
