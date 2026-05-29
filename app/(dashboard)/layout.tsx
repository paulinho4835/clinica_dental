import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

const NAV = [
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/tratamientos", label: "Tratamientos" },
  { href: "/caja", label: "Caja y finanzas" },
  { href: "/inventario", label: "Inventario" },
  { href: "/ajustes", label: "Ajustes" },
] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, clinics(name)")
    .eq("id", user.id)
    .single();

  const clinicName =
    (profile?.clinics as { name?: string } | null)?.name ?? "Clínica";

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-clinic-fg">{clinicName}</div>
          <div className="text-xs text-slate-500">
            {profile?.full_name} · {profile?.role}
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-200 pt-4">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
