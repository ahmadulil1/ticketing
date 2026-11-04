import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Warna semantik tiket (sama dengan class pill CSS lama)
        statusBaru: "border-transparent bg-primary/10 text-primary",
        statusProses:
          "border-transparent bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-(--warning)",
        statusTunggu:
          "border-transparent bg-[color-mix(in_srgb,#9b59b6_14%,transparent)] text-[#9b59b6]",
        statusSelesai:
          "border-transparent bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-(--success)",
        statusTutup: "border-transparent bg-muted text-muted-foreground",
        prioTinggi:
          "border-transparent bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-(--danger)",
        prioNormal: "border-transparent bg-(--primary-tint) text-(--primary-strong)",
        prioRendah: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
