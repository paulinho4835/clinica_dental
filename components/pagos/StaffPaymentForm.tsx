"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaffPayment, type ActionState } from "@/app/(dashboard)/pagos/actions";
import { fetchDoctorUnpaidWorks, type UnpaidWork } from "@/app/(dashboard)/pagos/work-actions";
import { TreatmentProgressBar } from "@/components/treatments/TreatmentProgressBar";
import { COMMISSION_ROLES, isOverdue } from "@/lib/pagos";
import { bs } from "@/lib/format";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";

// Agrupación de trabajos pendientes por ítem del plan de tratamiento.
// Varias cuotas/sesiones del mismo tratamiento se muestran como una sola
// barra de progreso (el avance del pago del paciente es por tratamiento).
type WorkGroup = {
  key: string;
  name: string;
  // Trabajos del grupo ordenados del más antiguo al más nuevo; los abonos
  // parciales se asignan en ese orden (primero se salda la cuota más vieja).
  // performed_at/description/commission_pct alimentan la tabla de detalle que
  // se muestra al seleccionar el grupo.
  works: {
    id: string;
    remaining: number;
    performed_at: string;
    description: string;
    commission_pct: number;
  }[];
  commission: number;
  // Comisión ya abonada (adelantos) y restante por pagar del grupo.
  commissionPaid: number;
  remaining: number;
  planItemPrice: number;
  planItemPaid: number;
  performed_at: string;
  patient_name: string | null;
  hasBar: boolean;
};

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
    month: "2-digit",
  });
}

