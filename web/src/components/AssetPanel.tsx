import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Pencil, Package, Monitor, Save } from "lucide-react";
import api from "../lib/api";
import DiskBars from "./DiskBars";

/**
 * Panel detail aset: dibuka dari kartu di halaman Perangkat.
 *
 * Sengaja tanpa perpindahan route supaya tidak ada halaman kosong saat
 * klik "Aset" (perpindahan client-side ke /inventories/:id sempat gagal
 * mencocokkan route).
 */
export default function AssetPanel({
  inventoryId,
  deviceId,
  onClose,
  onSaved,
}: {
  inventoryId: string | null;
  deviceId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ no_inventaris: "", lokasi: "", catatan: "" });

  const asset = useQuery({
    queryKey: ["asset", inventoryId],
    queryFn: async () => (await api.get(`/inventories/${inventoryId}`)).data,
    enabled: !!inventoryId,
  });
  const device = useQuery({
    queryKey: ["asset-device", deviceId],
    queryFn: async () => (await api.get(`/devices/${deviceId}`)).data,
    enabled: !!deviceId,
  });
  const groups = useQuery({
    queryKey: ["device-groups"],
    queryFn: async () => (await api.get("/device-groups")).data,
  });

  useEffect(() => {
    if (asset.data) {
      setForm({
        no_inventaris: asset.data.no_inventaris || "",
        lokasi: asset.data.lokasi || "",
        catatan: asset.data.catatan || "",
      });
    }
  }, [asset.data?.id]);

  const save = useMutation({
    mutationFn: async () => (await api.patch(`/inventories/${inventoryId}`, form)).data,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["asset", inventoryId] });
      client.invalidateQueries({ queryKey: ["inventories"] });
      setEditing(false);
      onSaved();
    },
  });

  const spec = device.data?.spec;
  const tickets = device.data?.tickets || [];
  const disks = spec?.disks || asset.data?.disks || [];

  return (
    <aside className="asset-panel" aria-label="Detail aset">
      <header className="asset-panel-head">
        <strong>
          <Package size={15} /> {asset.data?.no_inventaris || "Detail aset"}
        </strong>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup panel">
          <X size={16} />
        </button>
      </header>

      <div className="asset-panel-body">
        {!inventoryId && !deviceId && <p className="muted">Pilih aset atau perangkat untuk melihat detail.</p>}

        {inventoryId && asset.isLoading && <p className="muted">Memuat data aset…</p>}

        {inventoryId && asset.isError && (
          <p role="alert" className="muted">Data aset tidak bisa dimuat. Muat ulang halaman.</p>
        )}

        {inventoryId && asset.data && (
          <section className="asset-section">
            <div className="asset-section-head">
              <h3>Ringkasan</h3>
              <button className="btn btn-tinted btn-sm btn-action" onClick={() => setEditing(v => !v)}>
                <Pencil size={14} /> Edit
              </button>
            </div>
            {editing ? (
              <form
                className="asset-form"
                onSubmit={e => {
                  e.preventDefault();
                  save.mutate();
                }}
              >
                <label>
                  No. inventaris
                  <input
                    required
                    maxLength={100}
                    value={form.no_inventaris}
                    onChange={e => setForm({ ...form, no_inventaris: e.target.value })}
                  />
                  <small className="muted">Nomor baru harus 9 digit angka. Nomor lama dibiarkan apa adanya.</small>
                </label>
                <label>
                  Group / lokasi
                  <select
                    value={form.lokasi}
                    onChange={e => setForm({ ...form, lokasi: e.target.value })}
                  >
                    <option value="">Belum dikelompokkan</option>
                    {[...new Set([...(groups.data || []).map((g: any) => g.nama), asset.data.lokasi].filter(Boolean))].map(
                      (name: any) => (
                        <option key={name}>{name}</option>
                      )
                    )}
                  </select>
                </label>
                <label>
                  Catatan
                  <input
                    value={form.catatan}
                    onChange={e => setForm({ ...form, catatan: e.target.value })}
                  />
                </label>
                {save.isError && (
                  <p role="alert">{(save.error as any)?.response?.data?.error || "Gagal menyimpan aset"}</p>
                )}
                <div className="asset-form-actions">
                  <button className="btn btn-primary" disabled={save.isPending}>
                    <Save size={14} /> Simpan
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <dl className="asset-facts">
                <div>
                  <dt>No. inventaris</dt>
                  <dd>{asset.data.no_inventaris || "—"}</dd>
                </div>
                <div>
                  <dt>Group / lokasi</dt>
                  <dd>{asset.data.lokasi || "Belum dikelompokkan"}</dd>
                </div>
                <div>
                  <dt>Catatan</dt>
                  <dd>{asset.data.catatan || "—"}</dd>
                </div>
                <div>
                  <dt>Terdaftar</dt>
                  <dd>{asset.data.created_at ? new Date(asset.data.created_at).toLocaleDateString("id-ID") : "—"}</dd>
                </div>
              </dl>
            )}
          </section>
        )}

        {deviceId && (
          <section className="asset-section">
            <div className="asset-section-head">
              <h3>Perangkat</h3>
              <Link className="btn btn-quiet btn-sm btn-action" to={`/devices/${deviceId}`}>
                <Monitor size={14} /> Halaman device
              </Link>
            </div>
            {device.isError ? (
              <p className="muted">Data perangkat tidak bisa dimuat.</p>
            ) : device.isLoading ? (
              <p className="muted">Memuat…</p>
            ) : (
              <>
                <dl className="asset-facts">
                  <div>
                    <dt>Nama</dt>
                    <dd>{device.data?.device_name || device.data?.spec?.hostname || "—"}</dd>
                  </div>
                  <div>
                    <dt>OS</dt>
                    <dd>{spec?.os_name || "—"}</dd>
                  </div>
                  <div>
                    <dt>CPU</dt>
                    <dd>{spec?.cpu_model || "—"}</dd>
                  </div>
                  <div>
                    <dt>RAM</dt>
                    <dd>{spec?.ram_gb ? `${spec.ram_gb} GB` : "—"}</dd>
                  </div>
                  <div>
                    <dt>GPU</dt>
                    <dd>{spec?.gpu_model || "—"}</dd>
                  </div>
                  <div>
                    <dt>Tiket aktif</dt>
                    <dd>{device.data?.active_count ?? 0}</dd>
                  </div>
                </dl>
                {disks.length > 0 && (
                  <>
                    <h4 className="asset-subhead">Penyimpanan</h4>
                    <DiskBars disks={disks} />
                  </>
                )}
                <h4 className="asset-subhead">Tiket perangkat</h4>
                {tickets.length === 0 ? (
                  <p className="muted">Belum ada tiket untuk perangkat ini.</p>
                ) : (
                  <ul className="asset-tickets">
                    {tickets.slice(0, 6).map((t: any) => (
                      <li key={t.id}>
                        <Link to={`/ticket/${t.id}`} state={{ from: "/devices" }}>{t.ticket_number}</Link>
                        <span className="muted"> {t.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
