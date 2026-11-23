import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatsCard({ label, value, hint, icon: Icon, tone = "primary" }) {
  const toneClass =
    tone === "accent"
      ? "bg-accent/80 text-accent-foreground"
      : tone === "secondary"
        ? "bg-secondary/90 text-secondary-foreground"
        : "bg-primary/12 text-primary";

  return (
    <Card className="overflow-hidden border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {label}
            </p>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight">{value}</h3>
            {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
          </div>
          <div className={cn("rounded-2xl p-3", toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
