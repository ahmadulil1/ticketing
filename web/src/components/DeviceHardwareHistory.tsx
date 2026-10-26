import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

interface HardwareEvent {
  id: string;
  event_date: string;
  jenis: string;
  komponen: string;
  old_detail?: string;
  new_detail?: string;
  catatan?: string;
  no_inventaris: string;
}

export default function DeviceHardwareHistory({ deviceId, events }: { deviceId?: string; events: HardwareEvent[] }) {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const empty = { event_date: new Date().toISOString().slice(0, 10), jenis: "ganti", komponen: "", old_detail: "", new_detail: "", catatan: "" };
  const [form, setForm] = useState(empty);
  const save = useMutation({
    mutationFn: () => api.post(`/devices/${encodeURIComponent(deviceId || "")}/hardware-events`, form),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["device", deviceId] });
      client.invalidateQueries({ queryKey: ["inventory"] });
      setAdding(false);
      setForm(empty);
    },
  });
  return <section className="panel">
    <div className="panel-head"><h2>Riwayat Penggantian Komponen</h2><button className="btn btn-outline" onClick={() => setAdding(!adding)}>Tambah Riwayat</button></div>
    {adding && <form className="device-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <label>Tanggal<input required type="date" value={form.event_date} onChange={event => setForm({ ...form, event_date: event.target.value })} /></label>
      <label>Jenis<select value={form.jenis} onChange={event => setForm({ ...form, jenis: event.target.value })}><option value="ganti">Ganti</option><option value="upgrade">Upgrade</option><option value="perbaikan">Perbaikan</option></select></label>
      {(["komponen", "old_detail", "new_detail", "catatan"] as const).map((key, index) => <label key={key}>{["Komponen", "Komponen lama", "Komponen baru", "Catatan"][index]}<input required={key === "komponen"} maxLength={key === "komponen" ? 100 : 2000} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      {save.isError && <p role="alert">{(save.error as any)?.response?.data?.error || "Gagal menyimpan riwayat"}</p>}
      <button className="btn btn-primary" disabled={save.isPending}>Simpan</button>
    </form>}
    <div className="inv-timeline">
      {events.map(event => <div className="inv-event" key={event.id}><div className="inv-dot" /><div className="inv-event-body">
        <div className="inv-event-head"><strong>{event.komponen}</strong><span className="badge-active">{event.jenis}</span></div>
        <p className="muted">{new Date(event.event_date).toLocaleDateString("id-ID")} · {event.no_inventaris}</p>
        <p>{event.old_detail || "—"} → {event.new_detail || "—"}</p>
        {event.catatan && <p>{event.catatan}</p>}
      </div></div>)}
      {!events.length && <p className="muted">Belum ada riwayat penggantian komponen.</p>}
    </div>
  </section>;
}
