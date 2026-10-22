import { useEffect, useState } from "react";
import {
  Download,
  Monitor,
  Apple,
  ShieldAlert,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";

/**
 * Panduan install aplikasi desktop Ticketing.
 *
 * Route publik (tanpa login) supaya link-nya bisa dibagikan ke user.
 * Path: /install
 */

const API = (import.meta.env.VITE_API_URL as string | undefined) || "";
const BASE = API.replace(/\/api\/?$/, "");

type OS = "windows" | "macos" | "linux";

function detectOS(): OS {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("mac") || p.includes("iphone") || p.includes("ipad")) return "macos";
  return "linux";
}

interface Step {
  title: string;
  body: React.ReactNode;
  warn?: boolean;
}

const WINDOWS_STEPS: Step[] = [
  {
    title: "Unduh installer",
    body: (
      <>
        Klik tombol <strong>Download Windows (.exe)</strong> di bawah. Ukurannya
        sekitar 3,6 MB. Installer otomatis (NSIS), tak perlu pilih folder.
      </>
    ),
  },
  {
    title: "Kalau muncul “Windows protecting your PC”",
    body: (
      <>
        Installer belum punya sertifikat berbayar, jadi Windows SmartScreen
        nagih. Klik <strong>More info</strong> → <strong>Run anyway</strong>.
        Pilih “Don’t run” tidak akan memasang apa-apa.
      </>
    ),
    warn: true,
  },
  {
    title: "Tunggu instalasi selesai",
    body: (
      <>
        Sekitar 10–30 detik. Tak ada wizard yang perlu diisi, semuanya
        otomatis. Setelah selesai, ikon <strong>Ticketing</strong> muncul di
        system tray (kanan bawah, di dekat jam).
      </>
    ),
  },
  {
    title: "Buka aplikasi",
    body: (
      <>
        Kalau pet belum muncul, klik kanan ikon Ticketing di system tray →
        <strong> Buka</strong>. Aplikasi berjalan di background (system tray),
        jadi tak ada jendela besar yang memenuhi layar.
      </>
    ),
  },
  {
    title: "Masuk dengan akun dari admin",
    body: (
      <>
        Klik ikon di system tray untuk membuka panel, lalu masuk memakai akun
        yang diberikan admin. Kalau sudah pernah masuk, otomatis saja.
      </>
    ),
  },
  {
    title: "Selesai — tapi cek autostart",
    body: (
      <>
        Aplikasi didaftarkan autostart saat pertama kali jalan, jadi otomatis
        hidup lagi tiap PC dinyalakan. Kalau PC pernah menolak (kebijakan
        kantor), cek log di{" "}
        <code>%LOCALAPPDATA%\com.ticketing.desktop\logs\ticketing-desktop.log</code>.
      </>
    ),
  },
];

const MACOS_STEPS: Step[] = [
  {
    title: "Unduh installer",
    body: (
      <>
        Klik <strong>Download macOS (.dmg)</strong> di bawah, lalu buka file
       -nya (Finder akan membuka disk image).
      </>
    ),
  },
  {
    title: "Seret ke Applications",
    body: (
      <>
        Tarik ikon <strong>Ticketing</strong> ke folder{" "}
        <strong>Applications</strong>, lalu eject disk image-nya.
      </>
    ),
  },
  {
    title: "Buka dari Applications",
    body: (
      <>
        Klik dua kali <strong>Ticketing</strong> di Applications. Kalau muncul
        “tak bisa dibuka karena developer tidak diverifikasi”, klik kanan →
        <strong> Open</strong> → <strong> Open</strong> lagi.
      </>
    ),
    warn: true,
  },
  {
    title: "Izin sistem (kalau mau remote dari admin)",
    body: (
      <>
        Remote desktop di macOS butuh dua izin:{" "}
        <strong>Screen Recording</strong> (untuk lihat layar) dan{" "}
        <strong>Accessibility</strong> (untuk gerakkan mouse & keyboard).
        Buka <em>System Settings → Privacy &amp; Security</em>, tambahkan
        Ticketing di dua daftar itu, lalu restart aplikasi.
      </>
    ),
  },
  {
    title: "Masuk dengan akun dari admin",
    body: (
      <>
        Klik ikon di system tray untuk membuka panel, lalu masuk memakai akun
        yang diberikan admin.
      </>
    ),
  },
];

