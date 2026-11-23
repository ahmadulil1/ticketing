import { FastifyPluginAsync } from "fastify";
import { db } from "../database.js";

function toDateStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizeRow(row: any) {
  if (!row || typeof row !== "object") return row;
  const out: any = { ...row };
  for (const k of ["tanggal_maintenance", "last_maintenance_date", "next_maintenance_date", "created_at"]) {
    if (k in out && out[k] !== null && out[k] !== undefined) {
      if (k === "created_at") out[k] = out[k] instanceof Date ? out[k].toISOString() : String(out[k]);
      else out[k] = toDateStr(out[k]);
    }
  }
  return out;
}

function normalizeRows(rows: any[]) { return (rows || []).map(normalizeRow); }

function pickPreferredText(nextValue: any, fallbackValue: any) {
  if (typeof nextValue === "string" && nextValue.trim()) return nextValue.trim();
  if (typeof fallbackValue === "string" && fallbackValue.trim()) return fallbackValue.trim();
  return null;
}

function normalizeLocationInput(value: any): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function resolveAssetCode({ kodeAset, namaPerangkat, lokasi, tipe }: any): string {
  const explicit = String(kodeAset || "").trim();
  if (explicit) return explicit.toUpperCase();
  const base = [namaPerangkat, tipe, lokasi].filter(Boolean).map((x: string) => String(x).trim()).join("-");
  return base.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "AST-UNKNOWN";
}

function normalizeAssetPayload(payload: any) {
  return {
    kode_aset: resolveAssetCode({ kodeAset: payload.kode_aset, namaPerangkat: payload.nama_perangkat, lokasi: payload.lokasi, tipe: payload.tipe }),
    nama_perangkat: String(payload.nama_perangkat || "").trim(),
    tipe: payload.tipe?.trim?.() || null,
    lokasi: normalizeLocationInput(payload.lokasi),
    status: payload.status || "aktif",
    maintenance_interval_months: Number(payload.maintenance_interval_months || 12),
  };
}

function getAssetRpcFilters(q: any) {
  return {
    p_lokasi: normalizeLocationInput(q.lokasi) || null,
    p_status: q.status || null,
    p_search: q.search?.trim?.() || null,
    p_interval_months: q.maintenanceIntervalMonths ? Number(q.maintenanceIntervalMonths) : (q.interval ? Number(q.interval) : null),
    p_priority: q.priority || null,
  };
}

async function fetchExistingAssetsByCodes(codes: string[]) {
  if (!codes.length) return [];
  const { rows } = await db.query(
    `SELECT kode_aset, nama_perangkat, tipe, lokasi, status, maintenance_interval_months FROM maintenance.assets WHERE kode_aset = ANY($1::text[])`,
    [codes]
  );
  return rows;
}

async function syncAssetCatalog(records: any[]) {
  const map = new Map<string, any>();
  for (const r of records) {
    if (!r?.kode_aset || !r?.nama_perangkat) continue;
    const kode = resolveAssetCode({ kodeAset: r.kode_aset, namaPerangkat: r.nama_perangkat, lokasi: r.lokasi, tipe: r.tipe });
    const cur = map.get(kode);
    map.set(kode, {
      kode_aset: kode,
      nama_perangkat: pickPreferredText(String(r.nama_perangkat).trim(), cur?.nama_perangkat),
      tipe: pickPreferredText(r.tipe?.trim?.() || null, cur?.tipe),
      lokasi: pickPreferredText(normalizeLocationInput(r.lokasi), cur?.lokasi),
    });
  }
  if (!map.size) return;
  const existing = await fetchExistingAssetsByCodes([...map.keys()]);
  const exLookup = new Map(existing.map((r: any) => [r.kode_aset, r]));
  for (const item of map.values()) {
    const ex: any = exLookup.get(item.kode_aset);
    await db.query(
      `INSERT INTO maintenance.assets (kode_aset, nama_perangkat, tipe, lokasi, status, maintenance_interval_months)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (kode_aset) DO UPDATE SET
         nama_perangkat = COALESCE(EXCLUDED.nama_perangkat, maintenance.assets.nama_perangkat),
         tipe = COALESCE(EXCLUDED.tipe, maintenance.assets.tipe),
         lokasi = COALESCE(EXCLUDED.lokasi, maintenance.assets.lokasi)`,
      [item.kode_aset, item.nama_perangkat || ex?.nama_perangkat || item.kode_aset, item.tipe ?? ex?.tipe ?? null, item.lokasi ?? ex?.lokasi ?? null, ex?.status || "aktif", Number(ex?.maintenance_interval_months || 12)]
    );
  }
}

