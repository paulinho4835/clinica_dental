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
  const [{ data: plans }, { data: payments }] = patientIds.length ? await Promise.all([
    supabase.from("treatment_plans").select("patient_id, treatment_phases(treatment_items(id, price, custom_name, status, procedure:procedure_catalog(name)))").in("patient_id", patientIds),
    supabase.from("payments").select("id, patient_id, amount, received_at").in("patient_id", patientIds).is("treatment_item_id", null).order("received_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const itemsByPatient = new Map<string, HistoricalWorkRow["planItems"]>();
  for (const plan of plans ?? []) {
    const target = itemsByPatient.get(plan.patient_id as string) ?? [];
    for (const phase of (plan.treatment_phases as Record<string, unknown>[]) ?? []) for (const item of (phase.treatment_items as Record<string, unknown>[]) ?? []) {
      if (item.status === "cancelled") continue;
      target.push({ id: item.id as string, name: ((item.procedure as { name?: string } | null)?.name ?? item.custom_name as string) || "Sin nombre", price: Number(item.price) });
    }
    itemsByPatient.set(plan.patient_id as string, target);
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
