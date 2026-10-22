import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Monitor, Package, Pencil, Plus, Settings } from "lucide-react";
import api from "../lib/api";
import RemoteControl from "../components/RemoteControl";
import Pagination from "../components/Pagination";
import AssetPanel from "../components/AssetPanel";
import { deviceRows } from "../lib/devices.mjs";

export default function DeviceList() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [osFilter, setOsFilter] = useState("");
  const [page, setPage] = useState(1);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [form, setForm] = useState({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });
  const [selected, setSelected] = useState<{ inventoryId: string | null; deviceId: string | null } | null>(null);

  const devices = useQuery({ queryKey: ["devices"], queryFn: async () => (await api.get("/devices")).data, refetchInterval: 10000 });
  const assets = useQuery({ queryKey: ["inventories"], queryFn: async () => (await api.get("/inventories")).data });
  const groups = useQuery({ queryKey: ["device-groups"], queryFn: async () => (await api.get("/device-groups")).data });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["inventories"] });
    client.invalidateQueries({ queryKey: ["device-groups"] });
  };
  const action = useMutation({
    mutationFn: async ({ method, url, data }: { method: "post" | "patch" | "delete"; url: string; data?: any }) => api.request({ method, url, data }),
    onSuccess: refresh,
  });

  const rows = deviceRows(devices.data || [], assets.data || []);
  const locations = useMemo(
    () => [...new Set([...(groups.data || []).map((g: any) => g.nama), ...rows.map((r: any) => r.lokasi).filter(Boolean)])] as string[],
    [groups.data, rows]
  );
  const osList = useMemo(() => [...new Set(rows.map((r: any) => r.os_name).filter(Boolean))] as string[], [rows]);

  const filtered = rows.filter((r: any) => {
    if (location === "__none" ? r.lokasi : location) {
      if (!(location === "__none" ? !r.lokasi : r.lokasi === location)) return false;
    }
    if (osFilter && r.os_name !== osFilter) return false;
    const haystack = [r.device_name, r.hostname, r.device_id, r.no_inventaris, r.lokasi].map(v => String(v || "").toLowerCase());
    return haystack.some(v => v.includes(search.toLowerCase()));
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * 12, current * 12);

  return (
    <div className="page device-page">
      <div className="page-head">
        <h1>Perangkat</h1>
        <span className="muted">
          {rows.length} baris · {new Set(rows.map((r: any) => r.device_id).filter(Boolean)).size} perangkat
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(v => !v)}>
          <Plus size={15} /> Tambah aset
        </button>
        <button className="btn btn-quiet btn-sm" onClick={() => setGroupsOpen(true)}>
          <Settings size={15} /> Kelola group
        </button>
      </div>

      {action.isError && (
        <p role="alert">{(action.error as any)?.response?.data?.error || "Gagal menyimpan perubahan"}</p>
      )}

      {createOpen && (
        <form
          className="panel device-form"
          onSubmit={async e => {
            e.preventDefault();
            try {
              await action.mutateAsync({ method: "post", url: "/inventories", data: form });
              setCreateOpen(false);
              setForm({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });
            } catch {}
          }}
        >
          <label>
            No. inventaris (9 digit)
            <input required pattern="[0-9]{9}" maxLength={9} placeholder="123456789" value={form.no_inventaris} onChange={e => setForm({ ...form, no_inventaris: e.target.value })} />
          </label>
          <label>
            Device
            <select value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })}>
              <option value="">Tanpa device</option>
              {(devices.data || []).map((d: any) => (
                <option key={d.device_id} value={d.device_id}>{d.device_name || d.device_id}</option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select value={form.lokasi} onChange={e => setForm({ ...form, lokasi: e.target.value })}>
              <option value="">Belum dikelompokkan</option>
              {locations.map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Catatan
            <input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={action.isPending}>Simpan</button>
        </form>
      )}

      <div className="device-filters">
        <input aria-label="Cari perangkat" placeholder="Cari PC, nomor inventaris, lokasi..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select aria-label="Filter group" value={location} onChange={e => { setLocation(e.target.value); setPage(1); }}>
          <option value="">Semua group</option>
          <option value="__none">Belum dikelompokkan</option>
          {locations.map(name => <option key={name}>{name}</option>)}
        </select>
        <select aria-label="Filter OS" value={osFilter} onChange={e => { setOsFilter(e.target.value); setPage(1); }}>
          <option value="">Semua OS</option>
          {osList.map(name => <option key={name}>{name}</option>)}
        </select>
        <span className="muted">{filtered.length} cocok</span>
      </div>

      {devices.isLoading || assets.isLoading ? (
        <p>Memuat...</p>
      ) : devices.isError || assets.isError ? (
        <p role="alert">Gagal memuat perangkat. Muat ulang halaman.</p>
      ) : (
        <div className="device-layout">
          <div className="device-cards">
            {pageRows.map((row: any) => {
              const label = row.device_name || row.hostname || "Aset tanpa device";
              const open = () => setSelected({ inventoryId: row.inventoryId || null, deviceId: row.device_id || null });
              return (
                <article key={row.rowId} className="device-card-clean" onClick={open}>
                  <header className="device-card-clean-head">
                    <span className="device-card-clean-icon">{row.device_id ? <Monitor size={15} /> : <Package size={15} />}</span>
                    <div className="device-card-clean-title">
                      {/* Tombol sungguhan, bukan strong: kartu tak boleh role=button
                          karena memuat tombol lain (nested interactive = a11y rusak). */}
                      <button className="device-card-clean-open" onClick={e => { e.stopPropagation(); open(); }}>{label}</button>
                      <span>{row.os_name || "OS belum dilaporkan"}</span>
                    </div>
                    {row.lokasi && <span className="device-card-clean-lokasi">{row.lokasi}</span>}
                  </header>
                  <div className="device-card-clean-no">
                    <span className="muted">No. Inventaris</span>
                    <span className="device-card-clean-number">{row.no_inventaris || "Belum terdaftar"}</span>
                    {row.inventoryId ? (
                      <button className="icon-btn" aria-label={`Edit ${row.no_inventaris || "aset"}`} title="Edit nomor inventaris"
                        onClick={e => { e.stopPropagation(); open(); }}><Pencil size={14} /></button>
                    ) : row.device_id ? (
                      <button className="icon-btn" aria-label="Daftarkan aset" title="Daftarkan aset untuk perangkat ini"
                        onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, device_id: row.device_id })); setCreateOpen(true); }}><Plus size={14} /></button>
                    ) : null}
                  </div>
                  <footer className="device-card-clean-foot">
                    {row.active_count > 0 ? (
                      <span className="badge-active">{row.active_count} tiket aktif</span>
                    ) : (
                      <span className="badge-done">Tidak ada tiket aktif</span>
                    )}
                    <div className="device-actions" onClick={e => e.stopPropagation()}>
                      {row.device_id && <Link className="btn btn-tinted btn-sm btn-action" to={`/devices/${row.device_id}`}>Detail</Link>}
                      {row.device_id && <RemoteControl deviceId={row.device_id} deviceName={label} osName={row.os_name} />}
                    </div>
                  </footer>
                </article>
              );
            })}
            {!pageRows.length && <div className="empty">Tidak ada perangkat yang cocok.</div>}
          </div>

          {selected && (
            <AssetPanel inventoryId={selected.inventoryId} deviceId={selected.deviceId} onClose={() => setSelected(null)} onSaved={refresh} />
          )}
        </div>
      )}

      <Pagination page={current} totalPages={totalPages} total={filtered.length} onChange={setPage} label="baris" />

      {groupsOpen && (
        <div className="device-group-overlay" onClick={() => setGroupsOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="Kelola group" className="panel device-group-modal" onClick={e => e.stopPropagation()}>
            <div className="panel-head">
              <h2>Kelola group / lokasi</h2>
              <button className="btn btn-outline" onClick={() => setGroupsOpen(false)}>Tutup</button>
            </div>
            <form className="device-filters" onSubmit={async e => { e.preventDefault(); try { await action.mutateAsync({ method: "post", url: "/device-groups", data: { nama: groupName } }); setGroupName(""); } catch {} }}>
              <input aria-label="Nama group baru" required maxLength={100} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nama group baru" />
              <button className="btn btn-primary" disabled={action.isPending}>Tambah</button>
            </form>
            {action.isError && <p role="alert">{(action.error as any)?.response?.data?.error || "Gagal menyimpan group"}</p>}
            {(groups.data || []).map((g: any) => {
              const count = rows.filter((r: any) => r.lokasi === g.nama).length;
              return (
                <div className="device-group-row" key={g.id}>
                  <span>{g.nama} <small>({count} aset)</small></span>
                  <button className="btn btn-outline" disabled={action.isPending || count > 0} title={count ? "Pindahkan aset ke group lain sebelum menghapus" : "Hapus group"}
                    onClick={() => { if (confirm(`Hapus group ${g.nama}?`)) action.mutate({ method: "delete", url: `/device-groups/${g.id}` }); }}>Hapus</button>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
