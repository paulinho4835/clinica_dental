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
import { RemindersPanel, type ReminderRow } from "@/components/ajustes/RemindersPanel";
import { ClinicalHoursPanel } from "@/components/ajustes/ClinicalHoursPanel";
import { WhatsAppPanel } from "@/components/ajustes/WhatsAppPanel";
import { getClinicalHours, type ClinicalHours } from "@/lib/clinicalHours";
import {
  ReceptionistasPanel,
  type ReceptionistaRow,
} from "@/components/ajustes/ReceptionistasPanel";

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

  // Recordatorios WhatsApp (addon "recordatorios").
  let remindersConfig = { h24: true, h2: false };
  let recentReminders: ReminderRow[] = [];

  if (isClinicAdmin && features.recordatorios && profile) {
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("settings")
      .eq("id", profile.clinicId)
      .single();

    const s = (clinicData?.settings ?? {}) as Record<string, unknown>;
    remindersConfig = {
      h24: s.reminders_h24 !== false,
      h2:  s.reminders_h2  === true,
    };

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("appointment_reminders")
      .select(
        "id, hours_before, status, scheduled_for, sent_at, appointments(starts_at, patient_name, patients(full_name))",
      )
      .eq("clinic_id", profile.clinicId)
      .gte("scheduled_for", since)
      .order("scheduled_for", { ascending: false })
      .limit(20);

    recentReminders = (recent ?? []) as unknown as ReminderRow[];
  }

  // Bloqueo por horario clínico (addon "bloqueo_horario").
  let clinicalHours: ClinicalHours | null = null;
  if (isClinicAdmin && features.bloqueo_horario && profile) {
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("settings")
      .eq("id", profile.clinicId)
      .single();
    clinicalHours = getClinicalHours(clinicData?.settings);
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

  // Recepcionistas (nombres para "Cobrado por" en Mis Trabajos, sin cuenta propia).
  let receptionistas: ReceptionistaRow[] = [];
  if (isClinicAdmin && profile) {
    const { data } = await supabase
      .from("clinic_receptionists")
      .select("id, name")
      .eq("clinic_id", profile.clinicId)
      .eq("active", true)
      .order("name");
    receptionistas = (data ?? []) as ReceptionistaRow[];
  }

  // Equipo (cuentas con login): solo lo gestiona el admin de la clínica.
  let team: TeamMember[] = [];
  if (isClinicAdmin && profile) {
    const [platformAdminIds, { data: profiles }] = await Promise.all([
      getPlatformAdminIds(),
      // Solo usuarios activos: a un usuario desactivado lo gestiona únicamente el
      // superadmin; el admin de clínica ni siquiera lo ve en su equipo.
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("clinic_id", profile.clinicId)
        .eq("active", true)
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

      {isClinicAdmin && features.whatsapp && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">WhatsApp Baileys</h2>
          <p className="mb-3 text-sm text-slate-500">
            Conecta el número de WhatsApp de tu clínica para enviar recordatorios automáticos.
            Escanea el código QR con la app de WhatsApp en el teléfono de la clínica.
          </p>
          <WhatsAppPanel canWrite={canWrite} />
        </section>
      )}

      {isClinicAdmin && features.recordatorios && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">
            Recordatorios automáticos de WhatsApp
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Envía recordatorios automáticos a tus pacientes por WhatsApp antes de su cita.
            Solo aplica a pacientes registrados con número de teléfono.
          </p>
          <RemindersPanel
            config={remindersConfig}
            recentReminders={recentReminders}
            canWrite={canWrite}
          />
        </section>
      )}

      {isClinicAdmin && features.bloqueo_horario && clinicalHours && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">
            Bloqueo por horario
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Define la franja en la que los doctores pueden editar el odontograma
            y las notas de evolución. Fuera de ese horario quedan en modo lectura.
            El administrador siempre puede editar.
          </p>
          <ClinicalHoursPanel config={clinicalHours} canWrite={canWrite} />
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
          <h2 className="text-lg font-semibold text-slate-800">Recepcionistas</h2>
          <p className="mb-3 text-sm text-slate-500">
            Nombres que aparecerán en el campo "Cobrado por" al registrar trabajos.
            Útil cuando varias recepcionistas comparten una misma cuenta.
          </p>
          <ReceptionistasPanel receptionistas={receptionistas} />
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
