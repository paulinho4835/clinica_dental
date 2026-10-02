import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import {
  PatientHistoryPanel,
  type PaymentRow,
  type WorkDebtRow,
} from "@/components/history/PatientHistoryPanel";
import { fetchPatientPlanItems, type PlanItemRow } from "@/lib/treatments/planItems";
import { calculateTreatmentTotal } from "@/lib/patientAccount";
import { getClinicCurrency } from "@/lib/superadmin";
import { applyPatientSearch } from "@/lib/patientSearchTerms";
import { money, boliviaDateISO, fmtIsoDate } from "@/lib/format";
import { cn } from "@/lib/cn";

// Cuántos deudores se listan (los de mayor saldo). El total de arriba siempre
// suma a todos.
const DEBTORS_LIMIT = 100;

type DebtorRow = {
  patient_id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  balance: number;
  last_payment_at: string | null;
  provisional: boolean;
};

export default async function CuentasPacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string; f?: string }>;
}) {
  await requireNavAccess("cuentas");
  const { q = "", p: selectedId, f } = await searchParams;
  // "Con saldo": cuentas por cobrar ordenadas por monto (patient_balances,
  // 0127, misma fórmula que la ficha). Una búsqueda mira siempre a todos.
  const showDebtors = f === "saldo" && !q.trim();

  const supabase = await createClient();
  const profile = await getProfile();
  const currency = await getClinicCurrency();
  const canBilling = can(profile?.role, "billing:write");
  // Editar/eliminar pagos: acciones sensibles reservadas a administradores.
  const canManagePayments = profile?.role === "admin";

  let patients: { id: string; full_name: string; phone: string | null; national_id: string | null }[] = [];
  let debtors: DebtorRow[] = [];
  let debtTotal = 0;
  let debtCount = 0;

  if (showDebtors) {
    const [{ data: rows }, { data: summary }] = await Promise.all([
      supabase.rpc("patient_balances").limit(DEBTORS_LIMIT),
      supabase.rpc("dash_debt_summary"),
    ]);
    debtors = ((rows ?? []) as DebtorRow[]).map((r) => ({ ...r, balance: Number(r.balance) }));
    const s = (summary?.[0] ?? null) as { total_debt: number; debt_patients: number } | null;
    debtTotal = Number(s?.total_debt ?? 0);
    debtCount = Number(s?.debt_patients ?? 0);
  } else {
    // Lista de pacientes (búsqueda opcional). Aislamiento por clínica explícito
    // (defensa en profundidad) además de la RLS.
    let patientsQuery = supabase
      .from("patients")
      .select("id, full_name, phone, national_id")
      .eq("clinic_id", profile!.clinicId)
      .order("full_name")
      .limit(60);

    // Sin acentos, por palabras y por teléfono. Antes el texto iba crudo dentro
    // de .or(): una coma ("Pérez, Juan") rompía la consulta y la lista salía vacía.
    if (q.trim()) {
      patientsQuery = applyPatientSearch(patientsQuery, q, { phone: true });
    }

    patients = (await patientsQuery).data ?? [];
  }

  // Detalle financiero del paciente seleccionado.
  let selectedPatient: { id: string; full_name: string } | null = null;
  let paymentRows: PaymentRow[] = [];
  let workRows: WorkDebtRow[] = [];
  let planItems: PlanItemRow[] = [];
  let totalQuoted = 0;
  let totalPaid = 0;

  // Doctores y recepcionistas para el formulario de pago.
  const platformAdminIds = await getPlatformAdminIds();

  // Solo usuarios activos: a un desactivado no se le asignan pagos nuevos.
  let doctorsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin", "colega"])
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  // Las recepcionistas viven en clinic_receptionists (no en profiles); columna `name`.
  let recepcionistasQuery = supabase
    .from("clinic_receptionists")
    .select("id, name")
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("name");

  const [{ data: doctors }, { data: recepcionistasRaw }] = await Promise.all([
    doctorsQuery,
    recepcionistasQuery,
  ]);

  // PatientHistoryPanel espera { id, full_name }: mapeamos name -> full_name.
  const recepcionistas = (recepcionistasRaw ?? []).map((r) => ({
    id: r.id as string,
    full_name: r.name as string,
  }));

  if (selectedId) {
    const { data: pat } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", selectedId)
      .single();

    if (pat) {
      selectedPatient = pat as { id: string; full_name: string };

      const [{ data: payments }, { data: works }, items] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, amount, method, note, received_at, doctor_id, doctor:profiles!payments_doctor_id_fkey(full_name), collected_by:clinic_receptionists!payments_collected_by_id_fkey(name)",
          )
          .eq("patient_id", selectedId)
          .order("received_at", { ascending: false }),
        supabase
          .from("doctor_works")
          .select(
            "id, description, cost, performed_at, treatment_item_id, payment_id, lab_work, lab_cost, doctor:profiles!doctor_works_doctor_id_fkey(full_name)",
          )
          .eq("patient_id", selectedId)
          .order("performed_at", { ascending: false }),
        // Misma fuente que /api/patients/[id]/plan-items: precio vs. pagado por
        // tratamiento del plan, para la barra de progreso por tratamiento.
        fetchPatientPlanItems(supabase, selectedId),
      ]);
      planItems = items;

      paymentRows = (payments ?? []).map((p) => ({
        id: p.id as string,
        amount: Number(p.amount),
        method: p.method as string,
        note: p.note as string | null,
        receivedAt: p.received_at as string,
        doctorName:
          ((p.doctor as { full_name?: string } | null)?.full_name) ?? null,
        collectedByName:
          ((p.collected_by as { name?: string } | null)?.name) ?? null,
        labWork:
          ((works ?? []).find((w) => w.payment_id === p.id)?.lab_work as string | null) ?? null,
        labCost: Number((works ?? []).find((w) => w.payment_id === p.id)?.lab_cost ?? 0),
      }));

      workRows = (works ?? []).map((w) => ({
        id: w.id as string,
        description: w.description as string,
        cost: Number(w.cost),
        performedAt: w.performed_at as string,
        doctorName: ((w.doctor as { full_name?: string } | null)?.full_name) ?? null,
      }));

      totalPaid = paymentRows.reduce((s, p) => s + p.amount, 0);

      // El total financiero proviene solo del plan. doctor_works conserva el
      // detalle operativo de sesiones/cuotas y no agrega deuda por separado.
      totalQuoted = calculateTreatmentTotal(planItems);
    }
  }

  // Parámetros de la lista que se conservan al elegir un paciente.
  const qParam = showDebtors
    ? "f=saldo&"
    : q.trim()
      ? `q=${encodeURIComponent(q.trim())}&`
      : "";
  const toggleClass = (active: boolean) =>
    cn(
      "flex-1 rounded-md px-3 py-1.5 text-center transition",
      active ? "bg-white font-semibold text-clinic shadow-sm" : "text-slate-500 hover:text-slate-700",
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Cuentas de pacientes" />

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Panel izquierdo: búsqueda + lista. En móvil se oculta al elegir un
            paciente (evita el layout de 2 columnas apretado en pantallas chicas). */}
        <div
          className={`w-full space-y-3 md:w-72 md:shrink-0 ${
            selectedPatient ? "hidden md:block" : ""
          }`}
        >
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            <Link href="/cuentas" className={toggleClass(!showDebtors)}>
              Todos
            </Link>
            <Link href="/cuentas?f=saldo" className={toggleClass(showDebtors)}>
              Con saldo
            </Link>
          </div>

          <form method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, CI o teléfono…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </form>

          {showDebtors && (
            <div className="rounded-lg bg-red-50 px-4 py-3 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30">
              <div className="text-xs font-medium text-red-700 dark:text-red-300">Por cobrar</div>
              <div className="text-xl font-bold tabular-nums text-red-800 dark:text-red-200">
                {money(debtTotal, currency)}
              </div>
              <div className="text-xs text-red-700 dark:text-red-300">
                {debtCount} paciente{debtCount !== 1 ? "s" : ""} con saldo pendiente
                {debtCount > debtors.length && ` · se muestran los ${debtors.length} de mayor saldo`}
              </div>
            </div>
          )}

          {showDebtors ? (
            <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              {debtors.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="Nadie tiene saldo pendiente"
                  description="Todos los pacientes con plan de tratamiento están al día."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {debtors.map((d) => (
                    <Link
                      key={d.patient_id}
                      href={`/cuentas?${qParam}p=${d.patient_id}`}
                      className={`flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                        selectedId === d.patient_id ? "border-l-2 border-clinic bg-clinic/5" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{d.full_name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {d.last_payment_at
                            ? `Último pago: ${fmtIsoDate(boliviaDateISO(new Date(d.last_payment_at)))}`
                            : "Sin pagos"}
                          {d.provisional && (
                            <span title="Tiene trabajos históricos sin ítem del plan; el saldo puede cambiar al regularizarlos.">
                              {" · provisional"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {money(d.balance, currency)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {(patients ?? []).length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={q ? `Sin resultados para “${q}”` : "Aún no hay pacientes"}
                description={
                  q
                    ? "Prueba con otro nombre, CI o teléfono."
                    : "Registra pacientes para ver sus cuentas aquí."
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {(patients ?? []).map((pat) => (
                  <Link
                    key={pat.id}
                    href={`/cuentas?${qParam}p=${pat.id}`}
                    className={`block px-4 py-3 transition-colors hover:bg-slate-50 ${
                      selectedId === pat.id
                        ? "border-l-2 border-clinic bg-clinic/5"
                        : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800">
                      {pat.full_name}
                    </div>
                    {(pat.national_id || pat.phone) && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {pat.national_id && <span>{pat.national_id}</span>}
                        {pat.national_id && pat.phone && <span> · </span>}
                        {pat.phone && <span>{pat.phone}</span>}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Panel derecho: detalle de cuenta. En móvil solo se muestra cuando
            hay un paciente elegido (ver arriba). */}
        <div className={`min-w-0 flex-1 ${!selectedPatient ? "hidden md:block" : ""}`}>
          {!selectedPatient ? (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white text-sm text-slate-400 ring-1 ring-slate-200">
              Selecciona un paciente para ver su cuenta
            </div>
          ) : (
            <div className="space-y-4">
              <Link
                href={`/cuentas?${qParam}`}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-clinic md:hidden"
              >
                ← Volver a la lista
              </Link>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedPatient.full_name}
                </h2>
                <Link
                  href={`/pacientes/${selectedPatient.id}`}
                  className="text-xs text-clinic hover:underline"
                >
                  Ver ficha clínica →
                </Link>
              </div>
              <PatientHistoryPanel
                patientId={selectedPatient.id}
                canBilling={canBilling}
                canManagePayments={canManagePayments}
                payments={paymentRows}
                works={workRows}
                planItems={planItems}
                doctors={doctors ?? []}
                recepcionistas={recepcionistas ?? []}
                totalQuoted={totalQuoted}
                totalPaid={totalPaid}
                currency={currency}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
