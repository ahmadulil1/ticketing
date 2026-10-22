import { useEffect, useRef, useState } from "react";
import { Download, Monitor, Apple, ChevronDown, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Menu download aplikasi desktop.
 *
 * - Versi terbaru dibaca dari manifest updater (/downloads/latest.json),
 *   jadi label selalu sama dengan yang bakalan di-install user.
 * - Link stable: /download (Windows, redirect ke installer terbaru),
 *   /downloads/Ticketing.dmg (macOS), GitHub Release (Linux/sumber kode).
 */

const API = (import.meta.env.VITE_API_URL as string | undefined) || "";
const BASE = API.replace(/\/api\/?$/, "");

function detectPlatform(): "windows" | "macos" | "linux" {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("mac") || p.includes("iphone") || p.includes("ipad")) return "macos";
  return "linux";
}

export default function DownloadMenu() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const plat = detectPlatform();

  // Ambil versi terbaru dari manifest updater (publik, tanpa auth)
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/downloads/latest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.version) setVersion(j.version);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tutup saat klik di luar
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Satu link: sesuai OS. Linux tak punya binary, arahkan ke installer Windows
  // (menu di bawah tetap menampilkan opsi macOS).
  const primary =
    plat === "macos"
      ? { label: "macOS (.dmg)", href: `${BASE}/downloads/Ticketing.dmg` }
      : { label: "Windows (.exe)", href: `${BASE}/download` };

  return (
    <div className="dl-menu" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Download aplikasi"
        title={`Download aplikasi desktop${version ? ` v${version}` : ""}`}
        aria-expanded={open}
      >
        <Download size={17} />
      </button>
      {open && (
        <div className="dl-pop" role="menu">
          <div className="dl-pop-head">
            <strong>Desktop App</strong>
            {version && <span className="dl-ver">v{version}</span>}
          </div>
          <a
            className="dl-item"
            href={primary.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            <Monitor size={15} />
            <span>{primary.label}</span>
            {plat !== "linux" && <span className="dl-recommended">untuk PC ini</span>}
          </a>
          {plat !== "windows" && (
            <a
              className="dl-item"
              href={`${BASE}/download`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <Monitor size={15} />
              <span>Windows (.exe)</span>
            </a>
          )}
          {plat !== "macos" && (
            <a
              className="dl-item"
              href={`${BASE}/downloads/Ticketing.dmg`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <Apple size={15} />
              <span>macOS (.dmg)</span>
            </a>
          )}
          <Link
            className="dl-item"
            to="/install"
            onClick={() => setOpen(false)}
          >
            <BookOpen size={15} />
            <span>Panduan install</span>
          </Link>
          <div className="dl-pop-foot">
            <ChevronDown size={12} />
            <span>Versi {version || "?"} — cek juga halaman rilis</span>
          </div>
        </div>
      )}
    </div>
  );
}
