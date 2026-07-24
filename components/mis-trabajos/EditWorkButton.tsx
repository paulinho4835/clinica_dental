"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateDoctorWork, type ActionState } from "@/app/(dashboard)/mis-trabajos/actions";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { money } from "@/lib/format";
import { computeCommission } from "@/lib/commission";
import { toast } from "@/lib/toast";
import { useDismissable } from "@/components/ui/useDismissable";

type WorkData = {
  id: string;
  description: string;
  cost: number;
  commission_pct: number;
  amount_paid: number;
  payment_method: string | null;
  performed_at: string;
  notes: string | null;
  lab_work: string | null;
  lab_cost: number;
  invoiced: boolean | null;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "qr", label: "QR" },
  { value: "card", label: "Tarjeta" },
];

const initial: ActionState = {};

// El scroll del mouse sobre un input number/date enfocado cambia su valor en
// Chrome; quitamos el foco al recibir wheel para que el scroll de la página
// no altere el campo sin querer.
function preventWheelChange(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function EditWorkButton({ work, currency }: { work: WorkData; currency: string }) {
  const [open, setOpen] = useState(false);
  useDismissable(() => setOpen(false), open);
  const boundAction = updateDoctorWork.bind(null, work.id);
  const [state, formAction, pending] = useActionState(boundAction, initial);

  const [description, setDescription] = useState(work.description);
  const [cost, setCost] = useState(String(work.cost));
  const [pct, setPct] = useState(String(work.commission_pct));
  const [amountPaid, setAmountPaid] = useState(String(work.amount_paid));
  const [paymentMethod, setPaymentMethod] = useState(work.payment_method ?? "cash");
  const [performedAt, setPerformedAt] = useState(work.performed_at);
  const [notes, setNotes] = useState(work.notes ?? "");
  const [labWork, setLabWork] = useState(work.lab_work ?? "");
  const [labCost, setLabCost] = useState(String(work.lab_cost));
  const [invoiced, setInvoiced] = useState(work.invoiced ? "true" : "false");

  const costN = Number(cost) || 0;
  const pctN = Number(pct) || 0;
  const labCostN = Number(labCost) || 0;
  const amountPaidN = Number(amountPaid) || 0;
  const commission = computeCommission({ amountPaid: amountPaidN, cost: costN, labCost: labCostN, pct: pctN });

  useEffect(() => {
    if (state.ok) {
      toast("Trabajo actualizado", "success");
      setOpen(false);
    }
  }, [state.ok]);

  function openModal() {
    setDescription(work.description);
    setCost(String(work.cost));
    setPct(String(work.commission_pct));
    setAmountPaid(String(work.amount_paid));
    setPaymentMethod(work.payment_method ?? "cash");
    setPerformedAt(work.performed_at);
    setNotes(work.notes ?? "");
    setLabWork(work.lab_work ?? "");
    setLabCost(String(work.lab_cost));
    setInvoiced(work.invoiced ? "true" : "false");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <span className="font-semibold text-slate-800">Editar trabajo</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={formAction} className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <FieldLabel>Trabajo realizado *</FieldLabel>
                  <input
                    name="description"
                    type="text"
                    required
                    maxLength={120}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={fieldInputClass}
                  />
                </label>

                <label className="block text-sm">
                  <FieldLabel>Costo (Bs)</FieldLabel>
                  <input
                    name="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    onWheel={preventWheelChange}
                    className={fieldInputClass}
                  />
                </label>

                <label className="block text-sm">
                  <FieldLabel>Comisión (%)</FieldLabel>
                  <input
                    name="commission_pct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={pct}
                    onChange={(e) => setPct(e.target.value)}
                    onWheel={preventWheelChange}
                    className={fieldInputClass}
                  />
                </label>

                {costN > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20 sm:col-span-2">
                    <span className="text-xs text-slate-500">
                      Comisión calculada
                      {labCostN > 0 && (
                        <span className="text-slate-400"> ({pctN}% de {money(costN - labCostN, currency)} neto)</span>
                      )}
                    </span>
                    <span className="tabular-nums font-semibold text-clinic">{money(commission, currency)}</span>
                  </div>
                )}

                <label className="block text-sm sm:col-span-2">
                  <FieldLabel>Trabajo de laboratorio</FieldLabel>
                  <input
                    name="lab_work"
                    type="text"
                    maxLength={200}
                    value={labWork}
                    onChange={(e) => setLabWork(e.target.value)}
                    className={fieldInputClass}
                  />
                </label>

                <label className="block text-sm">
                  <FieldLabel>Costo laboratorio (Bs)</FieldLabel>
                  <input
                    name="lab_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={labCost}
                    onChange={(e) => setLabCost(e.target.value)}
                    onWheel={preventWheelChange}
                    className={fieldInputClass}
                  />
                  <input type="hidden" name="treatment_lab_cost" value={labCostN} />
                </label>

                <label className="block text-sm">
                  <FieldLabel>Cobrado al paciente (Bs)</FieldLabel>
                  <input
                    name="amount_paid"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    onWheel={preventWheelChange}
                    className={fieldInputClass}
                  />
                </label>

                <label className="block text-sm">
                  <FieldLabel>Método de pago</FieldLabel>
                  <select
                    name="payment_method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={amountPaidN <= 0}
                    className={fieldInputClass}
                  >
                    <option value="">— ninguno —</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <FieldLabel>Comprobante</FieldLabel>
                  <select
                    name="invoiced"
                    value={invoiced}
                    onChange={(e) => setInvoiced(e.target.value)}
                    className={fieldInputClass}
                  >
                    <option value="false">Sin factura</option>
                    <option value="true">Con factura</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <FieldLabel>Fecha</FieldLabel>
                  <input
                    name="performed_at"
                    type="date"
                    value={performedAt}
                    onChange={(e) => setPerformedAt(e.target.value)}
                    onWheel={preventWheelChange}
                    className={fieldInputClass}
                  />
                </label>

                <label className="block text-sm sm:col-span-2">
                  <FieldLabel>Notas</FieldLabel>
                  <input
                    name="notes"
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={fieldInputClass}
                  />
                </label>
              </div>

              {state.error && <p className="text-sm text-red-600">{state.error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
                >
                  {pending ? "Guardando…" : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
