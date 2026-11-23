import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Boxes,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Kerja Hari Ini",
    href: "/work",
    icon: ClipboardCheck,
  },
  {
    label: "Data Maintenance",
    href: "/maintenance",
    icon: Wrench,
  },
  {
    label: "Aset",
    href: "/assets",
    icon: Boxes,
  },
];

export function AppShell({ children, showAuthControls = true, defaultTitle = "Dashboard" }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();

  const activeItem = useMemo(
    () =>
      navigation.find((item) =>
        item.href === "/assets"
          ? location.pathname.startsWith("/assets")
          : item.href === location.pathname,
      ),
    [location.pathname],
  );

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen w-full">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-border/70 bg-card/92 px-4 py-5 backdrop-blur xl:static xl:flex",
            mobileOpen ? "flex" : "hidden xl:flex",
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Maintenance</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="mt-6 space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
                    isActive
                      ? "bg-primary/95 text-primary-foreground shadow-lg shadow-primary/15"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-950/50 xl:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <main className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/88 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="xl:hidden"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Internal
                  </p>
                  <h2 className="text-lg font-bold tracking-tight">
                    {activeItem?.label || defaultTitle}
                  </h2>
                </div>
              </div>
              {showAuthControls ? (
                <div className="flex items-center gap-3">
                  <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm md:inline-flex">
                    <UserRound className="h-4 w-4 text-primary" />
                    <span className="max-w-52 truncate">{user?.email}</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const { error } = await signOut();
                      if (error) {
                        console.error(error);
                      }
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              ) : null}
            </div>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
