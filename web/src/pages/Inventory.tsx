import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Package, Plus, Search, Settings, Trash2, X } from "lucide-react";

export interface DiskSpec { name?: string; tipe?: string; total_gb?: number; used_gb?: number; free_gb?: number; }

export function healthBadge(disks: DiskSpec[] | null) {
  if (!disks || disks.length === 0) return { text: "Belum ada data", cls: "badge-done" };
  const total = disks.reduce((s, d) => s + (d.total_gb ?? 0), 0);
  const label = total >= 1024 ? `${(total / 1024).toFixed(1)} TB` : `${total} GB`;
  return { text: `${disks.length} disk · ${label}`, cls: "badge-active" };
}

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [form, setForm] = useState({ no_inventaris: "", device_id: "", lokasi: "", catatan: "" });

  const { data: groups } = useQuery({
    queryKey: ["device-groups"],
    queryFn: async () => {
      const res = await api.get("/device-groups");
      return res.data as Array<{ id: string; nama: string }>;
    },
  });

  const createGroup = useMutation({
    mutationFn: async (nama: string) => {
      const res = await api.post("/device-groups", { nama });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-groups"] });
      setNewGroup("");
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/device-groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-groups"] });
    },
  });

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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline" onClick={() => setShowGroups(v => !v)}>
            <Settings size={16} /> Kelola Group
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Tambah Aset
          </button>
        </div>
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
            <select value={form.lokasi} onChange={e => setForm({ ...form, lokasi: e.target.value })}>
              <option value="">- Pilih lokasi (opsional) -</option>
              {(groups || []).map((g: any) => (
                <option key={g.id} value={g.nama}>{g.nama}</option>
              ))}
            </select>
            <input placeholder="Catatan" value={form.catatan}
              onChange={e => setForm({ ...form, catatan: e.target.value })} />
            <button className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate(form)}>
              Simpan
            </button>
          </div>
          {create.isError && <span className="badge-off">No inventaris sudah dipakai</span>}
        </div>
      )}

      {showGroups && (
        <div className="modal-backdrop" onClick={() => setShowGroups(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2><Package size={15} /> Kelola Group / Lokasi</h2>
              <button className="icon-btn" title="Tutup" onClick={() => setShowGroups(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="modal-body">
              <div className="agent-form-row">
                <input
                  placeholder="Nama group/lokasi (mis. Laboratorium 2-A)"
                  value={newGroup}
                  onChange={e => setNewGroup(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newGroup.trim()) createGroup.mutate(newGroup.trim());
                  }}
                  autoFocus
                />
                <button
                  className="btn btn-primary"
                  disabled={!newGroup.trim() || createGroup.isPending}
                  onClick={() => createGroup.mutate(newGroup.trim())}
                >
                  <Plus size={15} /> Tambah
                </button>
              </div>
              {createGroup.isError && (
                <span className="badge-off">Nama group sudah dipakai</span>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {(groups || []).length === 0 && (
                  <div className="group-empty">Belum ada group. Tambahkan lewat form di atas.</div>
                )}
                {(groups || []).map((g: any) => {
                  const dipakai = (items || []).filter((it: any) => it.lokasi === g.nama).length;
                  return (
                    <div key={g.id} className="group-row">
                      <span className="grow">
                        <Package size={13} style={{ flexShrink: 0, color: "var(--text-2)" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nama}</span>
                        {dipakai > 0 && <span className="badge badge-active" style={{ fontSize: "0.6875rem" }}>{dipakai} aset</span>}
                      </span>
                      <button
                        className="icon-btn"
                        style={{ width: 30, height: 30, flexShrink: 0 }}
                        title="Hapus group"
                        onClick={() => {
                          if (confirm(`Hapus group "${g.nama}"?${dipakai > 0 ? ` ${dipakai} aset akan kehilangan label lokasinya (data aset tidak terhapus).` : ""}`)) {
                            deleteGroup.mutate(g.id);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
                  <h3 className="inv-group-title">
                    <Package size={13} className="pkg" /> {lok || "Tanpa lokasi"} <span className="cnt">{byLokasi.get(lok)!.length}</span>
                  </h3>
                  {byLokasi.get(lok)!.map((it: any) => {
                  const h = healthBadge(it.disks);
                  const cpu = it.cpu_model;
                  return (
                    <button key={it.id} className="ticket-row" onClick={() => navigate(`/inventories/${it.id}`)}>
                      <span className="t-num"><Package size={14} style={{ flexShrink: 0 }} /> {it.no_inventaris}</span>
                      <span className="t-title">{it.hostname || (it.device_id ? "Menunggu report device" : "Tanpa device")}</span>
                      <span className={`t-status ${cpu ? "badge-active" : "badge-done"}`}>{cpu || "CPU n/a"}</span>
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
