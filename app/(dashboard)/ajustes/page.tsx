import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { requireNavAccess } from "@/lib/guard";
import { TeamPanel, type TeamMember } from "@/components/ajustes/TeamPanel";
import { DoctorsPanel, type Doctor } from "@/components/ajustes/DoctorsPanel";
import { getPlatformAdminIds } from "@/lib/platformAdmins";

export default async function SettingsPage() {
  await requireNavAccess("ajustes");
  const supabase = await createClient();
  const profile = await getProfile();
  const canWrite = can(profile?.role, "settings:write");
  const isClinicAdmin = profile?.role === "admin";

  // Doctores (roster clínico, sin login): accesible para el admin.
  let doctors: Doctor[] = [];
  if (isClinicAdmin && profile) {
    const { data } = await supabase
      .from("doctors")
      .select("id, full_name, specialty, active")
      .eq("clinic_id", profile.clinicId)
      .order("full_name");
    doctors = (data ?? []) as Doctor[];
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

      {isClinicAdmin && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Doctores</h2>
          <p className="mb-3 text-sm text-slate-500">
            Roster clínico. Los doctores registrados aquí aparecen disponibles al
            agendar citas y en los reportes de la agenda.
          </p>
          <DoctorsPanel doctors={doctors} canWrite={canWrite} />
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
