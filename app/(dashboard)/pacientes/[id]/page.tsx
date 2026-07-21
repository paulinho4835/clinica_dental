import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getProfile } from "@/lib/auth";
import { can, canSeeNav, canEditAnamnesis } from "@/lib/rbac";
import { OdontogramEditor } from "@/components/odontogram/OdontogramEditor";
import { OdontogramHistory } from "@/components/odontogram/OdontogramHistory";
import { OdontogramTabs } from "@/components/odontogram/OdontogramTabs";
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
import { PEDIATRIC_QUADRANTS, PEDIATRIC_QUADRANT_NUMBERS } from "@/lib/odontogram/pediatricTypes";
import { savePediatricOdontogram } from "@/app/(dashboard)/pacientes/pediatric-odontogram-actions";
import { money } from "@/lib/format";
import { getClinicCurrency } from "@/lib/superadmin";
import Link from "next/link";
import { normalizeFeatures, fotosEnabled as fotosFeatureEnabled, photoQuota } from "@/lib/features";
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
import { PerioPanel, type PerioExamRow } from "@/components/perio/PerioPanel";
import type { PerioMeasurements } from "@/lib/perio/types";
import { AnamnesisPanel } from "@/components/patients/AnamnesisPanel";
import { PhotosPanel, type PhotoItem } from "@/components/patients/PhotosPanel";
import { isR2Configured, presignDownload } from "@/lib/r2";
import { parseAnamnesis } from "@/lib/schemas/anamnesis";
import { REFERRAL_SOURCE_LABEL } from "@/lib/schemas/patient-intake";
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
    .select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, referral_source, referral_source_other, allergies, medical_alerts, anamnesis, anamnesis_data, evolution")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const profile = await getProfile();
  const currency = await getClinicCurrency();

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
  // Registro clínico (evolución y odontograma): admin, doctores y colega pueden
  // modificar (NO recepcionista, aunque ésta tenga clinical:write para otras cosas).
  const canEditClinical =
    profile?.role === "admin" ||
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista" ||
    profile?.role === "colega";
  // Doctores y colega: vista restringida del paciente (solo lectura de datos
  // personales, editan únicamente alergias y alertas médicas).
  const isDoctor =
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista" ||
    profile?.role === "colega";
  // Teléfono/email/dirección: solo admin, recepción y colega los ven.
  const hidePhone =
    profile?.role === "odontologo_general" || profile?.role === "especialista";

  // Solo doctores activos en el selector de asignación de tratamientos; los
  // trabajos ya registrados conservan el nombre del doctor aunque se desactive.
  let dentistsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin", "colega"])
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
      .select("id, author_id, author_name, body, note_type, appointment_id, subjective, objective, assessment, plan, created_at, updated_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_evolution_note_history")
      .select("id, note_id, author_id, author_name, body, note_type, subjective, objective, assessment, plan, action, changed_at")
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
  const fotosEnabled = fotosFeatureEnabled(features);
  const fotosQuota = photoQuota(clinicRow?.features);

  // Fotos del paciente: el binario vive en R2; aquí solo cargamos referencias y
  // generamos URLs firmadas de lectura (bucket privado). Solo si el addon está
  // encendido y R2 configurado.
  const r2Ready = isR2Configured();
  let photos: PhotoItem[] = [];
  // Fotos usadas por TODA la clínica (el tope es por clínica, no por paciente).
  let clinicPhotoCount = 0;
  if (fotosEnabled && r2Ready) {
    const { count: clinicCount } = await supabase
      .from("patient_photos")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", patient.clinic_id);
    clinicPhotoCount = clinicCount ?? 0;

    const { data: photoRows } = await supabase
      .from("patient_photos")
      .select("id, storage_key, kind, caption, created_at, uploader:uploaded_by(full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false });
    photos = await Promise.all(
      (photoRows ?? []).map(async (p) => ({
        id: p.id as string,
        url: await presignDownload(p.storage_key as string),
        kind: (p.kind as string | null) ?? null,
        caption: (p.caption as string | null) ?? null,
        createdAt: p.created_at as string,
        uploaderName:
          ((p.uploader as { full_name?: string } | null)?.full_name) ?? null,
      })),
    );
  }

  // Periodontograma (addon "periodontograma"): exámenes periodontales fechados.
  // Solo se consultan si el addon está encendido para la clínica.
  const perioEnabled = features.periodontograma;
  let perioExams: PerioExamRow[] = [];
  if (perioEnabled) {
    const { data: perioRows } = await supabase
      .from("perio_exams")
      .select("id, exam_date, author_id, author_name, measurements, diagnosis, notes")
      .eq("patient_id", id)
      .order("exam_date", { ascending: false })
      .order("created_at", { ascending: false });
    perioExams = (perioRows ?? []).map((e) => ({
      id: e.id as string,
      examDate: e.exam_date as string,
      // El nombre de un platform-admin (superadmin) nunca se expone en la clínica.
      authorName: platformAdminIdSet.has((e.author_id as string | null) ?? "")
        ? null
        : ((e.author_name as string | null) ?? null),
      measurements: ((e.measurements as PerioMeasurements) ?? {}) as PerioMeasurements,
      diagnosis: (e.diagnosis as string | null) ?? "",
      notes: (e.notes as string | null) ?? "",
    }));
  }

  // Odontograma pediátrico (addon "odontograma_pediatrico"): dentición
  // temporal, independiente del odontograma de adultos. Mismo patrón que
  // perioExams: solo se consulta si el addon está encendido.
  const odontogramaPediatricoEnabled = features.odontograma_pediatrico;
  const odontogramVoiceEnabled = features.odontogram_dictado_voz;
  let teethPediatric: TeethMap = {};
  let odoPedEvents: {
    id: string;
    tooth_fdi: string;
    surface: string | null;
    prev_state: string | null;
    new_state: string | null;
    created_at: string;
    actor_name: string | null;
  }[] = [];
  if (odontogramaPediatricoEnabled) {
    const { data: odoPed } = await supabase
      .from("odontograms_pediatric")
      .select("teeth")
      .eq("patient_id", id)
      .maybeSingle();
    teethPediatric = (odoPed?.teeth as TeethMap) ?? {};

    const { data: rawOdoPedEvents } = await supabase
      .from("odontogram_pediatric_events")
      .select("id, tooth_fdi, surface, prev_state, new_state, created_at, actor:profiles(id, full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false });
    odoPedEvents = (rawOdoPedEvents ?? []).map((e) => {
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
  }

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

  // Última invitación de historial (estado + propuesta pendiente de revisión).
  const { data: lastInvite } = await supabase
    .from("anamnesis_invitations")
    .select(
      "id, expires_at, completed_at, reviewed_at, review_action, submitted_data, submitted_allergies, submitted_alerts, created_at",
    )
    .eq("patient_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const invitation = lastInvite
    ? {
        id: lastInvite.id as string,
        completedAt: (lastInvite.completed_at as string | null) ?? null,
        expiresAt: lastInvite.expires_at as string,
        reviewedAt: (lastInvite.reviewed_at as string | null) ?? null,
        reviewAction:
          (lastInvite.review_action as "applied" | "discarded" | null) ?? null,
        proposed:
          lastInvite.completed_at && !lastInvite.reviewed_at
            ? {
                data: parseAnamnesis(lastInvite.submitted_data),
                allergies: (lastInvite.submitted_allergies as string[] | null) ?? [],
                alerts: (lastInvite.submitted_alerts as string[] | null) ?? [],
              }
            : null,
      }
    : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <div className="flex items-start gap-2">
            {canEditClinical && (
              <Link
                href={`/pacientes/${patient.id}/expediente`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Imprimir expediente
              </Link>
            )}
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
          {patient.phone && !hidePhone && <span>Tel.: {patient.phone}</span>}
          {patient.referral_source && (
            <span>
              Nos conoció por:{" "}
              {REFERRAL_SOURCE_LABEL[patient.referral_source] ?? patient.referral_source}
              {patient.referral_source === "otro" &&
                patient.referral_source_other &&
                ` (${patient.referral_source_other})`}
            </span>
          )}
          {canBilling && <span>Saldo: {money(totalQuoted - totalPaid, currency)}</span>}
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

      <section>
        <h2 className="mb-3 text-lg font-semibold">Antecedentes médicos</h2>
        <AnamnesisPanel
          patientId={patient.id}
          patientName={patient.full_name}
          patientPhone={patient.phone ?? null}
          clinicName={clinicName}
          invitation={invitation}
          anamnesis={parseAnamnesis((patient as { anamnesis_data?: unknown }).anamnesis_data)}
          allergies={patient.allergies ?? []}
          medicalAlerts={patient.medical_alerts ?? []}
          legacyAnamnesis={(() => { const v = (patient as { anamnesis?: unknown }).anamnesis; return typeof v === "string" ? v : v != null ? JSON.stringify(v) : null; })()}
          canEdit={canEditAnamnesis(profile?.role)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="mb-3 text-lg font-semibold">Odontograma</h2>
        {odontogramaPediatricoEnabled ? (
          // Addon activo: un solo bloque con selector Adulto / Pediátrico para
          // no recargar la ficha con dos odontogramas apilados.
          <OdontogramTabs
            adult={
              <>
                <OdontogramEditor
                  patientId={patient.id}
                  initialTeeth={teeth}
                  canWrite={canEditClinical}
                  voiceEnabled={odontogramVoiceEnabled}
                />
                <OdontogramHistory events={odoEvents} canSeeHistory={canSeeHistory} />
              </>
            }
            pediatric={
              <>
                <OdontogramEditor
                  patientId={patient.id}
                  initialTeeth={teethPediatric}
                  canWrite={canEditClinical}
                  quadrants={PEDIATRIC_QUADRANTS}
                  quadrantNumbers={PEDIATRIC_QUADRANT_NUMBERS}
                  saveAction={savePediatricOdontogram}
                />
                <OdontogramHistory events={odoPedEvents} canSeeHistory={canSeeHistory} />
              </>
            }
          />
        ) : (
          <>
            <OdontogramEditor
              patientId={patient.id}
              initialTeeth={teeth}
              canWrite={canEditClinical}
              voiceEnabled={odontogramVoiceEnabled}
            />
            <OdontogramHistory events={odoEvents} canSeeHistory={canSeeHistory} />
          </>
        )}
      </section>

      {perioEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Periodontograma</h2>
          <PerioPanel
            patientId={patient.id}
            exams={perioExams}
            canWrite={canEditClinical}
            canDelete={profile?.role === "admin"}
          />
        </section>
      )}

      {fotosEnabled && (
        <section>
          <PhotosPanel
            patientId={patient.id}
            photos={photos}
            canManage={canEditClinical}
            configured={r2Ready}
            atLimit={clinicPhotoCount >= fotosQuota}
            clinicQuota={fotosQuota}
            // El número de fotos solo se revela a la clínica si tiene el addon
            // "Ver contador de fotos". El superadmin lo ve siempre desde su panel.
            clinicUsed={features.fotos_contador ? clinicPhotoCount : undefined}
            showCounter={features.fotos_contador}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel patientId={patient.id} canWrite={canClinical} canDelete={profile?.role === "admin"} works={works} dentists={dentists ?? []} catalog={catalog} recetasEnabled={recetasEnabled} currency={currency} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seguimiento del tratamiento</h2>
        <WorkStatusPanel patientId={patient.id} canWrite={canClinical} works={works} currency={currency} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Evolución del paciente</h2>
        <EvolutionPanel
          patientId={patient.id}
          notes={(evolutionNotes ?? []).map((n) => ({
            id: n.id as string,
            author_id: (n.author_id as string | null) ?? null,
            author_name: platformAdminIdSet.has(n.author_id ?? "")
              ? "Sistema"
              : n.author_name as string,
            body: n.body as string,
            note_type: ((n.note_type as string) === "soap" ? "soap" : "free") as "free" | "soap",
            appointment_id: (n.appointment_id as string | null) ?? null,
            subjective: (n.subjective as string) ?? "",
            objective: (n.objective as string) ?? "",
            assessment: (n.assessment as string) ?? "",
            plan: (n.plan as string) ?? "",
            created_at: n.created_at as string,
            updated_at: n.updated_at as string,
          }))}
          history={(evolutionHistory ?? []).map((h) => ({
            id: h.id as string,
            note_id: h.note_id as string,
            author_name: platformAdminIdSet.has((h as { author_id?: string }).author_id ?? "")
              ? "Sistema"
              : h.author_name as string,
            body: h.body as string,
            note_type: (h.note_type as "free" | "soap" | null) ?? null,
            subjective: (h.subjective as string | null) ?? null,
            objective: (h.objective as string | null) ?? null,
            assessment: (h.assessment as string | null) ?? null,
            plan: (h.plan as string | null) ?? null,
            action: h.action as "edited" | "deleted",
            changed_at: h.changed_at as string,
          }))}
          legacyEvolution={(patient as { evolution?: string | null }).evolution ?? null}
          canWrite={canEditClinical}
          canSeeHistory={canSeeHistory}
          currentUserId={profile?.userId ?? ""}
          appointments={apptRows}
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
                <div className="mt-0.5 font-semibold tabular-nums">{money(totalQuoted, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total pagado</div>
                <div className="mt-0.5 font-semibold tabular-nums text-emerald-600">{money(totalPaid, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo pendiente</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${totalQuoted - totalPaid > 0 ? "text-red-600" : "text-slate-800"}`}>
                  {money(totalQuoted - totalPaid, currency)}
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
