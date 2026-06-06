import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { isPlatformAdmin } from "@/lib/superadmin";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { getInitials } from "@/lib/format";

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

  const initials =
    !superadmin && profile?.full_name
      ? getInitials(profile.full_name)
      : null;

  const subtitle = superadmin
    ? "Operador de plataforma"
    : `${profile?.full_name} · ${profile?.role}`;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        clinicName={clinicName}
        subtitle={subtitle}
        initials={initials}
        nav={nav}
        superadmin={superadmin}
      />
      <main className="flex-1 p-4 md:p-8">{children}</main>
      <Toaster />
      <ConfirmHost />
    </div>
  );
}
