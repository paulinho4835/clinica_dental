import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { requireNavAccess } from "@/lib/guard";
import { TeamPanel, type TeamMember } from "@/components/ajustes/TeamPanel";
import { ClinicProfilePanel, type ClinicProfile } from "@/components/ajustes/ClinicProfilePanel";
import {
  ConsentTemplatesPanel,
  type TemplateRow,
} from "@/components/ajustes/ConsentTemplatesPanel";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getClinicFeatures } from "@/lib/superadmin";

export default async function SettingsPage() {
  await requireNavAccess("ajustes");
  const supabase = await createClient();
  const profile = await getProfile();
  const canWrite = can(profile?.role, "settings:write");
  const isClinicAdmin = profile?.role === "admin";

  const features = await getClinicFeatures();

  // Perfil público de la clínica (addon "perfil").
  let clinicProfile: ClinicProfile | null = null;
  if (isClinicAdmin && features.perfil && profile) {
    const { data } = await supabase
      .from("clinics")
      .select("name, address, phone, nit, logo_url")
      .eq("id", profile.clinicId)
      .single();
    clinicProfile = data as ClinicProfile | null;
  }

  let systemTemplates: TemplateRow[] = [];
  let clinicTemplates: TemplateRow[] = [];

  if (isClinicAdmin && features.consentimientos && profile) {
    const { data: allTemplates } = await supabase
      .from("consent_templates")
      .select("id, title, body, is_system, clinic_id")
      .order("sort_order");

    systemTemplates = (allTemplates ?? [])
      .filter((t) => t.is_system && t.clinic_id === null)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        body: t.body as string,
        isSystem: true,
        clinicId: null,
      }));

    clinicTemplates = (allTemplates ?? [])
      .filter((t) => !t.is_system && t.clinic_id !== null)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        body: t.body as string,
        isSystem: false,
        clinicId: t.clinic_id as string,
      }));
  }

  // Equipo (cuentas con login): solo lo gestiona el admin de la clínica.
  let team: TeamMember[] = [];
  if (isClinicAdmin && profile) {
    const [platformAdminIds, { data: profiles }] = await Promise.all([
      getPlatformAdminIds(),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("clinic_id", profile.clinicId)
        .order("full_name"),
    ]);

    const platformAdminSet = new Set(platformAdminIds);

    // El email vive en auth.users; se resuelve con el cliente service-role.
    const admin = createAdminClient();
    team = await Promise.all(
      (profiles ?? [])
        .filter((p) => !platformAdminSet.has(p.id))
        .map(async (p) => {
          const { data } = await admin.auth.admin.getUserById(p.id);
          return {
            id: p.id,
            full_name: p.full_name,
            role: p.role,
            email: data.user?.email ?? null,
          };
        }),
    );
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Ajustes de la clínica</h1>

      {clinicProfile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Perfil de la clínica</h2>
          <p className="mb-3 text-sm text-slate-500">
            Datos que aparecerán en documentos impresos: encabezados de recetas,
            presupuestos y reportes.
          </p>
          <ClinicProfilePanel profile={clinicProfile} canWrite={canWrite} />
        </section>
      )}

      {isClinicAdmin && features.consentimientos && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Plantillas de consentimiento</h2>
          <p className="mb-3 text-sm text-slate-500">
            Gestiona las plantillas de consentimiento informado de tu clínica.
            Puedes usar las plantillas del sistema como base o crear las tuyas propias.
          </p>
          <ConsentTemplatesPanel
            systemTemplates={systemTemplates}
            clinicTemplates={clinicTemplates}
          />
        </section>
      )}

      {isClinicAdmin && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Usuarios del equipo</h2>
          <p className="mb-3 text-sm text-slate-500">
            Cuentas con acceso al sistema. Crea usuarios y asígnales un rol para
            controlar qué módulos pueden ver dentro de tu clínica.
          </p>
          <TeamPanel members={team} currentUserId={profile.userId} />
        </section>
      )}

    </div>
  );
}
