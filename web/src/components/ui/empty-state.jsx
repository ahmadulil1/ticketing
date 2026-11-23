import { DatabaseZap } from "lucide-react";

export function EmptyState({
  title = "Belum ada data",
  description = "Ubah filter atau tambahkan data baru untuk mulai mencatat maintenance.",
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <div className="mb-4 rounded-2xl bg-secondary p-4 text-secondary-foreground">
        <DatabaseZap className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

