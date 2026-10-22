import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import RemoteControl from "../components/RemoteControl";
import Pagination from "../components/Pagination";
import { deviceRows } from "../lib/devices.mjs";

export default function DeviceList() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [form, setForm] = useState({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });
  const devices = useQuery({ queryKey: ["devices"], queryFn: async () => (await api.get("/devices")).data, refetchInterval: 10000 });
  const assets = useQuery({ queryKey: ["inventories"], queryFn: async () => (await api.get("/inventories")).data });
  const groups = useQuery({ queryKey: ["device-groups"], queryFn: async () => (await api.get("/device-groups")).data });
  const refresh = () => { client.invalidateQueries({ queryKey: ["inventories"] }); client.invalidateQueries({ queryKey: ["device-groups"] }); };
  const action = useMutation({ mutationFn: async ({ method, url, data }: { method: "post" | "patch" | "delete"; url: string; data?: any }) => api.request({ method, url, data }), onSuccess: refresh });
  const rows = deviceRows(devices.data || [], assets.data || []);
  const locations = [...new Set([...(groups.data || []).map((g: any) => g.nama), ...rows.map((r: any) => r.lokasi).filter(Boolean)])] as string[];
  const filtered = rows.filter((r: any) => (!location || (location === "__none" ? !r.lokasi : r.lokasi === location)) && [r.device_name, r.hostname, r.device_id, r.no_inventaris, r.lokasi].some(v => String(v || "").toLowerCase().includes(search.toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 15));
  const current = Math.min(page, totalPages);
  return <div className="page">
    <div className="page-head"><h1>Perangkat</h1><button className="btn btn-primary" onClick={() => setCreateOpen(!createOpen)}>Tambah aset</button><button className="btn btn-outline" onClick={() => setGroupsOpen(true)}>Kelola group</button></div>
    {action.isError && <p role="alert">{(action.error as any)?.response?.data?.error || "Gagal menyimpan perubahan"}</p>}
    {createOpen && <form className="panel device-form" onSubmit={async e => { e.preventDefault(); try { await action.mutateAsync({ method: "post", url: "/inventories", data: form }); setCreateOpen(false); setForm({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" }); } catch {} }}>
      <label>No. inventaris (9 digit)<input required pattern="[0-9]{9}" maxLength={9} placeholder="123456789" value={form.no_inventaris} onChange={e => setForm({ ...form, no_inventaris: e.target.value })} /></label>
      <label>Device<select value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })}><option value="">Tanpa device</option>{(devices.data || []).map((d: any) => <option key={d.device_id} value={d.device_id}>{d.device_name || d.device_id}</option>)}</select></label>
      <label>Group<select value={form.lokasi} onChange={e => setForm({ ...form, lokasi: e.target.value })}><option value="">Belum dikelompokkan</option>{locations.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Catatan<input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} /></label><button className="btn btn-primary" disabled={action.isPending}>Simpan</button>
    </form>}
    <div className="panel">
      <div className="device-filters"><input aria-label="Cari perangkat" placeholder="Cari PC, nomor inventaris, lokasi..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><select aria-label="Filter group" value={location} onChange={e => { setLocation(e.target.value); setPage(1); }}><option value="">Semua group</option><option value="__none">Belum dikelompokkan</option>{locations.map(name => <option key={name}>{name}</option>)}</select><span className="muted">{filtered.length} aset/device</span></div>
      {(devices.isLoading || assets.isLoading) ? <p>Memuat...</p> : (devices.isError || assets.isError) ? <p role="alert">Gagal memuat perangkat. Muat ulang halaman.</p> : <div className="device-table-scroll"><table className="device-table"><thead><tr><th>Perangkat</th><th>No. inventaris</th><th>Group / lokasi</th><th>OS</th><th>Tiket aktif</th><th>Aksi</th></tr></thead><tbody>
        {filtered.slice((current - 1) * 15, current * 15).map((row: any) => <tr key={row.rowId}>
          <td data-label="Perangkat">{row.device_name || row.hostname || "Aset tanpa device"}{row.device_id && rows.filter((r: any) => r.device_id === row.device_id).length > 1 && <small>Beberapa aset terhubung</small>}</td>
          <td data-label="No. inventaris">{row.no_inventaris || "Belum terdaftar"}</td><td data-label="Group">{row.lokasi || "—"}</td><td data-label="OS">{row.os_name || "—"}</td><td data-label="Tiket aktif">{row.active_count || 0}</td>
          <td data-label="Aksi"><div className="device-actions">{row.inventoryId && <Link className="btn btn-outline" to={`/inventaries/${row.inventoryId}`}>Aset</Link>}{row.device_id && <><Link className="btn btn-outline" to={`/devices/${row.device_id}`}>Detail</Link><RemoteControl deviceId={row.device_id} deviceName={row.device_name || row.hostname || row.device_id} osName={row.os_name} /></>}</div></td>
        </tr>)}
        {!filtered.length && <tr><td colSpan={6}>Tidak ada perangkat yang cocok.</td></tr>}
      </tbody></table></div>}
      <Pagination page={current} totalPages={totalPages} total={filtered.length} onChange={setPage} label="aset/device" />
    </div>
    {groupsOpen && <div className="device-group-overlay" onClick={() => setGroupsOpen(false)}><section role="dialog" aria-modal="true" aria-label="Kelola group" className="panel device-group-modal" onClick={e => e.stopPropagation()}><div className="panel-head"><h2>Kelola group / lokasi</h2><button className="btn btn-outline" onClick={() => setGroupsOpen(false)}>Tutup</button></div>
      <form className="device-filters" onSubmit={async e => { e.preventDefault(); try { await action.mutateAsync({ method: "post", url: "/device-groups", data: { nama: groupName } }); setGroupName(""); } catch {} }}><input aria-label="Nama group baru" required maxLength={100} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nama group baru" /><button className="btn btn-primary" disabled={action.isPending}>Tambah</button></form>
      {action.isError && <p role="alert">{(action.error as any)?.response?.data?.error || "Gagal menyimpan group"}</p>}
      {(groups.data || []).map((g: any) => { const count = rows.filter((r: any) => r.lokasi === g.nama).length; return <div className="device-group-row" key={g.id}><span>{g.nama} <small>({count} aset)</small></span><button className="btn btn-outline" disabled={action.isPending || count > 0} title={count ? "Pindahkan aset ke group lain sebelum menghapus" : "Hapus group"} onClick={() => { if (confirm(`Hapus group ${g.nama}?`)) action.mutate({ method: "delete", url: `/device-groups/${g.id}` }); }}>Hapus</button></div>; })}
    </section></div>}
  </div>;
}
