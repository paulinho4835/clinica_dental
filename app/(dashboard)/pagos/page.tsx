import Link from "next/link";
import { requireNavAccess } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { boliviaTodayISO, bs, fmtBoliviaTime } from "@/lib/format";
import {
  COMMISSION_ROLES,
  sumPendingCommissions,
  summarizePendingByDoctor,
  isOverdue,
  daysSince,
} from "@/lib/pagos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertTriangle, Banknote, Receipt, Users } from "lucide-react";
import { StaffPaymentForm, type Payee } from "@/components/pagos/StaffPaymentForm";
import { PagosFilter } from "@/components/pagos/PagosFilter";
import { DeletePaymentButton } from "@/components/pagos/DeletePaymentButton";
import { DisbursedToggle } from "@/components/pagos/DisbursedToggle";
import { PrintPagosButton, type PrintPaymentRow } from "@/components/pagos/PrintPagosButton";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  recepcionista: "Recepcionista",
  colega: "Colega",
  asistente: "Asistente",
};

// Tabla del historial (una sola persona → sin columnas Trabajador/Rol).
const GRID =
  "grid grid-cols-[7rem_minmax(0,1.5fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4";

type WorkDetail = {
  description: string;
  patient_name: string | null;
  performed_at: string;
  // Monto abonado a este trabajo EN ESTE pago (bitácora staff_payment_works).
  // Con adelantos parciales ya no coincide con la comisión total del trabajo.
  paid_amount: number;
  // true si el abono no cubrió la comisión completa del trabajo (adelanto).
  is_partial: boolean;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  concept: string | null;
  paid_at: string;
  created_at: string;
  disbursed: boolean;
  works: WorkDetail[];
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });
}

