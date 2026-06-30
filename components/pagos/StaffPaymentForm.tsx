"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaffPayment, type ActionState } from "@/app/(dashboard)/pagos/actions";
import { fetchDoctorUnpaidWorks, type UnpaidWork } from "@/app/(dashboard)/pagos/work-actions";
import { bs } from "@/lib/format";
import { toast } from "@/lib/toast";

// Agrupación de trabajos pendientes por ítem del plan de tratamiento.
// Varias cuotas/sesiones del mismo tratamiento se muestran como una sola
// barra de progreso (el avance del pago del paciente es por tratamiento).
type WorkGroup = {
  key: string;
  name: string;
  workIds: string[];
  commission: number;
  planItemPrice: number;
  planItemPaid: number;
  performed_at: string;
  patient_name: string | null;
  hasBar: boolean;
};

type Employee = { id: string; full_name: string; role: string };

const DOCTOR_ROLES = new Set(["odontologo_general", "especialista"]);

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  recepcionista: "Recepcionista",
  asistente: "Asistente",
};

const initial: ActionState = {};

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function StaffPaymentForm({
  employees,
  today,
}: {
  employees: Employee[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createStaffPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [unpaidWorks, setUnpaidWorks] = useState<UnpaidWork[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fetching, startFetch] = useTransition();

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const isDoctor = selectedEmployee ? DOCTOR_ROLES.has(selectedEmployee.role) : false;

  // Agrupar trabajos por treatment_item_id → una barra por tratamiento.
  // Los trabajos sin plan (manuales) quedan como grupo individual sin barra.
  const groups = useMemo<WorkGroup[]>(() => {
    const map = new Map<string, WorkGroup>();
    for (const w of unpaidWorks) {
      const key = w.planItemId ?? `work:${w.id}`;
      const comm = w.commission_amount + w.lab_commission_amount;
      const existing = map.get(key);
      if (existing) {
        existing.workIds.push(w.id);
        existing.commission += comm;
        if (w.performed_at > existing.performed_at) existing.performed_at = w.performed_at;
      } else {
        map.set(key, {
          key,
          name: w.planItemId ? w.planItemName : w.description,
          workIds: [w.id],
          commission: comm,
          planItemPrice: w.planItemPrice,
          planItemPaid: w.planItemPaid,
          performed_at: w.performed_at,
          patient_name: w.patient_name,
          hasBar: w.planItemPrice > 0,
        });
      }
    }
    return Array.from(map.values());
  }, [unpaidWorks]);

  function onEmployeeChange(id: string) {
    setEmployeeId(id);
    setSelectedIds(new Set());
    setUnpaidWorks([]);
    setAmount("");
    setConcept("");

    const emp = employees.find((e) => e.id === id);
    if (emp && DOCTOR_ROLES.has(emp.role)) {
      startFetch(async () => {
        const works = await fetchDoctorUnpaidWorks(id);
        setUnpaidWorks(works);
      });
    }
  }

  function calcFromSelection(next: Set<string>) {
    const selected = unpaidWorks.filter((w) => next.has(w.id));
    const total = selected.reduce(
      (s, w) => s + w.commission_amount + w.lab_commission_amount,
      0,
    );
    const descs = [...new Set(selected.map((w) => w.description).filter(Boolean))];
    setAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    const conceptStr =
      descs.length > 4
        ? `Comisiones: ${descs.slice(0, 4).join(", ")} (+${descs.length - 4} más)`
        : descs.length > 0
          ? `Comisiones: ${descs.join(", ")}`
          : "";
    setConcept(conceptStr);
  }

  function toggleGroup(g: WorkGroup) {
    const next = new Set(selectedIds);
    const allSelected = g.workIds.every((id) => next.has(id));
    if (allSelected) g.workIds.forEach((id) => next.delete(id));
    else g.workIds.forEach((id) => next.add(id));
    setSelectedIds(next);
    calcFromSelection(next);
  }

  function selectAll() {
    const next = new Set(unpaidWorks.map((w) => w.id));
    setSelectedIds(next);
    calcFromSelection(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAmount("");
    setConcept("");
  }

  useEffect(() => {
    if (state.ok) {
      toast("Pago registrado", "success");
      formRef.current?.reset();
      setAmount("");
      setConcept("");
      setSelectedIds(new Set());
      // Mantener el empleado seleccionado y refrescar sus trabajos pendientes,
      // para que los que se acaban de pagar desaparezcan sin necesidad de F5.
      if (employeeId && isDoctor) {
        startFetch(async () => {
          const works = await fetchDoctorUnpaidWorks(employeeId);
          setUnpaidWorks(works);
        });
      } else {
        setUnpaidWorks([]);
      }
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <p className="text-sm font-medium text-slate-700">Registrar pago</p>

      {/* employee_id y work_ids via hidden inputs (valores controlados) */}
      <input type="hidden" name="employee_id" value={employeeId} />
      {Array.from(selectedIds).map((id) => (
        <input key={id} type="hidden" name="work_ids" value={id} />
      ))}

      {/* Fila 1: Empleado + Fecha */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Pagar a *</span>
          <select
            required
            value={employeeId}
            onChange={(e) => onEmployeeChange(e.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          >
            <option value="" disabled>— Selecciona persona —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name} ({ROLE_LABEL[e.role] ?? e.role})
              </option>
            ))}
          </select>
        </label>

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
      </div>

      {/* Panel de trabajos — solo para doctores */}
      {isDoctor && (
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
                {selectedIds.size > 0 && (
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

          {!fetching && employeeId && unpaidWorks.length === 0 && (
            <p className="py-1 text-xs text-slate-400">Sin comisiones pendientes.</p>
          )}

          {!fetching && unpaidWorks.length > 0 && (
            <div className="overflow-hidden rounded border border-slate-200 bg-white">
              {groups.map((g) => {
                const checked = g.workIds.every((id) => selectedIds.has(id));
                const pct = g.planItemPrice > 0 ? Math.min(100, (g.planItemPaid / g.planItemPrice) * 100) : 0;
                const paid = pct >= 99.9;
                const barColor = paid
                  ? "bg-emerald-500"
                  : pct > 0
                    ? "bg-amber-400"
                    : "bg-slate-200";
                const sessions = g.workIds.length;
                return (
                  <label
                    key={g.key}
                    className={`flex cursor-pointer flex-col gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-0 transition ${
                      checked ? "bg-clinic/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(g)}
                        className="accent-clinic shrink-0"
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
                        <span className="max-w-[8rem] truncate text-xs text-slate-400">
                          {g.patient_name}
                        </span>
                      )}
                      <span className="whitespace-nowrap tabular-nums text-xs font-medium text-clinic">
                        {bs(g.commission)}
                      </span>
                    </div>
                    {g.hasBar && (
                      <div className="ml-6 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`whitespace-nowrap tabular-nums text-xs ${paid ? "text-emerald-600 font-medium" : "text-slate-400"}`}>
                          {paid ? "Saldado ✓" : `${bs(g.planItemPaid)} / ${bs(g.planItemPrice)}`}
                        </span>
                      </div>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20">
              <span className="text-xs text-slate-500">
                {selectedIds.size} trabajo{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <span className="tabular-nums font-semibold text-clinic">{bs(Number(amount) || 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* Fila 2: Monto + Método + Concepto */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Monto (Bs) *</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
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
          disabled={pending || !employeeId}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Registrar pago"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
