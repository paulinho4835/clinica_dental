"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaffPayment, type ActionState } from "@/app/(dashboard)/pagos/actions";
import { fetchDoctorUnpaidWorks, type UnpaidWork } from "@/app/(dashboard)/pagos/work-actions";
import { bs } from "@/lib/format";

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

  function toggleWork(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
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
      formRef.current?.reset();
      setEmployeeId("");
      setAmount("");
      setConcept("");
      setUnpaidWorks([]);
      setSelectedIds(new Set());
      router.refresh();
    }
  }, [state, router]);

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
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
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
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
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
              {unpaidWorks.map((w) => {
                const commission = w.commission_amount + w.lab_commission_amount;
                const checked = selectedIds.has(w.id);
                return (
                  <label
                    key={w.id}
                    className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 transition ${
                      checked ? "bg-clinic/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWork(w.id)}
                      className="accent-clinic shrink-0"
                    />
                    <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                      {fmtShortDate(w.performed_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{w.description}</span>
                    {w.patient_name && (
                      <span className="max-w-[8rem] truncate text-xs text-slate-400">
                        {w.patient_name}
                      </span>
                    )}
                    <span className="whitespace-nowrap tabular-nums text-xs font-medium text-clinic">
                      {bs(commission)}
                    </span>
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
            className="w-28 rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Método</span>
          <select
            name="method"
            defaultValue="cash"
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
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
            className="w-full min-w-[200px] rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
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
