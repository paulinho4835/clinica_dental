"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createStaffPayment, type ActionState } from "@/app/(dashboard)/pagos/actions";
import { fetchDoctorUnpaidWorks, type UnpaidWork } from "@/app/(dashboard)/pagos/work-actions";
import { TreatmentProgressBar } from "@/components/treatments/TreatmentProgressBar";
import { COMMISSION_ROLES, isOverdue } from "@/lib/pagos";
import { money, fmtBoliviaTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";

// Una fila por trabajo, con TODOS los datos visibles de entrada — mismas
// columnas que la tabla de "Mis trabajos". Antes los trabajos se agrupaban por
// tratamiento y había que marcar el checkbox para desplegar el detalle; el
// admin se perdía con eso. Ahora ve todo y solo marca lo que va a pagar.
type WorkRow = UnpaidWork & {
  /** Comisión total del trabajo (propia + laboratorio). */
  commission: number;
  /** Comisión que queda por pagarle al doctor. 0 = ya saldada. */
  remaining: number;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transf.",
};

// Columnas: checkbox · fecha · paciente · cobrado por · trabajo · costo ·
// comisión · cobrado · método · abonar. Sin columna "Doctor": todas las filas
// son del mismo doctor (el destinatario del pago), repetirlo sería ruido.
// La columna "Trabajo" es la más ancha: aloja el nombre + la barra de avance
// del pago del paciente, que es el dato que el admin mira para decidir.
const GRID =
  "grid grid-cols-[1.75rem_4.5rem_minmax(5.5rem,1fr)_minmax(5rem,0.8fr)_minmax(11rem,2.2fr)_5.5rem_6.5rem_5.5rem_5rem_8rem] items-start gap-2";

// "2026-06" → "junio 2026", para el selector de mes.
function monthLabel(ym: string) {
  return new Date(`${ym}-01T12:00:00`).toLocaleDateString("es-BO", {
    month: "long",
    year: "numeric",
  });
}

// Destinatario de un pago: un empleado con cuenta (profiles) o una recepcionista
// sin cuenta (clinic_receptionists). `key` es el id compuesto ("p:uuid"/"r:uuid").
export type Payee = {
  key: string;
  id: string;
  full_name: string;
  role: string;
  kind: "profile" | "receptionist";
};

const initial: ActionState = {};

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
  });
}

