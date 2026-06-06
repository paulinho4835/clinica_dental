"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

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
      <span className="shrink-0 text-slate-400">{icon}</span>
      {label}
    </Link>
  );
}
