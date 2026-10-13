export interface DiskSpec {
  name?: string;
  tipe?: string;
  total_gb?: number;
  used_gb?: number;
  free_gb?: number;
  smart?: { health?: string; operational?: string } | null;
}

/**
 * Bar horizontal per disk: terpakai vs free + kesehatan (SMART bila ada).
 * ponytail: kesehatan pakai SMART (Get-PhysicalDisk) bila ada; fallback ke % pemakaian.
 */
function healthState(d: DiskSpec): { label: string; cls: string } {
  const smart = typeof d.smart === "string" ? d.smart : d.smart?.health;
  if (smart) {
    const s = smart.toLowerCase();
    if (s.includes("healthy") || s.includes("ok")) return { label: "Sehat", cls: "badge-done" };
    if (s.includes("degraded") || s.includes("warning")) return { label: "Waspada", cls: "badge-warn" };
    if (s.length > 0) return { label: "Kritis", cls: "badge-off" };
  }
  const total = d.total_gb ?? 0;
  const used = d.used_gb ?? 0;
  if (!total) return { label: "Belum ada data", cls: "badge-off" };
  const pct = (used / total) * 100;
  if (pct >= 90) return { label: "Kritis", cls: "badge-off" };
  if (pct >= 80) return { label: "Waspada", cls: "badge-warn" };
  return { label: "Sehat", cls: "badge-done" };
}

export default function DiskBars({ disks }: { disks: DiskSpec[] | null | undefined }) {
  if (!disks || disks.length === 0) {
    return <div className="muted">Belum ada data disk</div>;
  }
  return (
    <div className="diskbars">
      {disks.map((d, i) => {
        const total = d.total_gb ?? 0;
        const used = d.used_gb ?? 0;
        const free = d.free_gb ?? Math.max(0, total - used);
        const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        const h = healthState(d);
        const warn = h.cls === "badge-warn";
        const crit = h.cls === "badge-off" && h.label !== "Belum ada data";
        return (
          <div className="diskbar-row" key={i}>
            <div className="diskbar-label">
              <span className="diskbar-name">
                {(d.tipe || "disk").toUpperCase()} {d.name}
              </span>
              <span className={"badge " + h.cls}>{h.label}</span>
            </div>
            <div className="diskbar-track">
              <div
                className={"diskbar-fill" + (crit ? " crit" : warn ? " warn" : "")}
                style={{ width: pct + "%" }}
              />
            </div>
            <div className="diskbar-nums">
              <span>{used} GB terpakai</span>
              <span>{free} GB free</span>
              <span>{pct}%</span>
              <span>Total {total} GB</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