// La persona viene fijada por la selección del panel izquierdo (layout
// maestro-detalle) — este form ya no tiene dropdown "Pagar a". El padre debe
// montarlo con key={payee.key} para resetear el estado al cambiar de persona.
export function StaffPaymentForm({
  payee,
  today,
}: {
  payee: Payee;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createStaffPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [unpaidWorks, setUnpaidWorks] = useState<UnpaidWork[]>([]);
  // Grupos seleccionados y el monto a abonar a cada uno (editable: permite
  // adelantos parciales). key del grupo → monto como string del input.
  const [groupAmounts, setGroupAmounts] = useState<Map<string, string>>(new Map());
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

  // Agrupar trabajos por treatment_item_id → una barra por tratamiento.
  // Los trabajos sin plan (manuales) quedan como grupo individual sin barra.
  const groups = useMemo<WorkGroup[]>(() => {
    const map = new Map<string, WorkGroup>();
    for (const w of unpaidWorks) {
      const key = w.planItemId ?? `work:${w.id}`;
      const comm = w.commission_amount + w.lab_commission_amount;
      const paid = w.commission_paid_amount;
      const remaining = Math.max(0, Math.round((comm - paid) * 100) / 100);
      const existing = map.get(key);
      if (existing) {
        existing.works.push({
          id: w.id,
          remaining,
          performed_at: w.performed_at,
          description: w.description,
          commission_pct: w.commission_pct,
        });
        existing.commission += comm;
        existing.commissionPaid += paid;
        existing.remaining = Math.round((existing.remaining + remaining) * 100) / 100;
        if (w.performed_at > existing.performed_at) existing.performed_at = w.performed_at;
      } else {
        map.set(key, {
          key,
          name: w.planItemId ? w.planItemName : w.description,
          works: [
            {
              id: w.id,
              remaining,
              performed_at: w.performed_at,
              description: w.description,
              commission_pct: w.commission_pct,
            },
          ],
          commission: comm,
          commissionPaid: paid,
          remaining,
          planItemPrice: w.planItemPrice,
          planItemPaid: w.planItemPaid,
          performed_at: w.performed_at,
          patient_name: w.patient_name,
          hasBar: w.planItemPrice > 0,
        });
      }
    }
    // Dentro de cada grupo, cuota más antigua primero: los abonos se asignan
    // en ese orden. unpaidWorks llega del server ordenado descendente.
    for (const g of map.values()) g.works.reverse();
    return Array.from(map.values());
  }, [unpaidWorks]);

  // Reparte el abono de cada grupo seleccionado entre sus trabajos (cuota más
  // antigua primero, hasta el restante de cada una) → pares work_ids/work_amounts
  // que viajan como hidden inputs al server action.
  const allocations = useMemo(() => {
    const out: { workId: string; amount: number }[] = [];
    for (const g of groups) {
      const raw = groupAmounts.get(g.key);
      if (raw === undefined) continue;
      let left = Math.round((Number(raw) || 0) * 100) / 100;
      for (const w of g.works) {
        if (left <= 0) break;
        const alloc = Math.min(left, w.remaining);
        if (alloc > 0) out.push({ workId: w.id, amount: Math.round(alloc * 100) / 100 });
        left = Math.round((left - alloc) * 100) / 100;
      }
    }
    return out;
  }, [groups, groupAmounts]);

  const allocatedTotal = useMemo(
    () => Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100,
    [allocations],
  );
  const hasSelection = groupAmounts.size > 0;

  function syncDerived(next: Map<string, string>) {
    setGroupAmounts(next);
    const selected = groups.filter((g) => next.has(g.key));
    const total = selected.reduce((s, g) => s + (Number(next.get(g.key)) || 0), 0);
    setAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    const descs = [...new Set(selected.map((g) => g.name).filter(Boolean))];
    const conceptStr =
      descs.length > 4
        ? `Comisiones: ${descs.slice(0, 4).join(", ")} (+${descs.length - 4} más)`
        : descs.length > 0
          ? `Comisiones: ${descs.join(", ")}`
          : "";
    setConcept(conceptStr);
  }

  function toggleGroup(g: WorkGroup) {
    const next = new Map(groupAmounts);
    if (next.has(g.key)) next.delete(g.key);
    else next.set(g.key, String(g.remaining)); // por defecto: saldar el restante
    syncDerived(next);
  }

  function setGroupAmount(g: WorkGroup, value: string) {
    const next = new Map(groupAmounts);
    next.set(g.key, value);
    syncDerived(next);
  }

  function selectAll() {
    const next = new Map<string, string>();
    for (const g of groups) if (g.remaining > 0) next.set(g.key, String(g.remaining));
    syncDerived(next);
  }

  function clearSelection() {
    setGroupAmounts(new Map());
    setAmount("");
    setConcept("");
  }

  // Un abono inválido (vacío, 0 o mayor al restante) bloquea el submit.
  const invalidGroup = groups.find((g) => {
    const raw = groupAmounts.get(g.key);
    if (raw === undefined) return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n <= 0 || n > g.remaining + 0.005;
  });

  useEffect(() => {
    if (state.ok) {
      toast("Pago registrado", "success");
      formRef.current?.reset();
      setAmount("");
      setConcept("");
      setGroupAmounts(new Map());
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
      message: `¿Confirmas registrar un pago de ${bs(Number(amount) || 0)} a ${payee.full_name}?`,
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
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Trabajos pendientes de comisión
            </span>
            {unpaidWorks.length > 0 && (
              <div className="flex gap-3">
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

          {!fetching && unpaidWorks.length > 0 && (
            <div className="overflow-hidden rounded border border-slate-200 bg-white">
              {groups.map((g) => {
                const checked = groupAmounts.has(g.key);
                const rawAmount = groupAmounts.get(g.key) ?? "";
                const amountNum = Number(rawAmount);
                const amountInvalid =
                  checked &&
                  (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > g.remaining + 0.005);
                const sessions = g.works.length;
                // % de comisión representativo del grupo (todas las cuotas de un
                // mismo tratamiento comparten el mismo % configurado).
                const commissionPct = g.works[0]?.commission_pct;
                return (
                  <div
                    key={g.key}
                    className={`flex flex-col gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-0 transition ${
                      checked ? "bg-clinic/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <label
                      className={`flex items-center gap-3 ${
                        g.remaining > 0 ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={g.remaining <= 0}
                        onChange={() => toggleGroup(g)}
                        className="accent-clinic shrink-0 disabled:opacity-30"
                      />
                      <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                        {fmtShortDate(g.performed_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {g.name}
                        {sessions > 1 && (
                          <span className="ml-1.5 text-xs text-slate-400">({sessions} cuotas)</span>
                        )}
                      </span>
                      {g.patient_name && (
                        <span className="shrink-0 text-xs text-slate-400">
                          {g.patient_name}
                        </span>
                      )}
                      <span
                        className={`whitespace-nowrap tabular-nums text-xs font-medium ${
                          g.remaining <= 0 ? "text-emerald-600" : "text-clinic"
                        }`}
                      >
                        {g.remaining <= 0
                          ? "Comisión saldada ✓"
                          : g.commissionPaid > 0
                            ? bs(g.remaining)
                            : bs(g.commission)}
                      </span>
                      {commissionPct !== undefined && (
                        <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                          ({commissionPct}%)
                        </span>
                      )}
                      {g.remaining > 0 && isOverdue(g.performed_at, today) && (
                        <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10">
                          atrasado
                        </span>
                      )}
                    </label>
                    {/* Comisión con abono previo: mostrar el avance del doctor */}
                    {g.commissionPaid > 0 && g.remaining > 0 && (
                      <p className="ml-6 text-xs text-amber-600">
                        Abonado {bs(g.commissionPaid)} de {bs(g.commission)} — restan {bs(g.remaining)}
                      </p>
                    )}
                    {/* Barra del PACIENTE (pagos del tratamiento): informativa,
                        independiente de la comisión — no desaparece hasta que
                        el paciente salde, sin importar los adelantos al doctor.
                        El rótulo evita confundirla con la comisión del doctor. */}
                    {g.hasBar && (
                      <div className="ml-6">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Pago del paciente
                        </span>
                        <TreatmentProgressBar paid={g.planItemPaid} total={g.planItemPrice} />
                      </div>
                    )}
                    {/* Detalle al seleccionar: una fila por sesión/cuota del grupo. */}
                    {checked && (
                      <div className="ml-6 overflow-hidden rounded border border-slate-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                              <th className="px-3 py-2 font-medium">Fecha</th>
                              <th className="px-3 py-2 font-medium">Paciente</th>
                              <th className="px-3 py-2 font-medium">Tratamiento</th>
                              <th className="px-3 py-2 text-right font-medium">Monto pagado</th>
                              <th className="px-3 py-2 text-right font-medium">% Comisión</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {g.works.map((w) => (
                              <tr key={w.id}>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                                  {fmtShortDate(w.performed_at)}
                                </td>
                                <td className="px-3 py-2 text-slate-700">{g.patient_name ?? "—"}</td>
                                <td className="px-3 py-2 text-slate-700">{w.description || "—"}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                                  {bs(g.planItemPaid)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-slate-700">
                                  {w.commission_pct}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* Monto a abonar (editable → adelanto parcial) */}
                    {checked && (
                      <div className="ml-6 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                          Abonar Bs
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={g.remaining}
                            value={rawAmount}
                            onChange={(e) => setGroupAmount(g, e.target.value)}
                            className={`w-24 rounded border bg-white px-2 py-1 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-1 ${
                              amountInvalid
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                : "border-slate-300 focus:border-clinic focus:ring-clinic"
                            }`}
                          />
                        </label>
                        {amountNum > 0 && amountNum < g.remaining - 0.005 && !amountInvalid && (
                          <span className="text-xs text-slate-400">
                            adelanto parcial — quedarán {bs(Math.round((g.remaining - amountNum) * 100) / 100)} pendientes
                          </span>
                        )}
                        {amountInvalid && (
                          <span className="text-xs text-red-600">
                            máximo {bs(g.remaining)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasSelection && (
            <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20">
              <span className="text-xs text-slate-500">
                {groupAmounts.size} tratamiento{groupAmounts.size !== 1 ? "s" : ""} seleccionado{groupAmounts.size !== 1 ? "s" : ""}
              </span>
              <span className="tabular-nums font-semibold text-clinic">{bs(allocatedTotal)}</span>
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
          disabled={pending || Boolean(invalidGroup)}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Registrar pago"}
        </button>
        {invalidGroup && (
          <span className="text-xs text-red-600">
            Corrige el abono de "{invalidGroup.name}" (máximo {bs(invalidGroup.remaining)}).
          </span>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
