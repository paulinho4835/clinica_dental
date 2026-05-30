import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { isPlatformAdmin } from "@/lib/superadmin";

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
    .select("full_name, role, clinics(name, features)")
    .eq("id", user.id)
    .single();

  const superadmin = await isPlatformAdmin();

  const clinic = profile?.clinics as
    | { name?: string; features?: unknown }
    | null;
  const clinicName = superadmin ? "Plataforma" : clinic?.name ?? "Clínica";

  // Menú = solo módulos encendidos de la clínica. El superadmin no opera una
  // clínica, así que no ve módulos clínicos (solo su panel).
  const features = normalizeFeatures(clinic?.features);
  const nav = superadmin ? [] : FEATURES.filter((f) => features[f.key]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-clinic-fg">{clinicName}</div>
          <div className="text-xs text-slate-500">
            {superadmin
              ? "Operador de plataforma"
              : `${profile?.full_name} · ${profile?.role}`}
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {superadmin && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <Link
              href="/superadmin"
              className="block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              ⚙ Superadmin
            </Link>
          </div>
        )}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