// doctor_works.patient_name suele quedar vacío cuando el trabajo está vinculado
// a un paciente real (patient_id) — el nombre vive en el join a `patients`.
// Mismo patrón de resolución que work-actions.ts (fetchDoctorUnpaidWorks).
function resolveWorkPatientName(w: {
  patient_name?: string | null;
  patients?: { full_name?: string } | { full_name?: string }[] | null;
}): string | null {
  const joined = Array.isArray(w.patients) ? w.patients[0] : w.patients;
  return joined?.full_name ?? w.patient_name ?? null;
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string; month?: string; view?: string }>;
}) {
  await requireNavAccess("pagos");
  const supabase = await createClient();
  const profile = await getProfile();

  const { q = "", p: selectedKey, month, view } = await searchParams;
  const showOverdueView = view === "pendientes";
  const today = boliviaTodayISO();
  const currentMonth = today.slice(0, 7);
  const selectedMonth = month ?? currentMonth;
  const isAllMonths = selectedMonth === "all";

  const [year, monthNum] = isAllMonths ? [0, 0] : selectedMonth.split("-").map(Number);
  const monthStart = isAllMonths ? "" : `${selectedMonth}-01`;
  const nextMonthStart = isAllMonths ? "" : new Date(year, monthNum, 1).toISOString().slice(0, 10);

  // ── Panel izquierdo: personas + comisiones pendientes ─────────────────
  const platformAdminIds = await getPlatformAdminIds();
  let empQuery = supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("clinic_id", profile!.clinicId)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    empQuery = empQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }
  if (q.trim()) empQuery = empQuery.ilike("full_name", `%${q.trim()}%`);

  // Recepcionistas sin cuenta de login (tabla clinic_receptionists). Se les
  // puede registrar pagos (sueldo) aunque no hagan trabajos clínicos.
  let recepQuery = supabase
    .from("clinic_receptionists")
    .select("id, name")
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("name");
  if (q.trim()) recepQuery = recepQuery.ilike("name", `%${q.trim()}%`);

  // Comisiones no saldadas de toda la clínica → badge "Bs X pendiente" por
  // persona. Query liviana: solo trabajos con commission_paid=false.
  const pendingQuery = supabase
    .from("doctor_works")
    .select("doctor_id, commission_amount, lab_commission_amount, commission_paid_amount")
    .eq("clinic_id", profile!.clinicId)
    .eq("commission_paid", false);

  const [{ data: employees }, { data: receptionists }, { data: pendingRaw }] =
    await Promise.all([empQuery, recepQuery, pendingQuery]);

  const pendingByDoctor = sumPendingCommissions(
    (pendingRaw ?? []).map((r) => ({
      doctor_id: r.doctor_id as string,
      commission_amount: Number(r.commission_amount),
      lab_commission_amount: Number(r.lab_commission_amount),
      commission_paid_amount: Number(r.commission_paid_amount ?? 0),
    })),
  );

  const payees: Payee[] = [
    ...(employees ?? []).map((e) => ({
      key: `p:${e.id}`,
      id: e.id as string,
      full_name: e.full_name as string,
      role: e.role as string,
      kind: "profile" as const,
    })),
    ...(receptionists ?? []).map((r) => ({
      key: `r:${r.id}`,
      id: r.id as string,
      full_name: r.name as string,
      role: "recepcionista",
      kind: "receptionist" as const,
    })),
  ];

  // Persona inexistente o de otra clínica → no está en payees → placeholder.
  const selectedPayee = payees.find((pp) => pp.key === selectedKey) ?? null;

  // ── Vista "Pagos pendientes": comisiones atrasadas de toda la clínica ──
  // Solo se consulta cuando se pide la vista (evita el costo en la carga normal).
  type OverdueRow = { payee: Payee; amount: number; days: number };
  let overdueRows: OverdueRow[] = [];

  if (showOverdueView) {
    const { data: overdueRaw } = await supabase
      .from("doctor_works")
      .select("doctor_id, commission_amount, lab_commission_amount, commission_paid_amount, performed_at")
      .eq("clinic_id", profile!.clinicId)
      .eq("commission_paid", false);

    const summaryByDoctor = summarizePendingByDoctor(
      (overdueRaw ?? []).map((r) => ({
        doctor_id: r.doctor_id as string,
        commission_amount: Number(r.commission_amount),
        lab_commission_amount: Number(r.lab_commission_amount),
        commission_paid_amount: Number(r.commission_paid_amount ?? 0),
        performed_at: r.performed_at as string,
      })),
    );

    overdueRows = payees
      .filter((pp) => pp.kind === "profile" && COMMISSION_ROLES.has(pp.role))
      .flatMap((pp) => {
        const summary = summaryByDoctor.get(pp.id);
        if (!summary || !isOverdue(summary.oldestPerformedAt, today)) return [];
        return [{ payee: pp, amount: summary.amount, days: daysSince(summary.oldestPerformedAt, today) }];
      })
      .sort((a, b) => b.days - a.days);
  }

  // ── Panel derecho: detalle de la persona seleccionada ─────────────────
  let rows: PaymentRow[] = [];
  let paidMonth = 0;
  let pendingDisburse = 0;

  if (selectedPayee) {
    let paymentsQuery = supabase
      .from("staff_payments")
      .select("id, amount, method, concept, paid_at, created_at, disbursed")
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (selectedPayee.kind === "receptionist") {
      paymentsQuery = paymentsQuery.eq("receptionist_id", selectedPayee.id);
    } else {
      paymentsQuery = paymentsQuery.eq("employee_id", selectedPayee.id);
    }
    if (!isAllMonths) {
      paymentsQuery = paymentsQuery.gte("paid_at", monthStart).lt("paid_at", nextMonthStart);
    }

    const { data: rawPayments } = await paymentsQuery;

    const baseRows = (rawPayments ?? []).map((p) => ({
      id: p.id as string,
      amount: Number(p.amount),
      method: p.method as string,
      concept: p.concept as string | null,
      paid_at: p.paid_at as string,
      created_at: p.created_at as string,
      disbursed: Boolean(p.disbursed),
    }));

    // Traer los abonos asociados a los pagos visibles.
    // Fuente principal: la bitácora staff_payment_works (monto abonado real, que
    // con adelantos parciales difiere de la comisión total). Fallback legacy:
    // pagos anteriores a la bitácora, vinculados solo por doctor_works.staff_payment_id.
    const paymentIds = baseRows.map((r) => r.id);
    const worksByPayment = new Map<string, WorkDetail[]>();

    if (paymentIds.length > 0) {
      const [{ data: ledgerRaw }, { data: legacyRaw }] = await Promise.all([
        supabase
          .from("staff_payment_works")
          .select(
            "staff_payment_id, amount, work:doctor_works(description, patient_name, performed_at, commission_amount, lab_commission_amount, patients(full_name))",
          )
          .in("staff_payment_id", paymentIds),
        supabase
          .from("doctor_works")
          .select(
            "id, staff_payment_id, description, patient_name, performed_at, commission_amount, lab_commission_amount, patients(full_name)",
          )
          .in("staff_payment_id", paymentIds)
          .order("performed_at", { ascending: false }),
      ]);

      const ledgeredPayments = new Set<string>();
      for (const row of ledgerRaw ?? []) {
        const pid = row.staff_payment_id as string;
        ledgeredPayments.add(pid);
        const w = row.work as {
          description?: string;
          patient_name?: string | null;
          performed_at?: string;
          commission_amount?: number;
          lab_commission_amount?: number;
          patients?: { full_name?: string } | { full_name?: string }[] | null;
        } | null;
        if (!w) continue;
        const commTotal = Number(w.commission_amount) + Number(w.lab_commission_amount);
        if (!worksByPayment.has(pid)) worksByPayment.set(pid, []);
        worksByPayment.get(pid)!.push({
          description: (w.description as string) ?? "",
          patient_name: resolveWorkPatientName(w),
          performed_at: (w.performed_at as string) ?? "",
          paid_amount: Number(row.amount),
          is_partial: Number(row.amount) < commTotal - 0.005,
        });
      }
      for (const list of worksByPayment.values()) {
        list.sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
      }

      // Legacy: solo pagos SIN filas en la bitácora (el flujo viejo marcaba la
      // comisión completa, así que el abono mostrado es la comisión total).
      for (const w of legacyRaw ?? []) {
        const pid = w.staff_payment_id as string;
        if (ledgeredPayments.has(pid)) continue;
        if (!worksByPayment.has(pid)) worksByPayment.set(pid, []);
        worksByPayment.get(pid)!.push({
          description: w.description as string,
          patient_name: resolveWorkPatientName(w),
          performed_at: w.performed_at as string,
          paid_amount: Number(w.commission_amount) + Number(w.lab_commission_amount),
          is_partial: false,
        });
      }
    }

    rows = baseRows.map((r) => ({ ...r, works: worksByPayment.get(r.id) ?? [] }));
    paidMonth = rows.filter((p) => p.disbursed).reduce((s, p) => s + p.amount, 0);
    pendingDisburse = rows.filter((p) => !p.disbursed).reduce((s, p) => s + p.amount, 0);
  }

  const monthLabel = isAllMonths
    ? "Todos los meses"
    : new Date(monthStart + "T12:00:00").toLocaleDateString("es-BO", {
        month: "long",
        year: "numeric",
      });

  const pendingCommission =
    selectedPayee && selectedPayee.kind === "profile" && COMMISSION_ROLES.has(selectedPayee.role)
      ? (pendingByDoctor.get(selectedPayee.id) ?? 0)
      : null;

  const printRows: PrintPaymentRow[] = rows.map((r) => ({
    id: r.id,
    employeeName: selectedPayee?.full_name ?? "—",
    employeeRole: selectedPayee?.role ?? "",
    amount: r.amount,
    method: r.method,
    concept: r.concept,
    paid_at: r.paid_at,
    disbursed: r.disbursed,
    works: r.works,
  }));

  const qParam = q.trim() ? `q=${encodeURIComponent(q.trim())}&` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos a personal"
        subtitle="Registra y controla los pagos realizados a doctores, recepcionistas y personal de la clínica."
        action={
          <Link
            href="/pagos?view=pendientes"
            className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10"
          >
            <AlertTriangle className="h-4 w-4" />
            Pagos pendientes
          </Link>
        }
      />

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Panel izquierdo: búsqueda + lista de personas. En móvil se oculta al
            elegir a alguien (evita el layout de 2 columnas apretado). */}
        <div
          className={`w-full space-y-3 md:w-64 md:shrink-0 ${
            selectedPayee || showOverdueView ? "hidden md:block" : ""
          }`}
        >
          <form method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </form>

          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {payees.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={q ? `Sin resultados para “${q}”` : "Aún no hay personal"}
                description={
                  q
                    ? "Prueba con otro nombre."
                    : "Registra doctores o recepcionistas para pagarles aquí."
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {payees.map((pp) => {
                  const pending =
                    pp.kind === "profile" && COMMISSION_ROLES.has(pp.role)
                      ? (pendingByDoctor.get(pp.id) ?? 0)
                      : 0;
                  return (
                    <Link
                      key={pp.key}
                      href={`/pagos?${qParam}p=${pp.key}`}
                      className={`block px-3 py-2 transition-colors hover:bg-slate-50 ${
                        selectedKey === pp.key
                          ? "border-l-2 border-clinic bg-clinic/5"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {pp.full_name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {ROLE_LABEL[pp.role] ?? pp.role}
                          </div>
                        </div>
                        {pending > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:bg-amber-500/10">
                            {bs(pending)}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: detalle de pagos, o la vista "Pagos pendientes" cuando
            se pide vía ?view=pendientes. En móvil solo se muestra cuando hay
            alguien elegido o esta vista está activa (ver arriba). */}
        <div className={`min-w-0 flex-1 ${!selectedPayee && !showOverdueView ? "hidden md:block" : ""}`}>
          {showOverdueView ? (
            <div className="space-y-4">
              <Link
                href="/pagos"
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-clinic"
              >
                ← Volver
              </Link>
              <div>
                <h2 className="text-lg font-semibold">Pagos pendientes</h2>
                <p className="text-xs text-slate-400">
                  Comisiones sin pagar hace más de 30 días, de más a menos atrasada.
                </p>
              </div>
              {overdueRows.length === 0 ? (
                <EmptyState
                  icon={<AlertTriangle className="h-6 w-6" />}
                  title="Sin comisiones atrasadas"
                  description="Nadie tiene comisiones sin pagar hace más de 30 días."
                />
              ) : (
                <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                  <div className="divide-y divide-slate-100">
                    {overdueRows.map(({ payee, amount, days }) => (
                      <Link
                        key={payee.key}
                        href={`/pagos?p=${payee.key}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {payee.full_name}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {ROLE_LABEL[payee.role] ?? payee.role} · {days} días de atraso
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:bg-amber-500/10">
                          {bs(amount)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !selectedPayee ? (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white text-sm text-slate-400 ring-1 ring-slate-200">
              Selecciona a una persona para ver sus pagos
            </div>
          ) : (
            <div className="space-y-4">
              <Link
                href={`/pagos?${qParam}`}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-clinic md:hidden"
              >
                ← Volver a la lista
              </Link>

              <div>
                <h2 className="text-lg font-semibold">{selectedPayee.full_name}</h2>
                <p className="text-xs text-slate-400">
                  {ROLE_LABEL[selectedPayee.role] ?? selectedPayee.role}
                </p>
              </div>

              {/* Tarjetas de resumen */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {pendingCommission !== null && (
                  <Stat
                    label="Comisión pendiente"
                    value={bs(pendingCommission)}
                    icon={<Receipt className="h-5 w-5" />}
                    valueClassName={pendingCommission > 0 ? "text-amber-600" : "text-emerald-600"}
                  />
                )}
                <Stat
                  label={`Pagado — ${monthLabel}`}
                  value={bs(paidMonth)}
                  icon={<Banknote className="h-5 w-5" />}
                  valueClassName="text-emerald-600"
                />
                {pendingDisburse > 0 && (
                  <Stat
                    label="Pendiente de desembolso"
                    value={bs(pendingDisburse)}
                    icon={<Receipt className="h-5 w-5" />}
                    valueClassName="text-amber-600"
                  />
                )}
              </div>

              {/* Formulario (incluye el panel de trabajos pendientes).
                  key={...} resetea el estado del form al cambiar de persona. */}
              <StaffPaymentForm key={selectedPayee.key} payee={selectedPayee} today={today} />

              {/* Historial de pagos de la persona */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <PagosFilter selectedMonth={selectedMonth} />
                  <PrintPagosButton rows={printRows} monthLabel={monthLabel} />
                </div>

                {/* ── Lista en tarjetas (solo móvil) ───────────────────── */}
                <div className="space-y-2 sm:hidden">
                  {rows.map((p) => (
                    <div key={p.id} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {p.concept ?? "Pago"}
                          </p>
                          <p className="text-xs text-slate-400">{fmtDate(p.paid_at)}</p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-right tabular-nums font-semibold text-emerald-600">
                          {bs(p.amount)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          {METHOD_LABEL[p.method] ?? p.method}
                        </span>
                        <DisbursedToggle id={p.id} disbursed={p.disbursed} />
                      </div>

                      {p.works.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                          {p.works.map((w, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="shrink-0 tabular-nums text-slate-400">
                                {fmtShortDate(w.performed_at)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-slate-600">
                                {w.description || "—"}
                                {w.patient_name && (
                                  <span className="text-slate-400"> · {w.patient_name}</span>
                                )}
                              </span>
                              {w.is_partial && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10">
                                  abono
                                </span>
                              )}
                              <span className="shrink-0 whitespace-nowrap tabular-nums font-medium text-clinic">
                                {bs(w.paid_amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
                        <DeletePaymentButton id={p.id} />
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <EmptyState
                      icon={<Receipt className="h-6 w-6" />}
                      title="Sin pagos en este período"
                      description="Ajusta el mes o registra un pago con el formulario."
                    />
                  )}
                </div>

                {/* ── Tabla (escritorio) ───────────────────────────────── */}
                <div className="hidden overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200 sm:block">
                  <div className="min-w-[42rem]">
                    <div className={`${GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                      <span>Fecha</span>
                      <span>Concepto</span>
                      <span>Método</span>
                      <span className="text-right">Monto</span>
                      <span>Desembolso</span>
                      <span />
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((p) => (
                        <div key={p.id}>
                          {/* Fila principal del pago */}
                          <div
                            className={`${GRID} px-4 py-2.5 text-sm transition hover:bg-slate-50/70 ${p.works.length > 0 ? "" : "border-b border-slate-100 last:border-b-0"}`}
                          >
                            <div className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                              <div>{fmtDate(p.paid_at)}</div>
                              <div className="text-slate-300">{fmtBoliviaTime(p.created_at)}</div>
                            </div>
                            <span className="truncate text-slate-600">
                              {p.concept ?? <span className="text-slate-400">—</span>}
                            </span>
                            <span className="text-slate-500 whitespace-nowrap">
                              {METHOD_LABEL[p.method] ?? p.method}
                            </span>
                            <span className="text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                              {bs(p.amount)}
                            </span>
                            <div>
                              <DisbursedToggle id={p.id} disbursed={p.disbursed} />
                            </div>
                            <div className="flex justify-end">
                              <DeletePaymentButton id={p.id} />
                            </div>
                          </div>

                          {/* Sub-filas: trabajos incluidos en este pago */}
                          {p.works.length > 0 && (
                            <div className="border-b border-slate-100 bg-slate-50/50 px-4 pb-2.5 last:border-b-0">
                              <div className="ml-[7.5rem] space-y-0.5">
                                {p.works.map((w, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-3 rounded px-2 py-1 text-xs text-slate-500"
                                  >
                                    <span className="w-10 shrink-0 tabular-nums text-slate-400">
                                      {fmtShortDate(w.performed_at)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-slate-600">
                                      {w.description || "—"}
                                    </span>
                                    {w.patient_name && (
                                      <span className="shrink-0 text-slate-400">
                                        {w.patient_name}
                                      </span>
                                    )}
                                    {w.is_partial && (
                                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10">
                                        abono parcial
                                      </span>
                                    )}
                                    <span className="tabular-nums font-medium text-clinic whitespace-nowrap">
                                      {bs(w.paid_amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <EmptyState
                          icon={<Receipt className="h-6 w-6" />}
                          title="Sin pagos en este período"
                          description="Ajusta el mes o registra un pago con el formulario."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
