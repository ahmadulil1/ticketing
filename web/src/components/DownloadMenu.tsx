import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Satu link aja: Panduan install (/install).
 *
 * Halaman panduan itu juga yang memuat tombol download sesuai OS, jadi
 * user cukup buka satu halaman untuk memasang aplikasi.
 */

const API = (import.meta.env.VITE_API_URL as string | undefined) || "";
const BASE = API.replace(/\/api\/?$/, "");

export default function DownloadMenu() {
  const [version, setVersion] = useState<string | null>(null);

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

  return (
    <Link
      className="icon-btn"
      to="/install"
      aria-label="Panduan install aplikasi"
      title={`Panduan install aplikasi desktop${version ? ` v${version}` : ""}`}
    >
      <BookOpen size={17} />
    </Link>
  );
}
