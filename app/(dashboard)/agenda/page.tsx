import { getProfile } from "@/lib/auth";
import { can, isReceptionistLike } from "@/lib/rbac";
import { type AgendaView } from "@/components/agenda/AgendaShell";
import { AgendaClient } from "@/components/agenda/AgendaClient";
import { requireFeature } from "@/lib/guard";
import { getClinicFeatures, getClinicCurrency } from "@/lib/superadmin";
import { boliviaTodayISO } from "@/lib/format";
import { getPlatformAdminIds } from "@/lib/platformAdmins";

export const dynamic = "force-dynamic";

const isView = (v: string | undefined): v is AgendaView =>
  v === "day" || v === "week" || v === "month" || v === "overview";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; paciente?: string }>;
}) {
  await requireFeature("agenda");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : boliviaTodayISO();
  const view: AgendaView = isView(sp.view) ? sp.view : "month";
  // "Agendar cita" desde la ficha del paciente: llega con ?paciente=<id> y el
  // cliente lo deja preelegido en las citas nuevas.
  const presetPatientId = UUID_RE.test(sp.paciente ?? "") ? sp.paciente! : null;

  const [profile, features, platformAdminIds, currency] = await Promise.all([
    getProfile(),
    getClinicFeatures(),
    getPlatformAdminIds(),
    getClinicCurrency(),
  ]);
  if (!profile) return null;

  const writable = can(profile.role, "appointments:write");
  const isAdmin = profile?.role === "admin";
  const isRecepcionista = isReceptionistLike(profile?.role);
  // Admin y recepcionista pueden ver y filtrar la agenda de todos los doctores.
  const canViewAll = isAdmin || isRecepcionista;

  // Nombre del usuario logueado (para preseleccionar "Mi Agenda" en el dropdown).
  const myName = profile.fullName;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agenda</h1>
      <AgendaClient
        initialDate={date}
        initialView={view}
        clinicId={profile.clinicId}
        userId={profile.userId}
        role={profile.role}
        myName={myName}
        canWrite={writable}
        presetPatientId={writable ? presetPatientId : null}
        canViewAll={canViewAll}
        platformAdminIds={platformAdminIds}
        recordatoriosEnabled={features.recordatorios}
        whatsappManualEnabled={features.whatsapp_manual}
        avisoDoctoresEnabled={features.aviso_doctores}
        disponibilidadEnabled={features.disponibilidad}
        currency={currency}
      />
    </div>
  );
}
