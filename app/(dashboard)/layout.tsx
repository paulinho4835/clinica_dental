import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { isPlatformAdmin } from "@/lib/superadmin";
import { canSeeNav, type Role } from "@/lib/rbac";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { getInitials } from "@/lib/format";
import { ExitPreviewBanner } from "@/components/superadmin/ExitPreviewBanner";

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
    .select("full_name, role, clinics(name, features, active)")
    .eq("id", user.id)
    .single();

  const superadmin = await isPlatformAdmin();

  // Un superadmin normalmente no tiene perfil. Si lo tiene, está en modo vista previa
  // de una clínica (enterClinic() insertó un perfil temporal y refrescó el JWT).
  const isPreview = superadmin && !!profile;

  const clinic = profile?.clinics as
    | { name?: string; features?: unknown; active?: boolean }
    | null;

  // Clínica dada de baja: bloquea el acceso a sus usuarios (el superadmin sí
  // entra, pues opera la plataforma, no una clínica).
  if (!superadmin && clinic && clinic.active === false) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow ring-1 ring-slate-200">
          <h1 className="text-xl font-bold text-slate-800">Cuenta suspendida</h1>
          <p className="mt-2 text-sm text-slate-500">
            El acceso a {clinic.name ?? "esta clínica"} está temporalmente
            suspendido. Contacta al administrador de la plataforma para
            reactivar tu cuenta.
          </p>
        </div>
        <Toaster />
      </main>
    );
  }
  const clinicName = isPreview
    ? (clinic?.name ?? "Clínica")
    : superadmin
    ? "Plataforma"
    : clinic?.name ?? "Clínica";

  // Menú = módulos encendidos de la clínica Y permitidos para el rol del usuario.
  const features = normalizeFeatures(clinic?.features);
  const role = profile?.role as Role | undefined;

  // Badge de stock bajo: solo para admin con módulo inventario activo.
  let lowStockCount = 0;
  if (role === "admin" && features.inventario) {
    const { data: stockItems } = await supabase
      .from("inventory_items")
      .select("min_stock, current_stock");
    lowStockCount = (stockItems ?? []).filter(
      (it) => Number(it.current_stock) <= Number(it.min_stock),
    ).length;
  }

  const nav =
    superadmin && !isPreview
      ? []
      : FEATURES.filter((f) => features[f.key] && canSeeNav(role, f.key)).map((f) => ({
          href: f.href,
          label: f.label,
          badge: f.key === "inventario" && lowStockCount > 0 ? lowStockCount : undefined,
        }));

  const initials =
    !superadmin && profile?.full_name
      ? getInitials(profile.full_name)
      : null;

  const ROLE_LABEL: Record<string, string> = {
    admin: "Administrador",
    recepcionista: "Recepcionista",
    odontologo_general: "Odontólogo",
    especialista: "Especialista",
    asistente: "Asistente",
  };
  const subtitle = isPreview
    ? "Vista previa"
    : superadmin
    ? "Operador de plataforma"
    : `${profile?.full_name ?? ""} · ${ROLE_LABEL[profile?.role ?? ""] ?? profile?.role ?? ""}`;

  return (
    <div className="flex min-h-screen flex-col">
      {isPreview && <ExitPreviewBanner clinicName={clinicName} />}
      <div className="flex flex-1 flex-col md:flex-row">
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
    </div>
  );
}