export default function InstallGuide() {
  const [os, setOs] = useState<OS>("windows");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Linux tak punya binary -> tampilkan langkah Windows sebagai default.
    const d = detectOS();
    setOs(d === "macos" ? "macos" : "windows");
  }, []);

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

  const steps = os === "macos" ? MACOS_STEPS : WINDOWS_STEPS;

  return (
    <div className="install-page">
      <div className="install-head">
        <h1>Install Ticketing Desktop</h1>
        {version && <span className="install-ver">Versi {version}</span>}
      </div>

      <p className="install-lead">
        Aplikasi Ticketing untuk PC. Setelah terpasang, aplikasi berjalan di
        system tray dan otomatis hidup saat PC dinyalakan.
      </p>

      <div className="install-os">
        <button
          className={"install-os-btn" + (os === "windows" ? " active" : "")}
          onClick={() => setOs("windows")}
        >
          <Monitor size={16} /> Windows
        </button>
        <button
          className={"install-os-btn" + (os === "macos" ? " active" : "")}
          onClick={() => setOs("macos")}
        >
          <Apple size={16} /> macOS
        </button>
      </div>

      <div className="install-dl">
        {os === "macos" ? (
          <a className="btn btn-primary btn-lg" href={`${BASE}/downloads/Ticketing.dmg`}>
            <Download size={18} /> Download macOS (.dmg)
          </a>
        ) : (
          <a className="btn btn-primary btn-lg" href={`${BASE}/download`}>
            <Download size={18} /> Download Windows (.exe)
          </a>
        )}
        <span className="muted install-dl-hint">
          Link ini selalu menunjuk installer terbaru.
        </span>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Langkah install {os === "macos" ? "macOS" : "Windows"}</h2>
        </div>
        <ol className="install-steps">
          {steps.map((s, i) => (
            <li key={i} className={s.warn ? "install-step warn" : "install-step"}>
              <span className="install-step-num">{i + 1}</span>
              <div className="install-step-body">
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
              {s.warn && (
                <span className="install-step-icon" title="Perhatian">
                  <TriangleAlert size={16} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Catatan penting</h2>
        </div>
        <ul className="install-notes">
          <li>
            <ShieldAlert size={15} />
            <span>
              Installer belum ditandatangani sertifikat berbayar, jadi
              Windows SmartScreen akan menampilkan peringatan sekali. Klik{" "}
              <strong>More info → Run anyway</strong>.
            </span>
          </li>
          <li>
            <CheckCircle2 size={15} />
            <span>
              Di Windows <strong>Tak ada</strong> izin Accessibility atau
              Screen Recording. Remote desktop Windows jalan otomatis begitu
              kamu klik <strong>Izinkan</strong> di aplikasi.
            </span>
          </li>
          <li>
            <TriangleAlert size={15} />
            <span>
              Remote desktop hanya bisa dipakai kalau ada orang di PC itu yang
              menekan <strong>Izinkan</strong> saat diminta admin. Ini
              Identifier untuk keamanan.
            </span>
          </li>
          <li>
            <CheckCircle2 size={15} />
            <span>
              Kalau ada versi baru, aplikasi akan نفسه menawarkan pembaruan.
              Tinggal klik dan tunggu.
            </span>
          </li>
        </ul>
      </div>

      <div className="install-help">
        <strong>Masalah saat install?</strong> Minta admin cek:
        <code>%LOCALAPPDATA%\com.ticketing.desktop\logs\ticketing-desktop.log</code>
        <span className="muted">(Windows) atau</span>
        <code>~/Library/Logs/com.ticketing.desktop/ticketing-desktop.log</code>
        <span className="muted">(macOS)</span>
      </div>
    </div>
  );
}
