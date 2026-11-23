import { db } from "./database.js";

export async function initMaintenanceDb() {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS maintenance;

      CREATE TABLE IF NOT EXISTS maintenance.assets (
        id bigint generated always as identity primary key,
        kode_aset text not null unique,
        nama_perangkat text not null,
        tipe text,
        lokasi text,
        status text not null default 'aktif',
        maintenance_interval_months integer not null default 12,
        created_at timestamptz not null default now(),
        constraint assets_status_check check (status in ('aktif', 'maintenance', 'rusak', 'nonaktif')),
        constraint assets_interval_check check (maintenance_interval_months in (6, 12, 24))
      );

      CREATE TABLE IF NOT EXISTS maintenance.maintenance (
        id bigint generated always as identity primary key,
        tanggal_maintenance date not null,
        kode_aset text not null,
        nama_perangkat text not null,
        tipe text,
        lokasi text,
        jenis_kegiatan text not null default 'Maintenance',
        durasi integer,
        status text not null default 'selesai',
        urutan_kunjungan integer,
        catatan text,
        created_at timestamptz not null default now(),
        constraint maintenance_status_check check (status in ('selesai', 'planning')),
        constraint maintenance_durasi_non_negative check (durasi is null or durasi >= 0),
        constraint maintenance_visit_order_positive check (urutan_kunjungan is null or urutan_kunjungan > 0),
        constraint uq_maintenance_tanggal_kode_aset_kegiatan unique (tanggal_maintenance, kode_aset, jenis_kegiatan)
      );

      CREATE INDEX IF NOT EXISTS idx_assets_lokasi on maintenance.assets(lokasi);
      CREATE INDEX IF NOT EXISTS idx_assets_status on maintenance.assets(status);
      CREATE INDEX IF NOT EXISTS idx_assets_interval on maintenance.assets(maintenance_interval_months);

      CREATE INDEX IF NOT EXISTS idx_maintenance_tanggal on maintenance.maintenance(tanggal_maintenance);
      CREATE INDEX IF NOT EXISTS idx_maintenance_lokasi on maintenance.maintenance(lokasi);
      CREATE INDEX IF NOT EXISTS idx_maintenance_status on maintenance.maintenance(status);
      CREATE INDEX IF NOT EXISTS idx_maintenance_kode_aset on maintenance.maintenance(kode_aset);
      CREATE INDEX IF NOT EXISTS idx_maintenance_visit_order on maintenance.maintenance(tanggal_maintenance, urutan_kunjungan, lokasi);
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION maintenance.get_maintenance_filter_options()
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $fn$
        select jsonb_build_object(
          'lokasi', coalesce((
            select jsonb_agg(option_value order by option_value)
            from (
              select distinct lokasi as option_value
              from maintenance.maintenance
              where lokasi is not null and lokasi <> ''
            ) lokasi_options
          ), '[]'::jsonb),
          'jenis_kegiatan', coalesce((
            select jsonb_agg(option_value order by option_value)
            from (
              select distinct jenis_kegiatan as option_value
              from maintenance.maintenance
              where jenis_kegiatan is not null and jenis_kegiatan <> ''
            ) activity_options
          ), '[]'::jsonb)
        );
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.get_available_maintenance_years(p_lokasi text)
      RETURNS table (tahun integer)
      LANGUAGE sql
      STABLE
      AS $fn$
        select distinct extract(year from tanggal_maintenance)::integer as tahun
        from maintenance.maintenance
        where lokasi = p_lokasi
        order by tahun desc;
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.get_maintenance_dashboard(
        p_lokasi text default null,
        p_date_from date default null,
        p_date_to date default null,
        p_jenis_kegiatan text default null
      )
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $fn$
        with scoped as (
          select *
          from maintenance.maintenance
          where (p_lokasi is null or lokasi = p_lokasi)
            and (p_date_from is null or tanggal_maintenance >= p_date_from)
            and (p_date_to is null or tanggal_maintenance <= p_date_to)
            and (p_jenis_kegiatan is null or jenis_kegiatan = p_jenis_kegiatan)
        ),
        filtered as (
          select * from scoped where status <> 'planning'
        ),
        yearly as (
          select extract(year from tanggal_maintenance)::integer as tahun, count(*)::integer as total_maintenance
          from filtered
          group by 1
          order by 1
        ),
        activities as (
          select coalesce(jenis_kegiatan, 'tanpa-kategori') as jenis_kegiatan, count(*)::integer as total_maintenance
          from filtered
          group by 1
          order by 2 desc, 1 asc
        ),
        top_activity as (
          select jenis_kegiatan
          from activities
          order by total_maintenance desc, jenis_kegiatan asc
          limit 1
        )
        select jsonb_build_object(
          'total_aset', coalesce((select count(*)::integer from maintenance.assets where (p_lokasi is null or lokasi = p_lokasi)), 0),
          'total_maintenance', coalesce((select count(*)::integer from filtered), 0),
          'planning_maintenance', coalesce((select count(*)::integer from scoped where status = 'planning'), 0),
          'total_durasi', coalesce((select sum(coalesce(durasi, 0))::integer from filtered), 0),
          'kegiatan_paling_sering', coalesce((select jenis_kegiatan from top_activity), '-'),
          'yearly', coalesce((select jsonb_agg(jsonb_build_object('tahun', tahun, 'total_maintenance', total_maintenance) order by tahun) from yearly), '[]'::jsonb),
          'activities', coalesce((select jsonb_agg(jsonb_build_object('jenis_kegiatan', jenis_kegiatan, 'total_maintenance', total_maintenance) order by total_maintenance desc, jenis_kegiatan) from activities), '[]'::jsonb)
        );
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.asset_overview_base(
        p_lokasi text default null,
        p_status text default null,
        p_search text default null,
        p_interval_months integer default null,
        p_priority text default null
      )
      RETURNS table (
        id bigint, kode_aset text, nama_perangkat text, tipe text, lokasi text, status text,
        maintenance_interval_months integer, created_at timestamptz,
        last_maintenance_date date, next_maintenance_date date,
        priority_label text, priority_rank integer
      )
      LANGUAGE sql
      STABLE
      AS $fn$
        with maintenance_lookup as (
          select upper(btrim(kode_aset)) as kode_aset, max(tanggal_maintenance) as last_maintenance_date
          from maintenance.maintenance
          where status <> 'planning'
          group by upper(btrim(kode_aset))
        ),
        enriched as (
          select
            a.id, a.kode_aset, a.nama_perangkat, a.tipe, a.lokasi, a.status,
            a.maintenance_interval_months, a.created_at,
            lookup.last_maintenance_date,
            case
              when lookup.last_maintenance_date is null then null
              else (lookup.last_maintenance_date + make_interval(months => a.maintenance_interval_months))::date
            end as next_maintenance_date
          from maintenance.assets a
          left join maintenance_lookup lookup on lookup.kode_aset = upper(btrim(a.kode_aset))
        ),
        prioritized as (
          select
            enriched.*,
            case
              when enriched.last_maintenance_date is null then 'belum-ada-histori'
              when enriched.next_maintenance_date <= current_date then 'lewat'
              when enriched.next_maintenance_date <= (current_date + interval '3 months')::date then 'mendekati'
              else 'normal'
            end as priority_label,
            case
              when enriched.last_maintenance_date is null then 2
              when enriched.next_maintenance_date <= current_date then 0
              when enriched.next_maintenance_date <= (current_date + interval '3 months')::date then 1
              else 3
            end as priority_rank
          from enriched
        )
        select
          p.id, p.kode_aset, p.nama_perangkat, p.tipe, p.lokasi, p.status,
          p.maintenance_interval_months, p.created_at,
          p.last_maintenance_date, p.next_maintenance_date, p.priority_label, p.priority_rank
        from prioritized p
        where (p_lokasi is null or p.lokasi = p_lokasi)
          and (p_status is null or p.status = p_status)
          and (p_interval_months is null or p.maintenance_interval_months = p_interval_months)
          and (
            p_search is null or p_search = ''
            or p.kode_aset ilike '%' || replace(p_search, ',', ' ') || '%'
            or p.nama_perangkat ilike '%' || replace(p_search, ',', ' ') || '%'
            or coalesce(p.tipe, '') ilike '%' || replace(p_search, ',', ' ') || '%'
          )
          and (p_priority is null or p.priority_label = p_priority);
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.get_asset_options()
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $fn$
        select jsonb_build_object(
          'lokasi', coalesce((select jsonb_agg(option_value order by option_value) from (select distinct lokasi as option_value from maintenance.assets where lokasi is not null and lokasi <> '') lokasi_options), '[]'::jsonb),
          'status', coalesce((select jsonb_agg(option_value order by option_value) from (select distinct status as option_value from maintenance.assets where status is not null and status <> '') status_options), '[]'::jsonb),
          'intervals', coalesce((select jsonb_agg(option_value order by option_value) from (select distinct maintenance_interval_months as option_value from maintenance.assets where maintenance_interval_months is not null) interval_options), '[]'::jsonb)
        );
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.get_asset_summary(
        p_lokasi text default null, p_status text default null, p_search text default null,
        p_interval_months integer default null, p_priority text default null
      )
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $fn$
        with filtered as (
          select * from maintenance.asset_overview_base(p_lokasi, p_status, p_search, p_interval_months, p_priority)
        )
        select jsonb_build_object(
          'total_assets', count(*)::integer,
          'active_assets', count(*) filter (where status = 'aktif')::integer,
          'due_assets', count(*) filter (where priority_label in ('lewat', 'mendekati', 'belum-ada-histori'))::integer,
          'overdue_assets', count(*) filter (where priority_label = 'lewat')::integer,
          'upcoming_assets', count(*) filter (where priority_label = 'mendekati')::integer,
          'missing_history_assets', count(*) filter (where priority_label = 'belum-ada-histori')::integer
        )
        from filtered;
      $fn$;

      CREATE OR REPLACE FUNCTION maintenance.get_asset_list(
        p_lokasi text default null, p_status text default null, p_search text default null,
        p_interval_months integer default null, p_priority text default null,
        p_page integer default 1, p_page_size integer default 10
      )
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $fn$
        with filtered as (
          select * from maintenance.asset_overview_base(p_lokasi, p_status, p_search, p_interval_months, p_priority)
        ),
        paged as (
          select * from filtered
          order by priority_rank, next_maintenance_date nulls last, kode_aset
          limit greatest(coalesce(p_page_size, 10), 1)
          offset greatest(coalesce(p_page, 1) - 1, 0) * greatest(coalesce(p_page_size, 10), 1)
        )
        select jsonb_build_object(
          'count', coalesce((select count(*)::integer from filtered), 0),
          'data', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', id, 'kode_aset', kode_aset, 'nama_perangkat', nama_perangkat,
                'tipe', tipe, 'lokasi', lokasi, 'status', status,
                'maintenance_interval_months', maintenance_interval_months, 'created_at', created_at,
                'last_maintenance_date', last_maintenance_date, 'next_maintenance_date', next_maintenance_date,
                'priority_label', priority_label, 'priority_rank', priority_rank
              )
              order by priority_rank, next_maintenance_date nulls last, kode_aset
            ) from paged
          ), '[]'::jsonb)
        );
      $fn$;
    `);

    console.log("Maintenance schema created");
  } finally {
    client.release();
  }
}
