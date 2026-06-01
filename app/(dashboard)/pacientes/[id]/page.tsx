import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { OdontogramEditor } from "@/components/odontogram/OdontogramEditor";
import {
  PatientHistoryPanel,
  type PaymentRow,
} from "@/components/history/PatientHistoryPanel";
import {
  TreatmentPlanPanel,
  type Work,
} from "@/components/treatments/TreatmentPlanPanel";
import type { TeethMap } from "@/lib/odontogram/types";
import { bs } from "@/lib/format";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, dob, phone, email, allergies, medical_alerts, anamnesis")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const { data: odo } = await supabase
    .from("odontograms")
    .select("teeth")
    .eq("patient_id", id)
    .maybeSingle();

  const profile = await getProfile();
  const canClinical = can(profile?.role, "clinical:write");
  const canBilling = can(profile?.role, "billing:write");

  const [{ data: rawPlans }, { data: payments }] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "id, treatment_phases(treatment_items(id, price, status, custom_name, created_at, procedure:procedure_catalog(name)))",
      )
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, method, received_at")
      .eq("patient_id", id)
      .order("received_at", { ascending: false }),
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
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const paymentRows: PaymentRow[] = (payments ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    method: p.method as string,
    receivedAt: p.received_at as string,
  }));

  const totalQuoted = works.reduce((s, w) => s + w.price, 0);
  const totalPaid = paymentRows.reduce((s, p) => s + p.amount, 0);

  const teeth = (odo?.teeth as TeethMap) ?? {};

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">{patient.full_name}</h1>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {patient.dob && <span>Nac.: {patient.dob}</span>}
          {patient.phone && <span>Tel.: {patient.phone}</span>}
          <span>Saldo: {bs(totalQuoted - totalPaid)}</span>
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
        <TreatmentPlanPanel patientId={patient.id} canWrite={canClinical} works={works} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Historial del paciente</h2>
        <PatientHistoryPanel
          patientId={patient.id}
          canClinical={canClinical}
          canBilling={canBilling}
          works={works}
          payments={paymentRows}
          totalQuoted={totalQuoted}
          totalPaid={totalPaid}
        />
      </section>
    </div>
  );
}
