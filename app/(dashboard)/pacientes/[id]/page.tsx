import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getProfile } from "@/lib/auth";
import { can, canSeeNav } from "@/lib/rbac";
import { OdontogramEditor } from "@/components/odontogram/OdontogramEditor";
import { OdontogramHistory } from "@/components/odontogram/OdontogramHistory";
import { EditPatientForm } from "@/components/patients/EditPatientForm";
import { DeletePatientButton } from "@/components/patients/DeletePatientButton";
import {
  WorkStatusPanel,
  VisitasPanel,
  type ApptRow,
} from "@/components/history/PatientHistoryPanel";
import {
  TreatmentPlanPanel,
  type Work,
  type Dentist,
} from "@/components/treatments/TreatmentPlanPanel";
import type { TeethMap } from "@/lib/odontogram/types";
import { bs } from "@/lib/format";
import Link from "next/link";
import { normalizeFeatures } from "@/lib/features";
import { PrescriptionsPanel } from "@/components/patients/PrescriptionsPanel";
import type {
  PrescriptionRow,
  Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";
import {
  ConsentsPanel,
  type ConsentRow,
} from "@/components/consents/ConsentsPanel";
import { EvolutionPanel } from "@/components/patients/EvolutionPanel";
import type {
  ConsentTemplate,
  ConsentAppointment,
} from "@/components/consents/ConsentModal";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, allergies, medical_alerts, anamnesis, evolution")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const profile = await getProfile();

  const { data: odo } = await supabase
    .from("odontograms")
    .select("teeth")
    .eq("patient_id", id)
    .maybeSingle();

  const platformAdminIds = await getPlatformAdminIds();
  const platformAdminIdSet = new Set(platformAdminIds);
  const canSeeHistory = profile?.role === "admin";
  const canClinical = can(profile?.role, "clinical:write");
  const canDelete = can(profile?.role, "patients:delete");
  const canBilling = can(profile?.role, "billing:write");
  const canSeeCuentas = canSeeNav(profile?.role, "cuentas");
  // Registro clínico (evolución y odontograma): solo admin y doctores pueden
  // modificar (NO recepcionista, aunque ésta tenga clinical:write para otras cosas).
  const canEditClinical =
    profile?.role === "admin" ||
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista";
  // Doctores: vista restringida del paciente (solo lectura de datos personales,
  // editan únicamente alergias y alertas médicas).
  const isDoctor =
    profile?.role === "odontologo_general" || profile?.role === "especialista";

  // Solo doctores activos en el selector de asignación de tratamientos; los
  // trabajos ya registrados conservan el nombre del doctor aunque se desactive.
  let dentistsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin"])
    .eq("clinic_id", patient.clinic_id)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    dentistsQuery = dentistsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  const [
    { data: rawPlans },
    { data: payments },
    { data: appointments },
    { data: dentists },
    { data: rawPrescriptions },
    { data: clinicRow },
    { data: rawConsents },
    { data: consentTemplates },
    { data: evolutionNotes },
    { data: evolutionHistory },
    { data: rawOdoEvents },
    { data: rawCatalog },
  ] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "id, treatment_phases(treatment_items(id, price, status, custom_name, created_at, doctor_id, doctor:profiles!treatment_items_doctor_id_fkey(full_name), procedure:procedure_catalog(name)))",
      )
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount")
      .eq("patient_id", id),
    supabase
      .from("appointments")
      .select("id, starts_at, dentist_name, reason, status")
      .eq("patient_id", id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false }),
    dentistsQuery,
    supabase
      .from("prescriptions")
      .select("id, medications, notes, issued_at, doctor:profiles(full_name)")
      .eq("patient_id", id)
      .order("issued_at", { ascending: false }),
    supabase
      .from("clinics")
      .select("features, name")
      .eq("id", patient.clinic_id)
      .single(),
    supabase
      .from("consents")
      .select("id, title, status, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("consent_templates")
      .select("id, title, body")
      .order("sort_order"),
    supabase
      .from("patient_evolution_notes")
      .select("id, author_id, author_name, body, created_at, updated_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_evolution_note_history")
      .select("id, note_id, author_id, author_name, body, action, changed_at")
      .eq("patient_id", id)
      .order("changed_at", { ascending: false }),
    supabase
      .from("odontogram_events")
      .select("id, tooth_fdi, surface, prev_state, new_state, created_at, actor:profiles(id, full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("procedure_catalog")
      .select("id, name, base_price")
      .eq("active", true)
      .order("name"),
  ]);

  const catalog = (rawCatalog ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    base_price: Number(c.base_price),
  }));

  // Aplana el join de actor a actor_name para el componente de historial.
  // Los platform-admins (superadmin) nunca exponen su nombre en la clínica.
  const odoEvents = (rawOdoEvents ?? []).map((e) => {
    const actor = e.actor as { id?: string; full_name?: string } | null;
    const actorName =
      !actor || platformAdminIdSet.has(actor.id ?? "")
        ? null
        : actor.full_name ?? null;
    return {
      id: e.id as string,
      tooth_fdi: e.tooth_fdi as string,
      surface: (e.surface as string | null) ?? null,
      prev_state: (e.prev_state as string | null) ?? null,
      new_state: (e.new_state as string | null) ?? null,
      created_at: e.created_at as string,
      actor_name: actorName,
    };
  });

  // Aplana todos los items del plan en una lista de "trabajos".
  const works: Work[] = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .map((it) => ({
      id: it.id as string,
      name:
        ((it.procedure as { name?: string } | null)?.name ?? (it.custom_name as string)) || "—",
      price: Number(it.price),
      done: it.status === "done",
      createdAt: it.created_at as string,
      dentistId: (it.doctor_id as string | null) ?? null,
      dentistName: ((it.doctor as { full_name?: string } | null)?.full_name) ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const apptRows: ApptRow[] = (appointments ?? []).map((a) => ({
    id: a.id as string,
    startsAt: a.starts_at as string,
    dentistName: a.dentist_name as string | null,
    reason: a.reason as string | null,
    status: a.status as string,
  }));

  const totalPaidRaw = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const prescriptionRows: PrescriptionRow[] = (rawPrescriptions ?? []).map((rx) => ({
    id: rx.id as string,
    doctorName:
      ((rx.doctor as { full_name?: string } | null)?.full_name) ?? null,
    medications: rx.medications as Medication[],
    notes: rx.notes as string | null,
    issuedAt: rx.issued_at as string,
  }));

  const features = normalizeFeatures(clinicRow?.features);
  const recetasEnabled = features.recetas;
  const consentimientosEnabled = features.consentimientos;

  const consentRows: ConsentRow[] = (rawConsents ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    status: c.status as "pendiente" | "firmado",
    createdAt: c.created_at as string,
  }));

  const consentTemplateList: ConsentTemplate[] = (consentTemplates ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    body: t.body as string,
  }));

  const consentAppts: ConsentAppointment[] = apptRows.map((a) => ({
    id: a.id,
    startsAt: a.startsAt,
    reason: a.reason,
  }));

  const clinicName = (clinicRow as { name?: string; features?: unknown } | null)?.name ?? "";

  const totalQuoted = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .filter((it) => (it.status as string) !== "cancelled")
    .reduce((s, it) => s + Number(it.price), 0);
  const totalPaid = totalPaidRaw;

  const teeth = (odo?.teeth as TeethMap) ?? {};

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <div className="flex items-start gap-2">
            {/* Solo admin y doctores editan pacientes; recepcionista/asistente no ven el botón.
                Para doctores se omiten teléfono/email/dirección incluso del payload. */}
            {canEditClinical && (
              <EditPatientForm
                patient={
                  isDoctor
                    ? { ...patient, phone: null, email: null, address: null }
                    : patient
                }
                restricted={isDoctor}
              />
            )}
            {canDelete && (
              <DeletePatientButton
                patientId={patient.id}
                patientName={patient.full_name}
              />
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {patient.dob && <span>Nac.: {patient.dob}</span>}
          {patient.phone && !isDoctor && <span>Tel.: {patient.phone}</span>}
          {canBilling && <span>Saldo: {bs(totalQuoted - totalPaid)}</span>}
        </div>
        {patient.medical_alerts?.length > 0 && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠ Alertas médicas: {patient.medical_alerts.join(", ")}
          </div>
        )}
        {patient.allergies?.length > 0 && (
          <div className="mt-2 text-sm text-amber-700">Alergias: {patient.allergies.join(", ")}</div>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="mb-3 text-lg font-semibold">Odontograma</h2>
        <OdontogramEditor
          patientId={patient.id}
          initialTeeth={teeth}
          canWrite={canEditClinical}
        />
        <OdontogramHistory events={odoEvents} canSeeHistory={canSeeHistory} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel patientId={patient.id} canWrite={canClinical} canDelete={profile?.role === "admin"} works={works} dentists={dentists ?? []} catalog={catalog} recetasEnabled={recetasEnabled} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seguimiento del tratamiento</h2>
        <WorkStatusPanel patientId={patient.id} canWrite={canClinical} works={works} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Evolución del paciente</h2>
        <EvolutionPanel
          patientId={patient.id}
          notes={(evolutionNotes ?? []).map((n) => ({
            ...n,
            // El superadmin no debe aparecer con su nombre en la clínica.
            author_name: platformAdminIdSet.has(n.author_id ?? "")
              ? "Sistema"
              : n.author_name as string,
          }))}
          history={(evolutionHistory ?? []).map((h) => ({
            id: h.id as string,
            note_id: h.note_id as string,
            author_name: platformAdminIdSet.has((h as { author_id?: string }).author_id ?? "")
              ? "Sistema"
              : h.author_name as string,
            body: h.body as string,
            action: h.action as "edited" | "deleted",
            changed_at: h.changed_at as string,
          }))}
          legacyEvolution={(patient as { evolution?: string | null }).evolution ?? null}
          canWrite={canEditClinical}
          canSeeHistory={canSeeHistory}
          currentUserId={profile?.userId ?? ""}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Visitas</h2>
        <VisitasPanel appointments={apptRows} />
      </section>

      {canBilling && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Cuenta del paciente</h2>
          <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex gap-8 text-sm">
              <div>
                <div className="text-xs text-slate-500">Total tratamiento</div>
                <div className="mt-0.5 font-semibold tabular-nums">{bs(totalQuoted)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total pagado</div>
                <div className="mt-0.5 font-semibold tabular-nums text-emerald-600">{bs(totalPaid)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo pendiente</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${totalQuoted - totalPaid > 0 ? "text-red-600" : "text-slate-800"}`}>
                  {bs(totalQuoted - totalPaid)}
                </div>
              </div>
            </div>
            {canSeeCuentas && (
              <Link
                href={`/cuentas?p=${patient.id}`}
                className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg transition-colors"
              >
                Gestionar cuenta →
              </Link>
            )}
          </div>
        </section>
      )}

      {recetasEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recetas emitidas</h2>
          <PrescriptionsPanel
            patientId={patient.id}
            prescriptions={prescriptionRows}
            canWrite={canClinical}
          />
        </section>
      )}

      {consentimientosEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Consentimientos</h2>
          <ConsentsPanel
            patientId={patient.id}
            patientName={patient.full_name}
            doctorName={profile?.fullName ?? ""}
            clinicName={clinicName}
            consents={consentRows}
            templates={consentTemplateList}
            appointments={consentAppts}
            canWrite={canClinical}
          />
        </section>
      )}
    </div>
  );
}
