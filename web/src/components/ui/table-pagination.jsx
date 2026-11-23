import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";

export function TablePagination({
  page = 1,
  pageSize = 10,
  total = 0,
  itemLabel = "data",
  onPageChange,
  onPageSizeChange,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="shrink-0 border-t border-border/60 bg-card px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">
            {firstItem}-{lastItem} dari {total} {itemLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            Rows
            <select
              className="h-10 min-w-20 rounded-xl border border-input bg-background px-3 text-sm"
              value={pageSize}
              onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
