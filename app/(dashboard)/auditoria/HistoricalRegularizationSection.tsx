import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicCurrency } from "@/lib/superadmin";
import { money } from "@/lib/format";
import { HistoricalRegularizationPanel, type HistoricalWorkRow } from "@/components/audit/HistoricalRegularizationPanel";

export async function HistoricalRegularizationSection() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return null;
  const supabase = await createClient();
  const [{ data: rawWorks }, { data: decisions }, currency] = await Promise.all([
    supabase.from("doctor_works").select("id, patient_id, description, cost, performed_at, commission_paid, commission_paid_amount, staff_payment_id, patient:patients!doctor_works_patient_id_fkey(full_name), doctor:profiles!doctor_works_doctor_id_fkey(full_name)").eq("clinic_id", profile.clinicId).is("treatment_item_id", null).order("performed_at", { ascending: true }),
    supabase.from("audit_log").select("id, action, created_at, diff, actor:profiles!audit_log_actor_id_fkey(full_name)").eq("clinic_id", profile.clinicId).eq("entity", "doctor_work").like("action", "historical_work_%").order("created_at", { ascending: false }).limit(100),
    getClinicCurrency(),
  ]);
  const patientIds = [...new Set((rawWorks ?? []).map((w) => w.patient_id as string))];
  const [{ data: planRows }, { data: payments }] = patientIds.length ? await Promise.all([
    supabase.from("treatment_plans").select("id, patient_id").in("patient_id", patientIds),
    supabase.from("payments").select("id, patient_id, amount, received_at").in("patient_id", patientIds).is("treatment_item_id", null).order("received_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  // Se cargan las relaciones en consultas simples para que un fallo de una
  // relación opcional del catálogo no deje vacío el selector completo.
  const planIds = (planRows ?? []).map((p) => p.id as string);
  const { data: phaseRows } = planIds.length
    ? await supabase.from("treatment_phases").select("id, plan_id").in("plan_id", planIds)
    : { data: [] };
  const phaseIds = (phaseRows ?? []).map((p) => p.id as string);
  const { data: itemRows } = phaseIds.length
    ? await supabase.from("treatment_items").select("id, phase_id, price, custom_name, status, procedure_id").in("phase_id", phaseIds)
    : { data: [] };
  const procedureIds = [...new Set((itemRows ?? []).map((i) => i.procedure_id as string | null).filter(Boolean))] as string[];
  const { data: procedureRows } = procedureIds.length
    ? await supabase.from("procedure_catalog").select("id, name").in("id", procedureIds)
    : { data: [] };
  const planPatientById = new Map((planRows ?? []).map((p) => [p.id as string, p.patient_id as string]));
  const phasePlanById = new Map((phaseRows ?? []).map((p) => [p.id as string, p.plan_id as string]));
  const procedureNameById = new Map((procedureRows ?? []).map((p) => [p.id as string, p.name as string]));
  const itemsByPatient = new Map<string, HistoricalWorkRow["planItems"]>();
  for (const item of itemRows ?? []) {
    if (item.status === "cancelled") continue;
    const planId = phasePlanById.get(item.phase_id as string);
    const patientId = planId ? planPatientById.get(planId) : null;
    if (!patientId) continue;
    const target = itemsByPatient.get(patientId) ?? [];
    target.push({ id: item.id as string, name: procedureNameById.get(item.procedure_id as string) ?? (item.custom_name as string) ?? "Sin nombre", price: Number(item.price) });
    itemsByPatient.set(patientId, target);
  }
  const paymentByPatient = new Map<string, HistoricalWorkRow["payments"]>();
  for (const payment of payments ?? []) {
    const target = paymentByPatient.get(payment.patient_id as string) ?? [];
    target.push({ id: payment.id as string, amount: Number(payment.amount), receivedAt: payment.received_at as string });
    paymentByPatient.set(payment.patient_id as string, target);
  }
  const rows: HistoricalWorkRow[] = (rawWorks ?? []).map((w) => ({
    id: w.id as string, patientId: w.patient_id as string,
    patientName: (w.patient as { full_name?: string } | null)?.full_name ?? "Paciente sin nombre",
    doctorName: (w.doctor as { full_name?: string } | null)?.full_name ?? "Sin doctor",
    description: w.description as string, cost: Number(w.cost), performedAt: w.performed_at as string,
    commissionBlocked: Boolean(w.commission_paid || Number(w.commission_paid_amount) > 0 || w.staff_payment_id),
    planItems: itemsByPatient.get(w.patient_id as string) ?? [], payments: paymentByPatient.get(w.patient_id as string) ?? [],
  }));
  return <>
    <HistoricalRegularizationPanel rows={rows} currency={currency} />
    {(decisions ?? []).length > 0 && <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Decisiones de regularizacion</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3">Trabajo</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Motivo</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{(decisions ?? []).map((d) => {
            const diff = (d.diff ?? {}) as { reason?: string; before?: { description?: string; cost?: number }; approved_price?: number };
            const labels: Record<string, string> = { historical_work_link: "Vinculado", historical_work_create: "Creado en plan", historical_work_deleted_duplicate: "Duplicado eliminado" };
            return <tr key={d.id}><td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(d.created_at as string).toLocaleString("es-BO")}</td><td className="px-4 py-3 font-medium">{labels[d.action as string] ?? d.action}</td><td className="px-4 py-3">{diff.before?.description ?? "—"}{diff.approved_price != null && <span className="ml-2 text-slate-500">{money(Number(diff.approved_price), currency)}</span>}</td><td className="px-4 py-3">{(d.actor as { full_name?: string } | null)?.full_name ?? "Sistema"}</td><td className="px-4 py-3 text-slate-600">{diff.reason ?? "—"}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
