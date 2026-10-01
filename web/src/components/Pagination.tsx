import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

/**
 * Pagination daftar tiket dashboard.
 * ponytail: 5 tombol halaman terlihat sekaligus; sisanya ellipsis.
 */
export default function Pagination({ page, totalPages, total, onChange }: Props) {
  if (totalPages <= 1) {
    return (
      <div className="pagination">
        <span className="page-info">Total {total} tiket</span>
      </div>
    );
  }

  // Jendela halaman: pages[first..last] di sekitar halaman aktif
  const win = 2;
  let first = Math.max(1, page - win);
  let last = Math.min(totalPages, page + win);
  if (page - win < 1) last = Math.min(totalPages, last + (1 - (page - win)));
  if (page + win > totalPages) first = Math.max(1, first - ((page + win) - totalPages));

  const pages: number[] = [];
  for (let i = first; i <= last; i++) pages.push(i);

  return (
    <div className="pagination">
      <span className="page-info">
        Halaman {page} / {totalPages} &middot; {total} tiket
      </span>
      <div className="page-btns">
        <button
          className="page-btn"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={16} />
        </button>
        {first > 1 && (
          <>
            <button className="page-btn" onClick={() => onChange(1)}>1</button>
            {first > 2 && <span className="page-ellipsis">&hellip;</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            className={"page-btn" + (p === page ? " active" : "")}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        {last < totalPages && (
          <>
            {last < totalPages - 1 && <span className="page-ellipsis">&hellip;</span>}
            <button className="page-btn" onClick={() => onChange(totalPages)}>{totalPages}</button>
          </>
        )}
        <button
          className="page-btn"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