async function enrichAssetRows(assetRows: any[]) {
  const codes = [...new Set((assetRows || []).map((a) => a.kode_aset).filter(Boolean))];
  if (!codes.length) return assetRows || [];
  const { rows } = await db.query(
    `SELECT kode_aset, tanggal_maintenance, status, jenis_kegiatan, catatan
     FROM maintenance.maintenance WHERE kode_aset = ANY($1::text[])
     ORDER BY tanggal_maintenance DESC`,
    [codes]
  );
  const ctx = new Map<string, any>();
  for (const item of rows) {
    const cur = ctx.get(item.kode_aset) || { maintenance_count: 0, scheduled_date: null, scheduled_activity: null, last_note: null };
    const d = toDateStr(item.tanggal_maintenance);
    if (item.status === "planning") {
      if (!cur.scheduled_date || (d && d < cur.scheduled_date)) {
        cur.scheduled_date = d;
        cur.scheduled_activity = item.jenis_kegiatan;
      }
    } else {
      cur.maintenance_count += 1;
      if (!cur.last_note && item.catatan) cur.last_note = item.catatan;
    }
    ctx.set(item.kode_aset, cur);
  }
  return (assetRows || []).map((a) => ({ ...normalizeRow(a), ...(ctx.get(a.kode_aset) || { maintenance_count: 0, scheduled_date: null, scheduled_activity: null, last_note: null }) }));
}

async function fetchScheduledAssetCount(filters: any = {}) {
  const params: any[] = [];
  let q = `SELECT DISTINCT kode_aset FROM maintenance.maintenance WHERE status = 'planning'`;
  if (filters.lokasi) { params.push(filters.lokasi); q += ` AND lokasi = $${params.length}`; }
  const { rows } = await db.query(q, params);
  return rows.length;
}

