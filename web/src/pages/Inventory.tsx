import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Package, Plus, Search } from "lucide-react";

export interface DiskSpec { name?: string; tipe?: string; total_gb?: number; }

export function healthBadge(disks: DiskSpec[] | null) {
  if (!disks || disks.length === 0) return { text: "Belum ada data", cls: "badge-done" };
  return { text: disks.map(d => `${d.tipe || "disk"} ${d.total_gb ?? "?"}GB`).join(" · "), cls: "badge-active" };
}

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });

  const { data: items, isLoading } = useQuery({
    queryKey: ["inventories", q],
    queryFn: async () => {
      const res = await api.get("/inventories", { params: q ? { q } : {} });
      return res.data as Array<any>;
    },
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.get("/devices");
      return res.data as Array<any>;
    },
  });

  const create = useMutation({
    mutationFn: async (body: any) => {
      const res = await api.post("/inventories", body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      setShowForm(false);
      setForm({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });
    },
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inventaris</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Tambah Aset
        </button>
      </div>

      {showForm && (
        <div className="panel agent-form">
          <div className="agent-form-row">
            <input
              placeholder="No. Inventaris (mis. INV-2026-0001)"
              value={form.no_inventaris}
              onChange={e => setForm({ ...form, no_inventaris: e.target.value })}
            />
            <select value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })}>
              <option value="">- Link device (opsional) -</option>
              {(devices || []).map((d: any) => (
                <option key={d.device_id} value={d.device_id}>{d.device_name || d.device_id}</option>
              ))}
            </select>
          </div>
          <div className="agent-form-row">
            <input placeholder="Lokasi (mis. Laboratorium 2-A)" value={form.lokasi}
              onChange={e => setForm({ ...form, lokasi: e.target.value })} />
            <input placeholder="Catatan" value={form.catatan}
              onChange={e => setForm({ ...form, catatan: e.target.value })} />
            <button className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate(form)}>
              Simpan
            </button>
          </div>
          {create.isError && <span className="badge-off">No inventaris sudah dipakai</span>}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Memuat...</div>
      ) : (
        <div className="panel">
          <div className="search-box" style={{ marginBottom: "0.75rem" }}>
            <Search size={15} />
            <input placeholder="Cari nomor, hostname, lokasi..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="inv-list">{
            (() => {
              // group per lokasi; dlm grup sort by no_inventaris; grup lokasi kosong dibawah
              const byLokasi = new Map<string, any[]>();
              for (const it of items || []) {
                const key = (it.lokasi || "").trim() || "";
                if (!byLokasi.has(key)) byLokasi.set(key, []);
                byLokasi.get(key)!.push(it);
              }
              for (const arr of byLokasi.values()) arr.sort((a: any, b: any) => String(a.no_inventaris).localeCompare(String(b.no_inventaris)));
              const keys = [...byLokasi.keys()].sort((a, b) => {
                if (a === "") return 1; if (b === "") return -1;
                return a.localeCompare(b, "id");
              });
              if (byLokasi.size === 0) return <div className="empty">Belum ada aset inventaris.</div>;
              return keys.map((lok) => (
                <div key={lok || "__nolokasi"}>
                  <h3 className="inv-group-title" style={{ margin: "0.75rem 0 0.35rem", fontSize: "0.9rem" }}>
                    <Package size={13} style={{ verticalAlign: "-2px" }} /> {lok || "Tanpa lokasi"} ({byLokasi.get(lok)!.length})
                  </h3>
                  {byLokasi.get(lok)!.map((it: any) => {
                  const h = healthBadge(it.disks);
                  return (
                    <button key={it.id} className="ticket-row" onClick={() => navigate(`/inventories/${it.id}`)}>
                      <span className="t-num"><Package size={14} /> {it.no_inventaris}</span>
                      <span className="t-title">{it.hostname || it.lokasi || "-"}</span>
                      <span className="t-status badge-active">{it.cpu_model || "-"}</span>
                      <span className="t-prio">{h.text}</span>
                      <span className="t-date">
                        {it.device_id ? `${it.ticket_total ?? 0} tiket` : "tanpa device"}
                      </span>
                    </button>
                  );
                  })}
                </div>
              ));
            })()
          }
          </div>
        </div>
      )}
    </div>
  );
}
