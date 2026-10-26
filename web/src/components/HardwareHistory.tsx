import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

export default function HardwareHistory({ inventoryId }: { inventoryId: string }) {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const empty = { event_date: new Date().toISOString().slice(0, 10), jenis: "ganti", komponen: "", old_detail: "", new_detail: "", catatan: "" };
  const [form, setForm] = useState(empty);
  const { data, isLoading, isError } = useQuery({ queryKey: ["inventory", inventoryId], queryFn: async () => (await api.get(`/inventories/${inventoryId}`)).data });
  const save = useMutation({
    mutationFn: () => api.post(`/inventories/${inventoryId}/events`, form),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["inventory", inventoryId] }); setAdding(false); setForm(empty); },
  });
  return <section className="asset-section">
    <div className="asset-section-head"><h3>Riwayat Penggantian Komponen</h3><button className="btn btn-outline btn-sm" onClick={() => setAdding(!adding)}>Tambah Riwayat</button></div>
    {adding && <form className="device-form" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <label>Tanggal<input required type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} /></label>
      <label>Jenis<select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })}><option value="ganti">Ganti</option><option value="upgrade">Upgrade</option><option value="perbaikan">Perbaikan</option></select></label>
      {([['komponen', 'Komponen'], ['old_detail', 'Komponen lama'], ['new_detail', 'Komponen baru'], ['catatan', 'Catatan']] as const).map(([key, label]) => <label key={key}>{label}<input required={key === 'komponen'} maxLength={1000} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      {save.isError && <p role="alert">{(save.error as any)?.response?.data?.error || "Gagal menyimpan riwayat"}</p>}
      <button className="btn btn-primary" disabled={save.isPending}>Simpan</button>
    </form>}
    {isLoading ? <p>Memuat riwayat…</p> : isError ? <p role="alert">Gagal memuat riwayat.</p> : <div className="inv-timeline">
      {(data?.events || []).map((event: any) => <div className="inv-event" key={event.id}><div className="inv-dot" /><div className="inv-event-body">
        <div className="inv-event-head"><strong>{event.komponen}</strong><span className="badge-active">{event.jenis}</span></div>
        <div className="muted">{new Date(event.event_date).toLocaleDateString("id-ID")}</div>
        <p>{event.old_detail || "—"} → {event.new_detail || "—"}</p>
        {event.catatan && <p>{event.catatan}</p>}
      </div></div>)}
      {!data?.events?.length && <p className="muted">Belum ada riwayat penggantian komponen.</p>}
    </div>}
  </section>;
}
