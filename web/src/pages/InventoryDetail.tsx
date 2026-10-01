import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../lib/api";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2, Plus } from "lucide-react";

const JENIS_LABEL: Record<string, string> = { ganti: "Ganti", upgrade: "Upgrade", perbaikan: "Perbaikan" };

function SpecCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="stat-card">
      <span className="count" style={{ fontSize: "0.8125rem", wordBreak: "break-word" }}>{value ?? "-"}</span>
      <span className="label">{label}</span>
    </div>
  );
}

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ev, setEv] = useState({ event_date: new Date().toISOString().slice(0, 10), jenis: "ganti", komponen: "", old_detail: "", new_detail: "", catatan: "" });
  const [showEv, setShowEv] = useState(false);

  const { data: inv, isLoading, error } = useQuery({
    queryKey: ["inventory", id],
    queryFn: async () => {
      const res = await api.get(`/inventories/${id}`);
      return res.data;
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["device-groups"],
    queryFn: async () => {
      const res = await api.get("/device-groups");
      return res.data as Array<{ id: string; nama: string }>;
    },
  });

  const updateLokasi = useMutation({
    mutationFn: async (lokasi: string) => {
      await api.patch(`/inventories/${id}`, { lokasi });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", id] }),
  });

  const addEvent = useMutation({
    mutationFn: async (body: any) => (await api.post(`/inventories/${id}/events`, body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", id] });
      setEv({ ...ev, komponen: "", old_detail: "", new_detail: "", catatan: "" });
      setShowEv(false);
    },
  });

  const delEvent = useMutation({
    mutationFn: async (eventId: string) => api.delete(`/inventories/events/${eventId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", id] }),
  });

  if (isLoading) return <div className="loading">Memuat...</div>;
  if (error || !inv) return <div className="loading">Inventaris tidak ditemukan</div>;

  const disks: Array<any> = inv.disks || [];

  return (
    <div className="page">
      <div className="page-head">
        <button onClick={() => navigate("/inventories")} className="btn btn-outline">
          <ArrowLeft size={16} /> Kembali
        </button>
        <h1>{inv.no_inventaris}</h1>
        {inv.device_id && (
          <Link to={`/devices/${inv.device_id}`} className="btn btn-outline">
            Lihat Tiket
          </Link>
        )}
      </div>

      <div className="stat-cards">
        <SpecCard label="CPU" value={inv.cpu_model} />
        <SpecCard label="RAM" value={inv.ram_gb ? `${inv.ram_gb} GB` : null} />
        <SpecCard label="GPU" value={inv.gpu_model} />
        <SpecCard label="OS" value={inv.os_name} />
      </div>

      <div className="stat-cards">
        <SpecCard label="Hostname" value={inv.hostname} />
        <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <select
            value={inv.lokasi || ""}
            disabled={updateLokasi.isPending}
            onChange={e => updateLokasi.mutate(e.target.value)}
            style={{ fontSize: "0.8125rem" }}
            title="Ubah lokasi aset"
          >
            <option value="">- Tanpa lokasi -</option>
            {(groups || []).map((g: any) => (
              <option key={g.id} value={g.nama}>{g.nama}</option>
            ))}
            {inv.lokasi && !(groups || []).some((g: any) => g.nama === inv.lokasi) && (
              <option value={inv.lokasi}>{inv.lokasi} (group sudah dihapus)</option>
            )}
          </select>
          <span className="label">Lokasi {updateLokasi.isPending ? "(menyimpan…)" : "(klik untuk ubah)"}</span>
        </div>
        <SpecCard label="Device" value={inv.device_id ? inv.device_id.slice(0, 8) + "…" : "tidak di-link"} />
        <SpecCard label="Spec terakhir direport" value={inv.reported_at ? new Date(inv.reported_at).toLocaleDateString("id-ID") : "-"} />
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Disk</h2></div>
        <div className="inv-list">
          {disks.length === 0 && <span className="muted">Belum ada data disk (menunggu report app).</span>}
          {disks.map((d: any, i: number) => (
            <div key={i} className="ticket-row" style={{ fontSize: "0.8125rem" }}>
              <span>{d.name ?? "-"}</span>
              <span className="badge-active">{(d.tipe || "disk").toUpperCase()}</span>
              <span>{d.total_gb != null ? `${d.total_gb} GB` : "-"}</span>
              <span className="muted">
                {d.used_gb != null && d.total_gb
                  ? `${d.used_gb} GB terpakai · ${d.free_gb ?? d.total_gb - d.used_gb} GB bebas`
                  : d.total_gb != null
                  ? "used/free belum tersedia (update app desktop)"
                  : "-"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Riwayat Hardware</h2>
          <button className="btn btn-outline" onClick={() => setShowEv(v => !v)}>
            <Plus size={15} /> Tambah Riwayat
          </button>
        </div>

        {showEv && (
          <div className="panel agent-form" style={{ marginBottom: "0.75rem", boxShadow: "none" }}>
            <div className="agent-form-row">
              <input type="date" value={ev.event_date} onChange={e => setEv({ ...ev, event_date: e.target.value })} />
              <select value={ev.jenis} onChange={e => setEv({ ...ev, jenis: e.target.value })}>
                <option value="ganti">Ganti</option>
                <option value="upgrade">Upgrade</option>
                <option value="perbaikan">Perbaikan</option>
              </select>
              <input placeholder="Komponen (mis. SSD, RAM 8GB)" value={ev.komponen}
                onChange={e => setEv({ ...ev, komponen: e.target.value })} />
            </div>
            <div className="agent-form-row">
              <input placeholder="Komponen lama" value={ev.old_detail} onChange={e => setEv({ ...ev, old_detail: e.target.value })} />
              <input placeholder="Komponen baru" value={ev.new_detail} onChange={e => setEv({ ...ev, new_detail: e.target.value })} />
            </div>
            <div className="agent-form-row">
              <input placeholder="Catatan" value={ev.catatan} onChange={e => setEv({ ...ev, catatan: e.target.value })} />
              <button className="btn btn-primary" disabled={addEvent.isPending} onClick={() => addEvent.mutate(ev)}>
                Simpan
              </button>
            </div>
          </div>
        )}

        <div className="inv-timeline">
          {(inv.events || []).map((e: any) => (
            <div key={e.id} className="inv-event">
              <div className="inv-dot" />
              <div className="inv-event-body">
                <div className="inv-event-head">
                  <strong>{e.komponen}</strong>
                  <span className="badge-active">{JENIS_LABEL[e.jenis] || e.jenis}</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>{new Date(e.event_date).toLocaleDateString("id-ID")}</span>
                  <button className="icon-btn" title="Hapus" onClick={() => delEvent.mutate(e.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {(e.old_detail || e.new_detail) && (
                  <div className="inv-event-detail">
                    {e.old_detail && <span>{e.old_detail}</span>}
                    {e.old_detail && e.new_detail && <span style={{ opacity: 0.5 }}> → </span>}
                    {e.new_detail && <span><strong>{e.new_detail}</strong></span>}
                  </div>
                )}
                {e.catatan && <div className="inv-event-detail">{e.catatan}</div>}
                {e.created_by_name && <div className="inv-event-detail muted">oleh {e.created_by_name}</div>}
              </div>
            </div>
          ))}
          {(!inv.events || inv.events.length === 0) && <div className="empty">Belum ada riwayat hardware.</div>}
        </div>
      </div>
    </div>
  );
}