function buildMaintenanceFilters(filters: any) {
  const where: string[] = [];
  const params: any[] = [];
  const add = (sql: string, val: any) => { params.push(val); where.push(sql.replace("$?", `$${params.length}`)); };
  if (filters.lokasi) add(`lokasi ILIKE $?`, normalizeLocationInput(filters.lokasi));
  if (filters.jenisKegiatan) add(`jenis_kegiatan = $?`, filters.jenisKegiatan);
  if (filters.status) add(`status = $?`, filters.status);
  if (filters.officeType === "kcp") where.push(`lokasi ILIKE 'KCP %'`);
  if (filters.officeType === "kc") where.push(`lokasi ILIKE 'KC %'`);
  if (filters.officeType === "lainnya") where.push(`(lokasi NOT ILIKE 'KC %' AND lokasi NOT ILIKE 'KCP %')`);
  if (filters.tanggalMulai) add(`tanggal_maintenance >= $?::date`, filters.tanggalMulai);
  if (filters.tanggalSelesai) add(`tanggal_maintenance <= $?::date`, filters.tanggalSelesai);
  if (filters.search) {
    const escaped = `%${String(filters.search).trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ")}%`;
    params.push(escaped, escaped);
    where.push(`(kode_aset ILIKE $${params.length - 1} OR nama_perangkat ILIKE $${params.length})`);
  }
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const maintenanceRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { return reply.status(401).send({ error: "Unauthorized" }); }
  };

  // ----- ASSETS -----
  fastify.get("/assets/options", async () => {
    const { rows } = await db.query(`SELECT maintenance.get_asset_options() AS data`);
    const data = rows[0]?.data || { lokasi: [], status: [], intervals: [] };
    return data;
  });

  fastify.get("/assets/summary", async (request) => {
    const q: any = request.query || {};
    const f = getAssetRpcFilters(q);
    const { rows } = await db.query(`SELECT maintenance.get_asset_summary($1,$2,$3,$4,$5) AS data`, [f.p_lokasi, f.p_status, f.p_search, f.p_interval_months, f.p_priority]);
    const data = rows[0]?.data || {};
    return { ...data, scheduled_assets: await fetchScheduledAssetCount({ lokasi: f.p_lokasi }) };
  });

  fastify.get("/assets/list", async (request) => {
    const q: any = request.query || {};
    const f = getAssetRpcFilters(q);
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.max(1, Number(q.pageSize || q.limit || 10));
    const { rows } = await db.query(`SELECT maintenance.get_asset_list($1,$2,$3,$4,$5,$6,$7) AS data`, [f.p_lokasi, f.p_status, f.p_search, f.p_interval_months, f.p_priority, page, pageSize]);
    const result = rows[0]?.data || { data: [], count: 0 };
    return { ...result, data: await enrichAssetRows(result.data || []) };
  });

  fastify.get("/assets/history/:kode", async (request) => {
    const { kode } = request.params as any;
    const { rows } = await db.query(
      `SELECT * FROM maintenance.maintenance WHERE kode_aset = $1 ORDER BY tanggal_maintenance DESC LIMIT 50`,
      [kode]
    );
    return normalizeRows(rows);
  });

  fastify.get("/assets/:id", async (request, reply) => {
    const { id } = request.params as any;
    const { rows } = await db.query(`SELECT * FROM maintenance.assets WHERE id = $1`, [id]);
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    const [asset] = await enrichAssetRows([rows[0]]);
    const hist = await db.query(`SELECT * FROM maintenance.maintenance WHERE kode_aset = $1 ORDER BY tanggal_maintenance DESC LIMIT 50`, [asset.kode_aset]);
    const history = normalizeRows(hist.rows);
    return { asset, history, scheduledRows: history.filter((r: any) => r.status === "planning"), completedRows: history.filter((r: any) => r.status !== "planning") };
  });

  fastify.get("/assets", async (request) => {
    const q: any = request.query || {};
    const params: any[] = [];
    let sql = `SELECT * FROM maintenance.assets`;
    const where: string[] = [];
    if (q.lokasi) { params.push(q.lokasi); where.push(`lokasi = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.search) { params.push(`%${q.search}%`); params.push(`%${q.search}%`); where.push(`(kode_aset ILIKE $${params.length-1} OR nama_perangkat ILIKE $${params.length})`); }
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += ` ORDER BY kode_aset ASC`;
    if (q.limit) { params.push(Number(q.limit)); sql += ` LIMIT $${params.length}`; }
    const { rows } = await db.query(sql, params);
    return normalizeRows(rows);
  });

  fastify.post("/assets", { preHandler: auth }, async (request, reply) => {
    const p = normalizeAssetPayload(request.body || {});
    await db.query(
      `INSERT INTO maintenance.assets (kode_aset, nama_perangkat, tipe, lokasi, status, maintenance_interval_months)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [p.kode_aset, p.nama_perangkat, p.tipe, p.lokasi, p.status, p.maintenance_interval_months]
    );
    return reply.send({ ok: true });
  });

  fastify.patch("/assets/:id", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as any;
    const cur = await db.query(`SELECT * FROM maintenance.assets WHERE id=$1`, [id]);
    if (!cur.rows[0]) return reply.status(404).send({ error: "Not found" });
    const merged = { ...cur.rows[0], ...(request.body as any) };
    const p = normalizeAssetPayload(merged);
    await db.query(
      `UPDATE maintenance.assets SET kode_aset=$1,nama_perangkat=$2,tipe=$3,lokasi=$4,status=$5,maintenance_interval_months=$6 WHERE id=$7`,
      [p.kode_aset, p.nama_perangkat, p.tipe, p.lokasi, p.status, p.maintenance_interval_months, id]
    );
    return { ok: true };
  });

  fastify.delete("/assets/:id", { preHandler: auth }, async (request) => {
    const { id } = request.params as any;
    await db.query(`DELETE FROM maintenance.assets WHERE id=$1`, [id]);
    return { ok: true };
  });

  fastify.post("/assets/upsert", { preHandler: auth }, async (request) => {
    const body: any = request.body || {};
    const rowsIn = Array.isArray(body) ? body : (body.rows || body.data || []);
    const dedup = new Map<string, any>();
    for (const r of rowsIn) {
      const p = normalizeAssetPayload(r);
      if (!p.kode_aset || !p.nama_perangkat) continue;
      const cur = dedup.get(p.kode_aset);
      dedup.set(p.kode_aset, {
        ...p,
        nama_perangkat: pickPreferredText(p.nama_perangkat, cur?.nama_perangkat),
        tipe: pickPreferredText(p.tipe, cur?.tipe),
        lokasi: pickPreferredText(p.lokasi, cur?.lokasi),
      });
    }
    const payload = [...dedup.values()];
    if (!payload.length) return { count: 0 };
    const existing = await fetchExistingAssetsByCodes(payload.map((p) => p.kode_aset));
    const exMap = new Map(existing.map((e: any) => [e.kode_aset, e]));
    for (const p of payload) {
      const ex: any = exMap.get(p.kode_aset);
      await db.query(
        `INSERT INTO maintenance.assets (kode_aset,nama_perangkat,tipe,lokasi,status,maintenance_interval_months)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (kode_aset) DO UPDATE SET
           nama_perangkat=EXCLUDED.nama_perangkat, tipe=EXCLUDED.tipe, lokasi=EXCLUDED.lokasi`,
        [p.kode_aset, p.nama_perangkat, p.tipe, p.lokasi, ex?.status || p.status || "aktif", Number(ex?.maintenance_interval_months || p.maintenance_interval_months || 12)]
      );
    }
    return { count: payload.length };
  });

  fastify.post("/assets/schedule", { preHandler: auth }, async (request, reply) => {
    const b: any = request.body || {};
    const tanggal = b.tanggal_maintenance;
    if (!tanggal) return reply.status(400).send({ error: "Tanggal jadwal wajib diisi." });
    const scopeType = b.scopeType || "semua";
    const lokasi = b.lokasi;
    const activity = (b.jenis_kegiatan || "Estimasi maintenance").trim() || "Estimasi maintenance";

    let q = `SELECT kode_aset,nama_perangkat,tipe,lokasi,status FROM maintenance.assets WHERE status='aktif'`;
    const params: any[] = [];
    if (scopeType === "lokasi") {
      if (!lokasi) return reply.status(400).send({ error: "Lokasi wajib dipilih." });
      params.push(lokasi); q += ` AND lokasi=$1`;
    } else if (scopeType === "kc") {
      q += ` AND lokasi ILIKE 'KC %'`;
    } else if (scopeType === "kcp") {
      q += ` AND lokasi ILIKE 'KCP %'`;
    }
    q += ` ORDER BY lokasi ASC, kode_aset ASC LIMIT 5000`;
    const { rows: assets } = await db.query(q, params);
    if (!assets.length) return { planned: 0, skippedCompleted: 0, skippedInvalid: 0 };

    const locs = [...new Set(assets.map((a: any) => a.lokasi).filter(Boolean))].sort((a: any,b: any)=>String(a).localeCompare(String(b)));
    const order = new Map(locs.map((l, i) => [l, i + 1]));
    const planned = assets.filter((a: any) => a.kode_aset && a.nama_perangkat && a.lokasi).map((a: any) => ({
      tanggal_maintenance: tanggal, kode_aset: a.kode_aset, nama_perangkat: a.nama_perangkat, tipe: a.tipe || null,
      lokasi: a.lokasi, jenis_kegiatan: activity, durasi: null, status: "planning", catatan: null, urutan_kunjungan: order.get(a.lokasi) || null
    }));
    const skippedInvalid = assets.length - planned.length;
    if (!planned.length) return { planned: 0, skippedCompleted: 0, skippedInvalid };

    const codes = planned.map((p: any) => p.kode_aset);
    const ex = await db.query(
      `SELECT tanggal_maintenance,kode_aset,jenis_kegiatan,status FROM maintenance.maintenance
       WHERE tanggal_maintenance=$1::date AND jenis_kegiatan=$2 AND kode_aset = ANY($3::text[])`,
      [tanggal, activity, codes]
    );
    const completedKeys = new Set(ex.rows.filter((r: any) => r.status !== "planning").map((r: any) => `${toDateStr(r.tanggal_maintenance)}|${r.kode_aset}|${r.jenis_kegiatan}`));
    const toUpsert = planned.filter((r: any) => !completedKeys.has(`${r.tanggal_maintenance}|${r.kode_aset}|${r.jenis_kegiatan}`));
    for (const r of toUpsert) {
      await db.query(
        `INSERT INTO maintenance.maintenance (tanggal_maintenance,kode_aset,nama_perangkat,tipe,lokasi,jenis_kegiatan,durasi,status,catatan,urutan_kunjungan)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tanggal_maintenance,kode_aset,jenis_kegiatan) DO UPDATE SET
           nama_perangkat=EXCLUDED.nama_perangkat, tipe=EXCLUDED.tipe, lokasi=EXCLUDED.lokasi, urutan_kunjungan=EXCLUDED.urutan_kunjungan,
           status=CASE WHEN maintenance.maintenance.status='planning' THEN 'planning' ELSE maintenance.maintenance.status END`,
        [r.tanggal_maintenance,r.kode_aset,r.nama_perangkat,r.tipe,r.lokasi,r.jenis_kegiatan,r.durasi,r.status,r.catatan,r.urutan_kunjungan]
      );
    }
    return { planned: toUpsert.length, skippedCompleted: planned.length - toUpsert.length, skippedInvalid };
  });

  // ----- MAINTENANCE -----
  fastify.get("/maintenance/filter-options", async () => {
    const { rows } = await db.query(`SELECT maintenance.get_maintenance_filter_options() AS data`);
    return rows[0]?.data || { lokasi: [], jenis_kegiatan: [] };
  });
  fastify.get("/maintenance/public/filter-options", async () => {
    const { rows } = await db.query(`SELECT maintenance.get_maintenance_filter_options() AS data`);
    return rows[0]?.data || { lokasi: [], jenis_kegiatan: [] };
  });

  fastify.get("/maintenance/years", async (request) => {
    const q: any = request.query || {};
    if (!q.lokasi) return [];
    const { rows } = await db.query(`SELECT * FROM maintenance.get_available_maintenance_years($1)`, [normalizeLocationInput(q.lokasi)]);
    return rows.map((r: any) => r.tahun);
  });

  fastify.get("/maintenance/dashboard", async (request) => {
    const q: any = request.query || {};
    const { rows } = await db.query(`SELECT maintenance.get_maintenance_dashboard($1,$2::date,$3::date,$4) AS data`, [
      normalizeLocationInput(q.lokasi) || null,
      q.tanggalMulai || q.date_from || null,
      q.tanggalSelesai || q.date_to || null,
      q.jenisKegiatan || q.jenis_kegiatan || null,
    ]);
    return rows[0]?.data || {};
  });

  fastify.get("/maintenance/list", async (request) => {
    const q: any = request.query || {};
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.max(1, Number(q.pageSize || q.limit || 20));
    const sortColumn = ["tanggal_maintenance","lokasi","kode_aset","nama_perangkat","jenis_kegiatan","status","created_at"].includes(q.sortColumn) ? q.sortColumn : "tanggal_maintenance";
    const sortDir = q.sortDirection === "asc" ? "ASC" : "DESC";
    const filters = {
      lokasi: q.lokasi, jenisKegiatan: q.jenisKegiatan || q.jenis_kegiatan, status: q.status, officeType: q.officeType,
      tanggalMulai: q.tanggalMulai || q.date_from, tanggalSelesai: q.tanggalSelesai || q.date_to, search: q.search
    };
    const { where, params } = buildMaintenanceFilters(filters);
    const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM maintenance.maintenance ${where}`, params);
    let order = sortColumn === "tanggal_maintenance"
      ? `ORDER BY tanggal_maintenance ${sortDir}, urutan_kunjungan ASC NULLS LAST, lokasi ASC, kode_aset ASC`
      : `ORDER BY ${sortColumn} ${sortDir}`;
    const p2 = [...params, pageSize, (page - 1) * pageSize];
    const { rows } = await db.query(`SELECT * FROM maintenance.maintenance ${where} ${order} LIMIT $${p2.length - 1} OFFSET $${p2.length}`, p2);
    return { data: normalizeRows(rows), count: countRes.rows[0]?.count || 0 };
  });

  fastify.get("/maintenance/export", async (request) => {
    const q: any = request.query || {};
    const filters = {
      lokasi: q.lokasi, jenisKegiatan: q.jenisKegiatan || q.jenis_kegiatan, status: q.status, officeType: q.officeType,
      tanggalMulai: q.tanggalMulai || q.date_from, tanggalSelesai: q.tanggalSelesai || q.date_to, search: q.search
    };
    const { where, params } = buildMaintenanceFilters(filters);
    const { rows } = await db.query(`SELECT * FROM maintenance.maintenance ${where} ORDER BY tanggal_maintenance DESC LIMIT 5000`, params);
    return normalizeRows(rows);
  });

  fastify.get("/maintenance/monitoring", async (request) => {
    const q: any = request.query || {};
    const params: any[] = [];
    let sql = `SELECT * FROM maintenance.maintenance WHERE 1=1`;
    if (q.tanggalMulai) { params.push(q.tanggalMulai); sql += ` AND tanggal_maintenance >= $${params.length}::date`; }
    if (q.tanggalSelesai) { params.push(q.tanggalSelesai); sql += ` AND tanggal_maintenance <= $${params.length}::date`; }
    if (q.lokasi) { params.push(normalizeLocationInput(q.lokasi)); sql += ` AND lokasi ILIKE $${params.length}`; }
    sql += ` ORDER BY tanggal_maintenance DESC, urutan_kunjungan ASC NULLS LAST, lokasi ASC LIMIT 2000`;
    const { rows } = await db.query(sql, params);
    let data = normalizeRows(rows);
    // client-side-like filters for status/officeType
    if (q.status) data = data.filter((r: any) => (r.status === "planning" ? "planning" : "selesai") === q.status);
    if (q.officeType) {
      data = data.filter((r: any) => {
        const loc = (r.lokasi || "").toUpperCase();
        const t = loc.startsWith("KCP ") ? "kcp" : loc.startsWith("KC ") ? "kc" : "lainnya";
        return t === q.officeType;
      });
    }
    // summary
    const total = data.length;
    const selesai = data.filter((r: any) => r.status !== "planning").length;
    const terjadwal = total - selesai;
    const locations = new Set(data.map((r: any) => r.lokasi).filter(Boolean));
    const doneLocations = new Set(data.filter((r: any) => r.status !== "planning").map((r: any) => r.lokasi).filter(Boolean));
    const byOfficeType = ["kc","kcp","lainnya"].map((ot) => {
      const sc = data.filter((r: any) => { const loc=(r.lokasi||"").toUpperCase(); const t=loc.startsWith("KCP ")?"kcp":loc.startsWith("KC ")?"kc":"lainnya"; return t===ot; });
      const sd = sc.filter((r: any) => r.status !== "planning").length;
      return { officeType: ot, total: sc.length, selesai: sd, terjadwal: sc.length - sd };
    });
    const summary = { total, selesai, terjadwal, progress: total ? Math.round((selesai/total)*100) : 0, totalLokasi: locations.size, lokasiSelesai: doneLocations.size, sisaLokasi: Math.max(locations.size-doneLocations.size,0), byOfficeType };
    // timeline
    const dateMap = new Map<string, Map<string, any>>();
    for (const row of data) {
      const date = toDateStr(row.tanggal_maintenance) || "Tanpa tanggal";
      const locKey = row.lokasi || "Tanpa lokasi";
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      const lm = dateMap.get(date)!;
      if (!lm.has(locKey)) lm.set(locKey, { date, lokasi: locKey, officeType: (locKey.toUpperCase().startsWith("KCP ")?"kcp":locKey.toUpperCase().startsWith("KC ")?"kc":"lainnya"), urutan_kunjungan: row.urutan_kunjungan, rows: [] });
      lm.get(locKey).rows.push(row);
    }
    const timeline = [...dateMap.entries()].map(([date, lm]) => ({
      date,
      locations: [...lm.values()].map((l: any) => {
        const done = l.rows.filter((r: any) => r.status !== "planning").length;
        const st = done === 0 ? "terjadwal" : done === l.rows.length ? "selesai" : "sebagian";
        return { ...l, status: st, total: l.rows.length, selesai: done, terjadwal: l.rows.length - done };
      })
    }));
    return { rows: data, summary, timeline };
  });

  fastify.get("/maintenance/work", async (request) => {
    const q: any = request.query || {};
    const params: any[] = [];
    let sql = `SELECT * FROM maintenance.maintenance WHERE status = 'planning'`;
    if (q.lokasi) { params.push(normalizeLocationInput(q.lokasi)); sql += ` AND lokasi ILIKE $${params.length}`; }
    if (q.tanggal) { params.push(q.tanggal); sql += ` AND tanggal_maintenance = $${params.length}::date`; }
    sql += ` ORDER BY tanggal_maintenance ASC, urutan_kunjungan ASC NULLS LAST, lokasi ASC, kode_aset ASC LIMIT 500`;
    const { rows } = await db.query(sql, params);
    return normalizeRows(rows);
  });

  fastify.post("/maintenance", { preHandler: auth }, async (request) => {
    const p: any = request.body || {};
    const row = {
      tanggal_maintenance: p.tanggal_maintenance, kode_aset: resolveAssetCode({ kodeAset: p.kode_aset, namaPerangkat: p.nama_perangkat, lokasi: p.lokasi, tipe: p.tipe }),
      nama_perangkat: String(p.nama_perangkat || "").trim(), tipe: p.tipe?.trim?.() || null, lokasi: normalizeLocationInput(p.lokasi),
      jenis_kegiatan: p.jenis_kegiatan || "Maintenance", durasi: p.durasi ?? null, status: p.status || "selesai",
      urutan_kunjungan: p.urutan_kunjungan ?? null, catatan: p.catatan?.trim?.() || null,
    };
    await syncAssetCatalog([row]);
    await db.query(
      `INSERT INTO maintenance.maintenance (tanggal_maintenance,kode_aset,nama_perangkat,tipe,lokasi,jenis_kegiatan,durasi,status,urutan_kunjungan,catatan)
       VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [row.tanggal_maintenance,row.kode_aset,row.nama_perangkat,row.tipe,row.lokasi,row.jenis_kegiatan,row.durasi,row.status,row.urutan_kunjungan,row.catatan]
    );
    return { ok: true };
  });

  fastify.patch("/maintenance/:id", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as any;
    const cur = await db.query(`SELECT * FROM maintenance.maintenance WHERE id=$1`, [id]);
    if (!cur.rows[0]) return reply.status(404).send({ error: "Not found" });
    const merged = { ...normalizeRow(cur.rows[0]), ...(request.body as any) };
    const row = {
      tanggal_maintenance: merged.tanggal_maintenance, kode_aset: resolveAssetCode({ kodeAset: merged.kode_aset, namaPerangkat: merged.nama_perangkat, lokasi: merged.lokasi, tipe: merged.tipe }),
      nama_perangkat: String(merged.nama_perangkat || "").trim(), tipe: merged.tipe?.trim?.() || null, lokasi: normalizeLocationInput(merged.lokasi),
      jenis_kegiatan: merged.jenis_kegiatan || "Maintenance", durasi: merged.durasi ?? null, status: merged.status || "selesai",
      urutan_kunjungan: merged.urutan_kunjungan ?? null, catatan: merged.catatan?.trim?.() || null,
    };
    await syncAssetCatalog([row]);
    await db.query(
      `UPDATE maintenance.maintenance SET tanggal_maintenance=$1::date,kode_aset=$2,nama_perangkat=$3,tipe=$4,lokasi=$5,jenis_kegiatan=$6,durasi=$7,status=$8,urutan_kunjungan=$9,catatan=$10 WHERE id=$11`,
      [row.tanggal_maintenance,row.kode_aset,row.nama_perangkat,row.tipe,row.lokasi,row.jenis_kegiatan,row.durasi,row.status,row.urutan_kunjungan,row.catatan,id]
    );
    return { ok: true };
  });

  fastify.delete("/maintenance/:id", { preHandler: auth }, async (request) => {
    const { id } = request.params as any;
    await db.query(`DELETE FROM maintenance.maintenance WHERE id=$1`, [id]);
    return { ok: true };
  });

  fastify.post("/maintenance/upsert", { preHandler: auth }, async (request) => {
    const body: any = request.body || {};
    const rowsIn: any[] = Array.isArray(body) ? body : (body.rows || body.data || []);
    const assetRows: any[] = body.assets || [];
    const norm = rowsIn.map((p: any) => ({
      tanggal_maintenance: p.tanggal_maintenance, kode_aset: resolveAssetCode({ kodeAset: p.kode_aset, namaPerangkat: p.nama_perangkat, lokasi: p.lokasi, tipe: p.tipe }),
      nama_perangkat: String(p.nama_perangkat || "").trim(), tipe: p.tipe?.trim?.() || null, lokasi: normalizeLocationInput(p.lokasi),
      jenis_kegiatan: p.jenis_kegiatan || "Maintenance", durasi: p.durasi ?? null, status: p.status || "selesai",
      urutan_kunjungan: p.urutan_kunjungan ?? null, catatan: p.catatan?.trim?.() || null,
    }));
    const dedup = new Map<string, any>();
    for (const r of norm) dedup.set(`${r.tanggal_maintenance}|${r.kode_aset}|${r.jenis_kegiatan}`, r);
    const rows = [...dedup.values()];
    await syncAssetCatalog([...assetRows, ...rows]);
    // merge with existing
    for (const r of rows) {
      const ex = await db.query(`SELECT status,catatan,durasi FROM maintenance.maintenance WHERE tanggal_maintenance=$1::date AND kode_aset=$2 AND jenis_kegiatan=$3`, [r.tanggal_maintenance, r.kode_aset, r.jenis_kegiatan]);
      let row = r;
      if (ex.rows[0]) {
        const e = ex.rows[0];
        if (e.status !== "planning" && row.status === "planning") {
          row = { ...row, status: e.status, catatan: pickPreferredText(e.catatan, row.catatan), durasi: e.durasi ?? row.durasi };
        } else if (e.catatan && !row.catatan) {
          row = { ...row, catatan: e.catatan };
        }
      }
      await db.query(
        `INSERT INTO maintenance.maintenance (tanggal_maintenance,kode_aset,nama_perangkat,tipe,lokasi,jenis_kegiatan,durasi,status,urutan_kunjungan,catatan)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tanggal_maintenance,kode_aset,jenis_kegiatan) DO UPDATE SET
           nama_perangkat=EXCLUDED.nama_perangkat, tipe=EXCLUDED.tipe, lokasi=EXCLUDED.lokasi, jenis_kegiatan=EXCLUDED.jenis_kegiatan,
           durasi=EXCLUDED.durasi, status=EXCLUDED.status, urutan_kunjungan=EXCLUDED.urutan_kunjungan, catatan=EXCLUDED.catatan`,
        [row.tanggal_maintenance,row.kode_aset,row.nama_perangkat,row.tipe,row.lokasi,row.jenis_kegiatan,row.durasi,row.status,row.urutan_kunjungan,row.catatan]
      );
    }
    return { ok: true, count: rows.length };
  });

  fastify.post("/maintenance/:id/complete", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as any;
    const cur = await db.query(`SELECT * FROM maintenance.maintenance WHERE id=$1`, [id]);
    if (!cur.rows[0]) return reply.status(404).send({ error: "Not found" });
    const b: any = request.body || {};
    await db.query(
      `UPDATE maintenance.maintenance SET status='selesai', durasi=COALESCE($1,durasi), catatan=COALESCE($2,catatan) WHERE id=$3`,
      [b.durasi ?? null, b.catatan?.trim?.() || null, id]
    );
    return { ok: true };
  });
};

export default maintenanceRoutes;
