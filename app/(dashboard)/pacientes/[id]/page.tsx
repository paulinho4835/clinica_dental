import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getProfile } from "@/lib/auth";
import { can, canSeeNav } from "@/lib/rbac";
import { OdontogramEditor } from "@/components/odontogram/OdontogramEditor";
import { EditPatientForm } from "@/components/patients/EditPatientForm";
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
  const canClinical = can(profile?.role, "clinical:write");
  const canBilling = can(profile?.role, "billing:write");
  const canSeeCuentas = canSeeNav(profile?.role, "cuentas");

  let dentistsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin"])
    .eq("clinic_id", patient.clinic_id)
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
  ]);

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

  const totalQuoted = works.reduce((s, w) => s + w.price, 0);
  const totalPaid = totalPaidRaw;

  const teeth = (odo?.teeth as TeethMap) ?? {};

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <EditPatientForm patient={patient} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {patient.dob && <span>Nac.: {patient.dob}</span>}
          {patient.phone && <span>Tel.: {patient.phone}</span>}
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

      <section>
        <h2 className="mb-3 text-lg font-semibold">Odontograma</h2>
        <OdontogramEditor patientId={patient.id} initialTeeth={teeth} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel patientId={patient.id} canWrite={canClinical} works={works} dentists={dentists ?? []} recetasEnabled={recetasEnabled} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seguimiento del tratamiento</h2>
        <WorkStatusPanel patientId={patient.id} canWrite={canClinical} works={works} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Evolución del paciente</h2>
        <EvolutionPanel
          patientId={patient.id}
          evolution={(patient as { evolution?: string | null }).evolution ?? null}
          canWrite={canClinical}
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
