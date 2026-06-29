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
import { TermsGate } from "@/components/legal/TermsGate";

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
    .select("full_name, role, active, terms_accepted_at, clinics(name, features, active)")
    .eq("id", user.id)
    .single();

  const superadmin = await isPlatformAdmin();

  // Un superadmin normalmente no tiene perfil. Si lo tiene, está en modo vista previa
  // de una clínica (enterClinic() insertó un perfil temporal y refrescó el JWT).
  const isPreview = superadmin && !!profile;

  const clinic = profile?.clinics as
    | { name?: string; features?: unknown; active?: boolean }
    | null;

  // Usuario desactivado: conserva todos sus datos pero no puede operar. El
  // superadmin en vista previa nunca se bloquea (su perfil temporal es active).
  const profileActive = (profile as { active?: boolean } | null)?.active ?? true;
  if (!superadmin && profile && profileActive === false) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow ring-1 ring-slate-200">
          <h1 className="text-xl font-bold text-slate-800">Cuenta desactivada</h1>
          <p className="mt-2 text-sm text-slate-500">
            Tu cuenta fue desactivada. Si crees que es un error, contacta al
            administrador de tu clínica para reactivarla.
          </p>
        </div>
        <Toaster />
      </main>
    );
  }

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
  // Aceptación de Términos: la primera vez que el admin de la clínica entra (sin
  // terms_accepted_at) ve un aviso bloqueante. No aplica al superadmin ni en
  // vista previa: el admin acepta en nombre de toda su clínica.
  const termsAccepted = !!(profile as { terms_accepted_at?: string | null } | null)
    ?.terms_accepted_at;
  if (!superadmin && profile && profile.role === "admin" && !termsAccepted) {
    return (
      <>
        <TermsGate clinicName={clinic?.name ?? "tu clínica"} />
        <Toaster />
      </>
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

  const nav =
    superadmin && !isPreview
      ? []
      : // "Inicio" es ahora un addon (opt-in): aparece arriba del menú solo si la
        // clínica lo tiene activo, igual que los demás módulos (va primero en FEATURES).
        FEATURES.filter((f) => features[f.key] && canSeeNav(role, f.key)).map((f) => ({
          href: f.href,
          label: f.label,
        }));

  const initials =
    !superadmin && profile?.full_name
      ? getInitials(profile.full_name)
      : null;

  const ROLE_LABEL: Record<string, string> = {
    admin: "Administrador",
    recepcionista: "Recepcionista",
    colega: "Colega",
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
