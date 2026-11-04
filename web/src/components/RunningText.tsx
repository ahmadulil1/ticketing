import { useEffect, useRef } from "react";

const PHRASE = "MARISON TICKETING";
const BG_CHARS = "アイウエオカキクケコサシスセソ0123456789ABCDEF<>*+-=;:";

// Font piksel 5x7: tiap huruf = 7 baris, 5 kolom. 'X' = piksel menyala.
const FONT: Record<string, string[]> = {
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  I: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "XXXXX"],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
  C: [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"],
  K: ["X...X", "X..X.", "X.X..", "XXX..", "X.X..", "X..X.", "X...X"],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  G: [".XXXX", "X....", "X....", "X.XXX", "X...X", "X...X", ".XXX."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

// Bangun kolom-kolom piksel frasa: tiap huruf = 5 kolom + 1 kolom spasi.
// Tiap kolom disimpan sebagai 7 bit (bit 6 = baris atas, bit 0 = bawah).
function buildPixelColumns(): number[] {
  const cols: number[] = [];
  for (const ch of PHRASE) {
    const rows = FONT[ch] ?? FONT[" "];
    for (let c = 0; c < 5; c++) {
      let bits = 0;
      for (let r = 0; r < 7; r++) {
        if (rows[r][c] === "X") bits |= 1 << (6 - r);
      }
      cols.push(bits);
    }
    cols.push(0); // kolom spasi antar huruf
  }
  return cols;
}

// 17 tingkat warna dari redup ke terang, kini lebih lembut: lapangan
// 0.22 dan kata 0.70 (sebelumnya 0.40 / 0.95) agar tidak terlalu kontras.
const STYLES: string[] = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const r = Math.round(107 + (205 - 107) * t);
  const g = Math.round(138 + (218 - 138) * t);
  const a = (0.22 + 0.48 * t).toFixed(3);
  return `rgba(${r},${g},255,${a})`;
});

/**
 * Tulisan dari WARNA, kini tanpa patah-patah. Penyebab patah sebelumnya:
 * scroll bergerak 2 sel (sekitar 19px) sekaligus, hanya 10x per detik.
 * Perbaikannya: scroll kini jalan terus di 60fps (requestAnimationFrame)
 * dan tepi pola warna dihaluskan — sel yang terpotong batas huruf
 * mendapat warna antara redup-terang sesuai porsi tertutupnya, jadi
 * gelombang terang mengalir mulus, bukan melompat sel demi sel.
 * Glyph tetap acak dan berkedip 10x per detik seperti sebelumnya
 * (kedip memang karakternya, bukan patahnya). Menghormati
 * prefers-reduced-motion (satu frame statis).
 */
export default function RunningText({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fontSize = 16;
    const font = `${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    const PIXEL_W = 5; // 1 piksel huruf = 5 kolom sel (lebar sel ~0,6em)
    const PIXEL_H = 3; // 1 piksel huruf = 3 baris sel (tinggi sel 1em)
    const GAP_PIXELS = 12; // jeda kosong antar pengulangan frasa
    const SPEED = 180; // px per detik
    const pixelCols = buildPixelColumns();
    const period = pixelCols.length + GAP_PIXELS;

    let width = 0;
    let height = 0;
    let charW = 0;
    let cols = 0;
    let rows = 0;
    let grid: string[] = [];
    let scrollPx = 0;
    let periodPx = 0;
    let maskPixelW = 0;
    let raf = 0;
    let last = 0;
    let flickerAcc = 0;

    const randomChar = () => BG_CHARS[Math.floor(Math.random() * BG_CHARS.length)];

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      charW = ctx.measureText("M").width;
      cols = Math.max(1, Math.ceil(width / charW));
      rows = Math.max(1, Math.ceil(height / fontSize));
      grid = Array.from({ length: cols * rows }, () => randomChar());
      maskPixelW = PIXEL_W * charW;
      periodPx = period * maskPixelW;
    };

    // Porsi sel yang tertutup piksel menyala (0..1), dari posisi kontinu.
    const coverage = (c: number, py: number): number => {
      const u0 = c * charW + scrollPx;
      const u1 = u0 + charW;
      const f0 = Math.floor(u0 / maskPixelW);
      const p0 = ((f0 % period) + period) % period;
      const p1 = (((Math.floor(u1 / maskPixelW)) % period) + period) % period;
      const bit = (p: number) =>
        p < pixelCols.length ? (pixelCols[p] >> (6 - py)) & 1 : 0;
      if (p0 === p1) return bit(p0);
      const boundary = (f0 + 1) * maskPixelW;
      const frac0 = (boundary - u0) / charW;
      return bit(p0) * frac0 + bit(p1) * (1 - frac0);
    };

    const paint = () => {
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, width, height);
      ctx.font = font;
      const wordTop = Math.max(0, Math.floor(rows / 2) - Math.floor((7 * PIXEL_H) / 2));
      const wordRows = 7 * PIXEL_H;
      for (let r = 0; r < rows; r++) {
        const inBand = r >= wordTop && r < wordTop + wordRows;
        const py = inBand ? Math.floor((r - wordTop) / PIXEL_H) : -1;
        for (let c = 0; c < cols; c++) {
          const level = inBand ? Math.round(coverage(c, py) * 16) : 0;
          ctx.fillStyle = STYLES[level];
          ctx.fillText(grid[r * cols + c], c * charW, (r + 1) * fontSize - 3);
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(last ? now - last : 16, 100);
      last = now;
      scrollPx = (scrollPx + (SPEED * dt) / 1000) % periodPx;
      flickerAcc += dt;
      while (flickerAcc >= 100) {
        flickerAcc -= 100;
        for (let i = 0; i < grid.length; i++) {
          if (Math.random() < 0.12) grid[i] = randomChar();
        }
      }
      paint();
      raf = requestAnimationFrame(frame);
    };

    setup();
    paint();
    if (!reduced) {
      raf = requestAnimationFrame(frame);
    }
    const onResize = () => {
      setup();
      paint();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
