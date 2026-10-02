"use client";

import { Fragment, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  Package,
  Wallet,
  Stethoscope,
  ClipboardList,
  Shield,
  Menu,
  X,
  Banknote,
  CreditCard,
  ShieldCheck,
  MessageSquareDashed,
  Star,
  Layers,
  Megaphone,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";
import { NAV_SECTION_MIN_ITEMS, type NavItem } from "@/lib/nav";

export type { NavItem };

const ICONS: Record<string, LucideIcon> = {
  "/inicio": Home,
  "/agenda": Calendar,
  "/pacientes": Users,
  "/mis-trabajos": ClipboardList,
  "/inventario": Package,
  "/pagos": Banknote,
  "/caja": Wallet,
  "/cuentas": CreditCard,
  "/ajustes": Stethoscope,
  "/auditoria": ShieldCheck,
  "/calificaciones": Star,
  "/wa-masivo": MessageSquareDashed,
  "/tratamientos": Layers,
  "/campanas": Megaphone,
  "/disponibilidad": CalendarClock,
};

function navIcon(href: string) {
  const Icon = ICONS[href];
  return Icon ? <Icon className="h-[18px] w-[18px]" /> : <span>•</span>;
}

export function Sidebar({
  clinicName,
  subtitle,
  initials,
  nav,
  superadmin,
}: {
  clinicName: string;
  subtitle: string;
  initials: string | null;
  nav: NavItem[];
  superadmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el drawer al navegar (móvil).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquea scroll del body cuando el drawer está abierto en móvil, y lo
  // cierra con Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showSections = nav.length >= NAV_SECTION_MIN_ITEMS;

  const content = (
    <div className="flex h-full flex-col p-4">
      <div className="mb-6 flex shrink-0 items-center gap-3">
        {initials && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clinic text-sm font-bold text-white">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-clinic-fg">
            {clinicName}
          </div>
          <div className="truncate text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>

      {/* El menú hace scroll propio: con muchos módulos, en pantallas bajas
          (laptops de 768px) Ajustes y Cerrar sesión quedaban fuera de vista. */}
      <nav className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {nav.map((item, i) => (
          <Fragment key={item.href}>
            {showSections && item.section && item.section !== nav[i - 1]?.section && (
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {item.section}
              </p>
            )}
            <NavLink
              href={item.href}
              label={item.label}
              icon={navIcon(item.href)}
              badge={item.badge}
              onNavigate={() => setOpen(false)}
            />
          </Fragment>
        ))}
      </nav>

      {superadmin && (
        <div className="mt-6 shrink-0 border-t border-slate-200 pt-4">
          <ButtonLink href="/superadmin" variant="dark" className="w-full">
            <Shield className="h-4 w-4" /> Superadmin
          </ButtonLink>
        </div>
      )}

      <div className="mt-4 shrink-0 space-y-1 border-t border-slate-200 pt-4">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </div>
  );

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate font-semibold text-clinic-fg">
          {clinicName}
        </span>
      </header>

      {/* Sidebar fijo en escritorio */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        {content}
      </aside>

      {/* Drawer en móvil */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute left-0 top-0 h-full w-64 bg-white shadow-xl",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
