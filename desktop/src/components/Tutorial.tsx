import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import petImg from "../assets/tutorial/pet.png";
import listImg from "../assets/tutorial/list.png";
import formImg from "../assets/tutorial/form.png";
import chatImg from "../assets/tutorial/chat.png";

export const TUTORIAL_KEY = "ticketing_tutorial_done";

export function tutorialSeen(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) === "1";
}

/** Tampilkan ulang tutorial dari menu akun (dispatch event yang didengar MiniWindow). */
export function replayTutorial(): void {
  window.dispatchEvent(new Event("tutorial:show"));
}

type Marker = { x: number; y: number; label: string };
type Step = {
  img: string;
  alt: string;
  title: string;
  markers: Marker[];
  tips: string[];
};

const STEPS: Step[] = [
  {
    img: petImg,
    alt: "Tampilan pet overlay dengan jam, tanggal, dan pemantauan komputer",
    title: "Pendamping di layar Anda",
    markers: [
      { x: 10, y: 50, label: "Pet — seret untuk pindah" },
      { x: 59, y: 42, label: "Jam & hari tanggal" },
      { x: 59, y: 65, label: "Tanggal" },
      { x: 59, y: 87, label: "Pemantauan CPU, RAM, SSD, internet" },
      { x: 19, y: 8, label: "Pesan belum dibaca" },
    ],
    tips: [
      "Pet selalu di atas layar: klik sekali untuk membuka aplikasi, tahan dan seret untuk memindah.",
      "Klik kanan pet untuk menu: buka Ticketing, sembunyikan pet, atau keluar aplikasi.",
    ],
  },
  {
    img: listImg,
    alt: "Daftar tiket dengan status dan tombol tambah",
    title: "Daftar tiket Anda",
    markers: [
      { x: 75, y: 6, label: "Tombol + buat tiket baru" },
      { x: 50, y: 26, label: "Ringkasan status tiket" },
      { x: 32, y: 45, label: "Cari & filter tiket" },
      { x: 91, y: 60, label: "Pesan belum dibaca" },
    ],
    tips: [
      "Semua tiket perangkat ini tampil di sini. Angka merah = jumlah pesan belum dibaca.",
      "Klik salah satu tiket untuk membuka percakapan dengan IT.",
    ],
  },
  {
    img: formImg,
    alt: "Form laporan tiket baru",
    title: "Buat tiket baru",
    markers: [
      { x: 49, y: 26, label: "Jelaskan masalahnya" },
      { x: 49, y: 57, label: "Pilih prioritas" },
      { x: 49, y: 75, label: "Lampirkan gambar" },
      { x: 72, y: 94, label: "Kirim laporan" },
    ],
    tips: [
      "Tuliskan detail masalah selengkap mungkin — ini membantu IT menyelesaikannya lebih cepat.",
      "Lampiran hanya gambar: bisa dari file, seret-jatuhkan, atau tempel (Ctrl+V).",
      "Tidak perlu memilih prioritas? ‘Sedang’ adalah default.",
    ],
  },
  {
    img: chatImg,
    alt: "Percakapan tiket dengan petugas IT",
    title: "Ngobrol langsung dengan IT",
    markers: [
      { x: 68, y: 6, label: "Nomor & status tiket" },
      { x: 14, y: 23, label: "Balasan dari IT" },
      { x: 44, y: 92, label: "Ketik balasan di sini" },
      { x: 92, y: 91, label: "Tombol kirim" },
    ],
    tips: [
      "Pesan baru tampil langsung tanpa perlu memuat ulang. Tanda ✓✓ berarti pesan sudah dibaca petugas.",
      "Tekan Enter untuk mengirim, Shift+Enter untuk baris baru.",
      "Tiket yang sudah selesai dapat dibuka kembali sampai pukul 17:00 di hari yang sama.",
    ],
  },
  {
    img: petImg,
    alt: "Pet overlay menunjukkan status remote desktop aktif",
    title: "Remote Desktop (Kontrol Jarak Jauh)",
    markers: [
      { x: 50, y: 50, label: "🔴 Bar merah: sedang di-remote oleh IT" },
      { x: 85, y: 50, label: "Tombol Hentikan untuk mengakhiri sesi" },
    ],
    tips: [
      "Petugas IT dapat meminta mengontrol komputer Anda untuk membantu memperbaiki masalah.",
      "Akan muncul popup permintaan — klik 'Izinkan' untuk setuju, atau 'Tolak' untuk menolak.",
      "Saat remote aktif, bar merah muncul di atas pet dengan nama petugas dan tombol 'Hentikan'.",
      "Anda tetap mengontrol komputer: bisa mencabut izin kapan saja via tombol Hentikan di pet.",
      "Sesi remote otomatis berakhir setelah 30 menit tanpa aktivitas.",
    ],
  },
];

interface Props {
  onClose: () => void;
}

export default function Tutorial({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" && !last) setStep(step + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
    };
    window.addEventListener("keydown", onKey);
    nextRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, last]);

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label={`Tutorial: ${s.title}`}>
      <div className="tutorial-card">
        <header className="tutorial-head">
          <span className="tutorial-step">
            {step + 1} / {STEPS.length}
          </span>
          <h2>{s.title}</h2>
          <button className="tutorial-skip" onClick={finish} aria-label="Lewati tutorial" title="Lewati (Esc)">
            <X size={16} />
          </button>
        </header>

        <div className="tutorial-img-scale">
          <div className="tutorial-img-frame">
            <img src={s.img} alt={s.alt} draggable={false} />
            {s.markers.map((m, i) => (
              <div
                key={i}
                className={`tutorial-marker${m.x > 60 ? " flip" : ""}`}
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
              >
                <span className="tutorial-dot">{i + 1}</span>
                <span className="tutorial-marker-label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <ul className="tutorial-tips">
          {s.tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>

        <footer className="tutorial-foot">
          <div className="tutorial-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? "active" : ""} />
            ))}
          </div>
          <div className="tutorial-nav">
            {step > 0 ? (
              <button className="tut-back" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} /> Kembali
              </button>
            ) : (
              <button className="tut-back" onClick={finish}>
                Lewati
              </button>
            )}
            {last ? (
              <button className="tut-next" ref={nextRef} onClick={finish}>
                <Check size={16} /> Mulai
              </button>
            ) : (
              <button className="tut-next" ref={nextRef} onClick={() => setStep(step + 1)}>
                Lanjut <ChevronRight size={16} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
