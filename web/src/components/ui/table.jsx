import { cn } from "@/lib/utils";

export function Table({ className, wrapperClassName, ...props }) {
  return (
    <div
      className={cn(
        "app-scrollbar min-w-0 w-full max-w-full overflow-x-auto overflow-y-auto bg-muted/25 p-3",
        wrapperClassName,
      )}
    >
      <table
        className={cn(
          "w-full caption-bottom border-separate border-spacing-y-2 text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function TableHeader(props) {
  return <thead {...props} />;
}

export function TableBody(props) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn(
        "group transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        "h-11 bg-background/95 px-4 text-left align-middle text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground first:rounded-l-2xl last:rounded-r-2xl",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return (
    <td
      className={cn(
        "border-y border-border/60 bg-card p-4 align-middle shadow-sm transition-colors first:rounded-l-2xl first:border-l last:rounded-r-2xl last:border-r group-hover:bg-muted/45",
        className,
      )}
      {...props}
    />
  );
}