// La persona viene fijada por la selección del panel izquierdo (layout
// maestro-detalle) — este form ya no tiene dropdown "Pagar a". El padre debe
// montarlo con key={payee.key} para resetear el estado al cambiar de persona.
export function StaffPaymentForm({
  payee,
  today,
  currency,
  selectedMonth,
  patientQuery = "",
}: {
  payee: Payee;
  today: string;
  currency: string;
  /** Mes elegido en el filtro de la página ("YYYY-MM" o "all"). Filtra los
   *  trabajos pendientes por su fecha: los doctores llevan un cuaderno por mes,
   *  así el admin ve "qué le debo a este doctor de tal mes" y cuadra con él. */
  selectedMonth: string;
  /** Filtro opcional del paciente, compartido con el historial de pagos. */
  patientQuery?: string;
}) {
  const [state, formAction, pending] = useActionState(createStaffPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [unpaidWorks, setUnpaidWorks] = useState<UnpaidWork[]>([]);
  // Trabajos marcados y el monto a abonar a cada uno (editable: permite
  // adelantos parciales). id del trabajo → monto como string del input.
  const [workAmounts, setWorkAmounts] = useState<Map<string, string>>(new Map());
  // El monto a abonar viene BLOQUEADO por defecto (= lo calculado por el
  // sistema). Solo se desbloquea a pedido explícito ("Editar") para el caso
  // real de un adelanto parcial — así un scroll de mouse o un tipeo accidental
  // no puede cambiar cuánto se le paga a un doctor.
  const [editingWorks, setEditingWorks] = useState<Set<string>>(new Set());
  const [fetching, startFetch] = useTransition();
  // Evita repreguntar: tras confirmar, disparamos el submit real y esta bandera
  // deja pasar ese segundo evento sin volver a mostrar el diálogo.
  const skipConfirmRef = useRef(false);

  const isProfile = payee.kind === "profile";
  const earnsCommission = isProfile && COMMISSION_ROLES.has(payee.role);

  // Cargar los trabajos pendientes de la persona al montar. Solo los empleados
  // con cuenta (profiles) que ganan comisión tienen trabajos que cargar.
  useEffect(() => {
    if (!earnsCommission) return;
    startFetch(async () => {
      const works = await fetchDoctorUnpaidWorks(payee.id);
      setUnpaidWorks(works);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payee.id]);

  // Una fila por trabajo, con la comisión total y lo que resta por pagar ya
  // calculados. Sin agrupar: el admin ve la misma granularidad que en la tabla
  // de Mis trabajos, así los montos que compara son los mismos.
  const rows = useMemo<WorkRow[]>(
    () =>
      unpaidWorks.map((w) => {
        const commission = w.commission_amount + w.lab_commission_amount;
        return {
          ...w,
          commission,
          remaining: Math.max(
            0,
            Math.round((commission - w.commission_paid_amount) * 100) / 100,
          ),
        };
      }),
    [unpaidWorks],
  );

  // Filtrar NO deselecciona: si el admin marcó trabajos de junio y luego mira
  // julio, esos abonos siguen contando (el total y el aviso lo dejan claro).
  const patientRows = useMemo(() => {
    const normalizedQuery = patientQuery
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      (row.patient_name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es")
        .includes(normalizedQuery),
    );
  }, [rows, patientQuery]);

  const visibleRows = useMemo(
    () =>
      selectedMonth === "all"
        ? patientRows
        : patientRows.filter((r) => r.performed_at.startsWith(selectedMonth)),
    [patientRows, selectedMonth],
  );

  // Comisión pendiente que el filtro de mes dejó fuera. Se avisa siempre: con un
  // mes elegido, esconder deuda de otros meses sin decirlo es cómo una comisión
  // vieja termina sin pagarse nunca.
  const pendingOutsideMonth = useMemo(() => {
    if (selectedMonth === "all") return 0;
    return (
      Math.round(
        patientRows
          .filter((r) => !r.performed_at.startsWith(selectedMonth))
          .reduce((s, r) => s + r.remaining, 0) * 100,
      ) / 100
    );
  }, [patientRows, selectedMonth]);

  // Pares work_ids/work_amounts que viajan como hidden inputs al server action.
  // Ahora es directo: un trabajo marcado = un abono a ese trabajo.
  const allocations = useMemo(() => {
    const out: { workId: string; amount: number }[] = [];
    for (const r of rows) {
      const raw = workAmounts.get(r.id);
      if (raw === undefined) continue;
      const n = Math.round((Number(raw) || 0) * 100) / 100;
      if (n > 0) out.push({ workId: r.id, amount: n });
    }
    return out;
  }, [rows, workAmounts]);

  const allocatedTotal = useMemo(
    () => Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100,
    [allocations],
  );
  const hasSelection = workAmounts.size > 0;

  // Trabajos marcados que el filtro de mes dejó fuera de pantalla: se avisan en
  // el resumen para que el total nunca sorprenda.
  const hiddenSelectedCount = useMemo(
    () => allocations.filter((a) => !visibleRows.some((r) => r.id === a.workId)).length,
    [allocations, visibleRows],
  );

  function syncDerived(next: Map<string, string>) {
    setWorkAmounts(next);
    const selected = rows.filter((r) => next.has(r.id));
    const total = selected.reduce((s, r) => s + (Number(next.get(r.id)) || 0), 0);
    setAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    const descs = [
      ...new Set(
        selected.map((r) => (r.planItemId ? r.planItemName : r.description)).filter(Boolean),
      ),
    ];
    const conceptStr =
      descs.length > 4
        ? `Comisiones: ${descs.slice(0, 4).join(", ")} (+${descs.length - 4} más)`
        : descs.length > 0
          ? `Comisiones: ${descs.join(", ")}`
          : "";
    setConcept(conceptStr);
  }

  function toggleWork(r: WorkRow) {
    const next = new Map(workAmounts);
    if (next.has(r.id)) {
      next.delete(r.id);
      setEditingWorks((prev) => {
        const s = new Set(prev);
        s.delete(r.id);
        return s;
      });
    } else {
      next.set(r.id, String(r.remaining)); // por defecto: saldar el restante
    }
    syncDerived(next);
  }

  function unlockWorkAmount(id: string) {
    setEditingWorks((prev) => new Set(prev).add(id));
  }

  function setWorkAmount(r: WorkRow, value: string) {
    const next = new Map(workAmounts);
    next.set(r.id, value);
    syncDerived(next);
  }

  // Solo lo que el admin está viendo: con un mes filtrado, "seleccionar todos"
  // no debe arrastrar trabajos de meses que no tiene en pantalla.
  function selectAll() {
    const next = new Map<string, string>();
    for (const r of visibleRows) if (r.remaining > 0) next.set(r.id, String(r.remaining));
    syncDerived(next);
  }

  function clearSelection() {
    setWorkAmounts(new Map());
    setEditingWorks(new Set());
    setAmount("");
    setConcept("");
  }

  // Un abono inválido (vacío, 0 o mayor al restante) bloquea el submit.
  const invalidRow = rows.find((r) => {
    const raw = workAmounts.get(r.id);
    if (raw === undefined) return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n <= 0 || n > r.remaining + 0.005;
  });

  useEffect(() => {
    if (state.ok) {
      toast("Pago registrado", "success");
      formRef.current?.reset();
      setAmount("");
      setConcept("");
      setWorkAmounts(new Map());
      setEditingWorks(new Set());
      // Refrescar los trabajos pendientes de la persona, para que los que se
      // acaban de pagar desaparezcan sin necesidad de F5.
      if (earnsCommission) {
        startFetch(async () => {
          const works = await fetchDoctorUnpaidWorks(payee.id);
          setUnpaidWorks(works);
        });
      }
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Confirma antes de registrar el pago (evita registros por error/doble
  // clic). Al confirmar, reenvía el formulario con skipConfirmRef=true para
  // no volver a preguntar en ese segundo submit.
  async function handleSubmit(e: React.FormEvent) {
    if (skipConfirmRef.current) {
      skipConfirmRef.current = false;
      return;
    }
    e.preventDefault();
    const ok = await confirm({
      title: "Registrar pago",
      message: `¿Confirmas registrar un pago de ${money(Number(amount) || 0, currency)} a ${payee.full_name}?`,
      confirmText: "Sí, registrar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    skipConfirmRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <p className="text-sm font-medium text-slate-700">
        Registrar pago a {payee.full_name}
      </p>

      {/* Destinatario + work_ids via hidden inputs (valores controlados).
          Se manda employee_id O receptionist_id según el tipo de destinatario. */}
      <input type="hidden" name="employee_id" value={isProfile ? payee.id : ""} />
      <input
        type="hidden"
        name="receptionist_id"
        value={payee.kind === "receptionist" ? payee.id : ""}
      />
      {/* Abonos por trabajo: pares alineados work_ids[i] ↔ work_amounts[i]. */}
      {allocations.map((a) => (
        <span key={a.workId}>
          <input type="hidden" name="work_ids" value={a.workId} />
          <input type="hidden" name="work_amounts" value={a.amount} />
        </span>
      ))}

      {/* Panel de trabajos — para quienes ganan comisión (doctores y admin clínico) */}
      {earnsCommission && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Trabajos pendientes de comisión
              {selectedMonth !== "all" && (
                <span className="ml-1.5 font-normal capitalize text-slate-400">
                  · {monthLabel(selectedMonth)}
                </span>
              )}
            </span>
            {unpaidWorks.length > 0 && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-clinic hover:underline">
                  Seleccionar todos
                </button>
                {hasSelection && (
                  <button type="button" onClick={clearSelection} className="text-xs text-slate-400 hover:underline">
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>

          {fetching && (
            <p className="py-2 text-xs text-slate-400">Cargando trabajos…</p>
          )}

          {!fetching && unpaidWorks.length === 0 && (
            <p className="py-1 text-xs text-slate-400">Sin comisiones pendientes.</p>
          )}

          {!fetching && patientQuery && patientRows.length === 0 && (
            <p className="py-1 text-xs text-slate-400">
              No hay trabajos de paciente que coincidan con “{patientQuery}”.
            </p>
          )}

          {!fetching && patientRows.length > 0 && visibleRows.length === 0 && (
            <p className="py-1 text-xs capitalize text-slate-400">
              Sin trabajos en {monthLabel(selectedMonth)}.
            </p>
          )}

          {/* ── Tarjetas (móvil): mismo patrón que el historial de pagos más abajo
              — la tabla de grilla no cabe en una pantalla angosta ni con
              scroll horizontal cómodo, así que en <sm se listan tarjetas con
              todos los datos apilados. ── */}
          {!fetching && visibleRows.length > 0 && (
            <div className="space-y-2 sm:hidden">
              {visibleRows.map((r) => {
                const checked = workAmounts.has(r.id);
                const editing = editingWorks.has(r.id);
                const rawAmount = workAmounts.get(r.id) ?? "";
                const amountNum = Number(rawAmount);
                const amountInvalid =
                  checked &&
                  (!Number.isFinite(amountNum) ||
                    amountNum <= 0 ||
                    amountNum > r.remaining + 0.005);
                const payable = r.remaining > 0;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 text-sm transition ${
                      checked ? "border-clinic/30 bg-clinic/5" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!payable}
                        onChange={() => toggleWork(r)}
                        aria-label={`Pagar comisión de ${r.description}`}
                        className="mt-1 accent-clinic disabled:opacity-30"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-slate-700">
                            {r.planItemId ? r.planItemName : r.description}
                          </span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums text-xs text-slate-400">
                            {fmtShortDate(r.performed_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.patient_name ?? "—"}
                          {r.collected_by_name && ` · cobró ${r.collected_by_name}`}
                        </div>
                        {r.lab_work && (
                          <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            Lab: {r.lab_work}
                          </span>
                        )}
                        {r.planItemPrice > 0 && (
                          <div className="mt-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Pago del paciente
                            </span>
                            <TreatmentProgressBar
                              paid={r.planItemPaid}
                              total={r.planItemPrice}
                              currency={currency}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2 text-xs">
                      <div>
                        <span className="text-slate-400">Costo</span>
                        <div className="tabular-nums text-slate-600">
                          {money(r.cost, currency)}
                          {r.lab_cost > 0 && (
                            <span className="text-amber-600"> +{money(r.lab_cost, currency)} lab</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Cobrado</span>
                        <div className="tabular-nums text-slate-600">
                          {money(r.amount_paid, currency)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Comisión</span>
                        <div className="tabular-nums font-medium text-clinic">
                          {money(r.commission, currency)}{" "}
                          <span className="font-normal text-slate-400">({r.commission_pct}%)</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Método</span>
                        <div className="text-slate-600">
                          {r.payment_method ? (METHOD_LABEL[r.payment_method] ?? r.payment_method) : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!payable && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          Comisión pagada ✓
                        </span>
                      )}
                      {payable && r.commission_paid_amount > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                          Restan {money(r.remaining, currency)}
                        </span>
                      )}
                      {payable && isOverdue(r.performed_at, today) && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10">
                          atrasado
                        </span>
                      )}
                      {r.invoiced === true && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600">
                          Factura ✓
                        </span>
                      )}
                    </div>

                    {checked && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        {editing ? (
                          <label className="block text-xs">
                            <span className="mb-1 block text-slate-500">Abonar</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={r.remaining}
                              value={rawAmount}
                              onChange={(e) => setWorkAmount(r, e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              autoFocus
                              className={`w-full rounded border bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-1 ${
                                amountInvalid
                                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                  : "border-slate-300 focus:border-clinic focus:ring-clinic"
                              }`}
                            />
                          </label>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Abonar</span>
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums font-semibold text-clinic">
                                {money(amountNum, currency)}
                              </span>
                              <button
                                type="button"
                                onClick={() => unlockWorkAmount(r.id)}
                                className="flex items-center gap-1 text-xs text-slate-400 hover:text-clinic"
                                title="Registrar un adelanto parcial"
                              >
                                <Pencil className="h-3 w-3" /> Editar
                              </button>
                            </div>
                          </div>
                        )}
                        {amountInvalid && (
                          <span className="mt-1 block text-right text-xs text-red-600">
                            máx. {money(r.remaining, currency)}
                          </span>
                        )}
                        {!amountInvalid &&
                          amountNum > 0 &&
                          amountNum < r.remaining - 0.005 && (
                            <span className="mt-1 block text-right text-xs text-slate-400">
                              parcial — restarán{" "}
                              {money(Math.round((r.remaining - amountNum) * 100) / 100, currency)}
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tabla (sm+): -mx-3 anula el padding del panel para usar todo el
              ancho disponible; scroll horizontal solo a partir de sm. ── */}
          {!fetching && visibleRows.length > 0 && (
            <div className="-mx-3 hidden overflow-x-auto border-y border-slate-200 bg-white sm:block">
              <div className="min-w-[62rem]">
                {/* Mismas columnas que la tabla de Mis trabajos: el admin ve
                    todo de entrada y solo marca el checkbox de lo que paga. */}
                <div
                  className={`${GRID} border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}
                >
                  <span />
                  <span>Fecha</span>
                  <span>Paciente</span>
                  <span>Cobrado por</span>
                  <span>Trabajo</span>
                  <span className="text-right">Costo</span>
                  <span className="text-right">Comisión</span>
                  <span className="text-right">Cobrado</span>
                  <span>Método</span>
                  <span className="text-right">Abonar</span>
                </div>
                {visibleRows.map((r) => {
                  const checked = workAmounts.has(r.id);
                  const editing = editingWorks.has(r.id);
                  const rawAmount = workAmounts.get(r.id) ?? "";
                  const amountNum = Number(rawAmount);
                  const amountInvalid =
                    checked &&
                    (!Number.isFinite(amountNum) ||
                      amountNum <= 0 ||
                      amountNum > r.remaining + 0.005);
                  const payable = r.remaining > 0;
                  return (
                    <div
                      key={r.id}
                      className={`${GRID} border-b border-slate-100 px-3 py-2.5 text-sm last:border-0 transition ${
                        checked ? "bg-clinic/5" : "hover:bg-slate-50/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!payable}
                        onChange={() => toggleWork(r)}
                        aria-label={`Pagar comisión de ${r.description}`}
                        className="mt-0.5 accent-clinic disabled:opacity-30"
                      />
                      <div className="whitespace-nowrap tabular-nums text-xs leading-tight text-slate-400">
                        <div>{fmtShortDate(r.performed_at)}</div>
                        <div className="text-slate-300">{fmtBoliviaTime(r.created_at)}</div>
                      </div>
                      <span className="truncate font-medium text-slate-700">
                        {r.patient_name ?? "—"}
                      </span>
                      <span className="truncate text-slate-500">
                        {r.collected_by_name ?? <span className="text-slate-300">—</span>}
                      </span>
                      <div className="min-w-0 leading-tight">
                        <span className="block truncate text-slate-600">
                          {r.planItemId ? r.planItemName : r.description}
                        </span>
                        {r.lab_work && (
                          <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            Lab: {r.lab_work}
                          </span>
                        )}
                        {/* Avance del PACIENTE en el tratamiento: explica por qué
                            puede seguir generándose comisión aunque esta fila ya
                            esté saldada (tratamientos largos se cobran por partes).
                            El rótulo evita confundirla con la comisión del doctor. */}
                        {r.planItemPrice > 0 && (
                          <div className="mt-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Pago del paciente
                            </span>
                            <TreatmentProgressBar
                              paid={r.planItemPaid}
                              total={r.planItemPrice}
                              currency={currency}
                            />
                          </div>
                        )}
                      </div>
                      <div className="text-right tabular-nums leading-tight text-slate-600">
                        <span>{money(r.cost, currency)}</span>
                        {r.lab_cost > 0 && (
                          <span className="block text-xs text-amber-600">
                            +{money(r.lab_cost, currency)} lab
                          </span>
                        )}
                      </div>
                      <div className="text-right tabular-nums leading-tight">
                        <span className="font-medium text-clinic">
                          {money(r.commission, currency)}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {r.commission_pct}%{r.lab_cost > 0 && " s/neto"}
                        </span>
                        {!payable && (
                          <span className="block text-xs font-medium text-emerald-600">
                            Pagada ✓
                          </span>
                        )}
                        {payable && r.commission_paid_amount > 0 && (
                          <span className="block text-xs font-medium text-amber-600">
                            Restan {money(r.remaining, currency)}
                          </span>
                        )}
                        {payable && isOverdue(r.performed_at, today) && (
                          <span className="mt-0.5 inline-block rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10">
                            atrasado
                          </span>
                        )}
                      </div>
                      <span className="text-right tabular-nums text-slate-600">
                        {money(r.amount_paid, currency)}
                      </span>
                      <span className="text-slate-500">
                        {r.payment_method ? (
                          (METHOD_LABEL[r.payment_method] ?? r.payment_method)
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                        {r.invoiced === true && (
                          <span className="block text-xs font-medium text-sky-600">Factura ✓</span>
                        )}
                        {r.invoiced === false && (
                          <span className="block text-xs text-slate-400">Sin factura</span>
                        )}
                      </span>
                      {/* Abonar: bloqueado por defecto (= lo que calcula el
                          sistema). "Editar" lo desbloquea a pedido explícito para
                          un adelanto parcial; así un scroll de mouse o un tipeo
                          accidental no cambia cuánto se le paga al doctor. */}
                      <div className="text-right leading-tight">
                        {!checked ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : editing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={r.remaining}
                            value={rawAmount}
                            onChange={(e) => setWorkAmount(r, e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            autoFocus
                            className={`w-full rounded border bg-white px-2 py-1 text-right text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-1 ${
                              amountInvalid
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                : "border-slate-300 focus:border-clinic focus:ring-clinic"
                            }`}
                          />
                        ) : (
                          <>
                            <span className="block tabular-nums font-semibold text-clinic">
                              {money(amountNum, currency)}
                            </span>
                            <button
                              type="button"
                              onClick={() => unlockWorkAmount(r.id)}
                              className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-clinic"
                              title="Registrar un adelanto parcial"
                            >
                              <Pencil className="h-3 w-3" /> Editar
                            </button>
                          </>
                        )}
                        {amountInvalid && (
                          <span className="block text-xs text-red-600">
                            máx. {money(r.remaining, currency)}
                          </span>
                        )}
                        {checked &&
                          !amountInvalid &&
                          amountNum > 0 &&
                          amountNum < r.remaining - 0.005 && (
                            <span className="block text-xs text-slate-400">
                              parcial — restarán{" "}
                              {money(Math.round((r.remaining - amountNum) * 100) / 100, currency)}
                            </span>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deuda de otros meses: visible aunque el filtro la saque de la tabla. */}
          {!fetching && pendingOutsideMonth > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10">
              Además hay {money(pendingOutsideMonth, currency)} de comisión pendiente
              de otros meses. Cambia el mes o usa “Todos los meses” para verla.
            </p>
          )}

          {hasSelection && (
            <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20">
              <span className="text-xs text-slate-500">
                {workAmounts.size} trabajo{workAmounts.size !== 1 ? "s" : ""} seleccionado
                {workAmounts.size !== 1 ? "s" : ""}
                {hiddenSelectedCount > 0 && (
                  <span className="text-amber-600">
                    {" "}
                    ({hiddenSelectedCount} de otro mes, fuera del filtro)
                  </span>
                )}
              </span>
              <span className="tabular-nums font-semibold text-clinic">
                {money(allocatedTotal, currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Campos del pago: Fecha + Monto + Método + Concepto */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Fecha</span>
          <input
            name="paid_at"
            type="date"
            defaultValue={today}
            required
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-slate-500">
            Monto (Bs) *
            {hasSelection && (
              <span className="ml-1 text-slate-400">(suma de los abonos)</span>
            )}
          </span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            readOnly={hasSelection}
            onChange={(e) => setAmount(e.target.value)}
            className={`w-28 rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic ${
              hasSelection ? "bg-slate-50 text-slate-500" : "bg-white"
            }`}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Método</span>
          <select
            name="method"
            defaultValue="cash"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          >
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </label>

        <label className="flex-1 text-xs">
          <span className="mb-1 block text-slate-500">Concepto</span>
          <input
            name="concept"
            type="text"
            maxLength={200}
            placeholder="ej. Salario junio, Bono, Comisión semana..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            className="w-full min-w-[200px] rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || Boolean(invalidRow)}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Registrar pago"}
        </button>
        {invalidRow && (
          <span className="text-xs text-red-600">
            Corrige el abono de "{invalidRow.planItemId ? invalidRow.planItemName : invalidRow.description}" (máximo {money(invalidRow.remaining, currency)}).
          </span>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
