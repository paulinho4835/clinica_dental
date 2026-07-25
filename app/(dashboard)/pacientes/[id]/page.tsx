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
import type { TeethMap } from "@/lib/odontogram/types";
import { PEDIATRIC_QUADRANTS, PEDIATRIC_QUADRANT_NUMBERS } from "@/lib/odontogram/pediatricTypes";
import { savePediatricOdontogram } from "@/app/(dashboard)/pacientes/pediatric-odontogram-actions";
import { money, calcAge } from "@/lib/format";
import { getClinicCurrency } from "@/lib/superadmin";
import Link from "next/link";
import { normalizeFeatures } from "@/lib/features";
import { PerioPanel, type PerioExamRow } from "@/components/perio/PerioPanel";
import type { PerioMeasurements } from "@/lib/perio/types";
import { AnamnesisPanel } from "@/components/patients/AnamnesisPanel";
import { parseAnamnesis } from "@/lib/schemas/anamnesis";
import { REFERRAL_SOURCE_LABEL } from "@/lib/schemas/patient-intake";
import { CustomIntakeAnswers } from "@/components/patients/CustomIntakeAnswers";
import { fetchPatientPlanItems } from "@/lib/treatments/planItems";
import { TratamientoTab } from "@/components/patients/lazy-tabs/TratamientoTab";
import { CuentaTab } from "@/components/patients/lazy-tabs/CuentaTab";
import { DocumentosTab } from "@/components/patients/lazy-tabs/DocumentosTab";
import { SettingsTabs, type SettingsTab } from "@/components/ui/SettingsTabs";
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, referral_source, referral_source_other, allergies, medical_alerts, anamnesis, anamnesis_data, evolution, custom_intake_answers")
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

  // Solo lo necesario para la pestaña por defecto (Historia clínica) y el
  // encabezado se pide en la carga inicial de la página. Tratamiento, Cuenta
  // y Documentos se piden bajo demanda (ver components/patients/lazy-tabs) —
  // antes se calculaban siempre las 4 pestañas aunque el usuario solo mirara
  // una, pagando ese costo de CPU/queries en cada visita a la ficha.
  const [{ data: rawOdoEvents }, { data: clinicRow }] = await Promise.all([
    supabase
      .from("odontogram_events")
      .select("id, tooth_fdi, surface, prev_state, new_state, created_at, actor:profiles(id, full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("clinics")
      .select("features, name")
      .eq("id", patient.clinic_id)
      .single(),
  ]);

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

  const features = normalizeFeatures(clinicRow?.features);

  // Saldo del encabezado: solo lo calculan admin/recepción/colega (canBilling);
  // los doctores lo ven acotado a lo suyo dentro de la pestaña "Cuenta"
  // (lazy). Misma fórmula que /cuentas y /api/patients/[id]/balance.
  let totalQuoted = 0;
  let totalPaid = 0;
  if (canBilling) {
    const [{ data: works }, { data: payments }, planItems] = await Promise.all([
      supabase.from("doctor_works").select("cost, treatment_item_id").eq("patient_id", id),
      supabase.from("payments").select("amount").eq("patient_id", id),
      fetchPatientPlanItems(supabase, id),
    ]);
    const itemIdsWithWork = new Set(
      (works ?? [])
        .map((w) => w.treatment_item_id as string | null)
        .filter((wid): wid is string => !!wid),
    );
    const unstartedPlanItemsTotal = planItems
      .filter((item) => !itemIdsWithWork.has(item.id))
      .reduce((s, item) => s + item.price, 0);
    totalQuoted = (works ?? []).reduce((s, w) => s + Number(w.cost), 0) + unstartedPlanItemsTotal;
    totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
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

  const clinicName = (clinicRow as { name?: string; features?: unknown } | null)?.name ?? "";
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

  const historiaClinica = (
    <>
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

      <CustomIntakeAnswers
        answers={((patient as { custom_intake_answers?: unknown }).custom_intake_answers as IntakeAnswerSnapshot[] | null) ?? []}
      />

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
    </>
  );

  const tabs: SettingsTab[] = [
    { id: "historia", label: "Historia clínica", content: historiaClinica },
    {
      id: "tratamiento",
      label: "Tratamiento",
      content: (
        <TratamientoTab
          patientId={patient.id}
          legacyEvolution={(patient as { evolution?: string | null }).evolution ?? null}
        />
      ),
    },
    {
      id: "cuenta",
      label: "Cuenta",
      content: <CuentaTab patientId={patient.id} canSeeCuentas={canSeeCuentas} />,
    },
    {
      id: "documentos",
      label: "Documentos",
      content: <DocumentosTab patientId={patient.id} />,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-bold">
            {patient.full_name}
            {calcAge(patient.dob) !== null && (
              <span className="text-2xl font-bold text-slate-400">{calcAge(patient.dob)} años</span>
            )}
          </h1>
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
          {patient.national_id && <span>CI: {patient.national_id}</span>}
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

      <SettingsTabs tabs={tabs} />
    </div>
  );
}
