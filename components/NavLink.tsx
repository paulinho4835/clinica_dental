"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Muestra un spinner en lugar del icono mientras la navegación a este enlace
// está en curso (Next.js resuelve el server component de la página destino).
// Da feedback inmediato de "ya vas en camino" y elimina la sensación de clic muerto.
function NavIcon({ icon }: { icon: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="shrink-0 text-slate-400">
      {pending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : icon}
    </span>
  );
}

export function NavLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-clinic/10 font-semibold text-clinic"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      <NavIcon icon={icon} />
      {label}
    </Link>
  );
}
