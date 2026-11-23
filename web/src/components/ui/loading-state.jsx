export function LoadingState({ label = "Memuat data..." }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/80 px-6 py-16 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
      <span>{label}</span>
    </div>
  );
}
