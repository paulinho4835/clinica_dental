"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createDoctorWork, type ActionState } from "@/app/(dashboard)/mis-trabajos/actions";
import { toast } from "@/lib/toast";
import { bs } from "@/lib/format";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PlanItemRow } from "@/app/api/patients/[id]/plan-items/route";

const initial: ActionState = {};

type Patient = { id: string; full_name: string; national_id?: string | null };
type Doctor = { id: string; full_name: string };
type Recepcionista = { id: string; full_name: string };

const PAYMENT_METHODS = [
  { value: "cash",  label: "Efectivo" },
  { value: "qr",   label: "QR" },
  { value: "card",  label: "Tarjeta" },
];

export function WorkForm({
  patients,
  today,
  doctors,
  recepcionistas,
}: {
  patients: Patient[];
  today: string;
  doctors?: Doctor[];
  recepcionistas?: Recepcionista[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createDoctorWork, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedCollectedById, setSelectedCollectedById] = useState("");

  // Balance del paciente seleccionado.
  const [balance, setBalance] = useState<{ totalWorked: number; totalPaid: number } | null>(null);

  // Plan de tratamiento del paciente seleccionado.
  const [planItems, setPlanItems] = useState<PlanItemRow[]>([]);
  const [selectedPlanItemId, setSelectedPlanItemId] = useState("");

  // Campos controlados para pre-rellenar desde el plan.
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [pct, setPct] = useState("");
  const costN = Number(cost) || 0;
  const pctN = Number(pct) || 0;

  // Comisión laboratorio.
  const [labCost, setLabCost] = useState("");
  const labCostN = Number(labCost) || 0;

  const netCost = costN - labCostN;
  const commission = Math.round(netCost * pctN) / 100;

  const [amountPaid, setAmountPaid] = useState("");
  const amountPaidN = Number(amountPaid) || 0;

  // Buscar pacientes por query.
  const filtered =
    query.length >= 1
      ? patients
          .filter((p) => {
            const q = query.toLowerCase();
            return (
              p.full_name.toLowerCase().includes(q) ||
              (p.national_id ?? "").toLowerCase().includes(q)
            );
          })
          .slice(0, 8)
      : [];

  // Cargar balance y plan de tratamiento cuando se selecciona un paciente.
  useEffect(() => {
    if (!selectedId) {
      setPlanItems([]);
      setSelectedPlanItemId("");
      setBalance(null);
      return;
    }
    fetch(`/api/patients/${selectedId}/plan-items`)
      .then((r) => r.json())
      .then((d) => setPlanItems(d.items ?? []))
      .catch(() => setPlanItems([]));
    fetch(`/api/patients/${selectedId}/balance`)
      .then((r) => r.json())
      .then((d) => setBalance(d.totalWorked != null ? d : null))
      .catch(() => setBalance(null));
  }, [selectedId]);

  function resetForm() {
    formRef.current?.reset();
    setQuery("");
    setSelectedId("");
    setSelectedDoctorId("");
    setSelectedCollectedById("");
    setPlanItems([]);
    setSelectedPlanItemId("");
    setDescription("");
    setCost("");
    setPct("");
    setLabCost("");
    setAmountPaid("");
    setBalance(null);
    setOpen(false);
  }

  function selectPlanItem(item: PlanItemRow) {
    if (selectedPlanItemId === item.id) {
      // Deseleccionar: limpiar campos pre-rellenados.
      setSelectedPlanItemId("");
      setDescription("");
      setCost("");
    } else {
      setSelectedPlanItemId(item.id);
      setDescription(item.name);
      setCost(String(item.price));
      // Si hay selector de doctor (recepcionista/admin) y el ítem tiene doctor asignado, pre-rellenar.
      if (doctors && item.doctorId) {
        setSelectedDoctorId(item.doctorId);
      }
    }
  }

  useEffect(() => {
    if (state.ok) {
      resetForm();
      router.refresh();
      toast("Trabajo registrado", "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, router]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const hasRecepcionistas = recepcionistas && recepcionistas.length > 0;
  const canSubmit =
    !pending &&
    query.trim() &&
    (!doctors || selectedDoctorId) &&
    (!hasRecepcionistas || selectedCollectedById);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Registrar trabajo
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Paciente */}
          <div ref={containerRef} className="relative block text-sm sm:col-span-2">
            <FieldLabel>Paciente *</FieldLabel>
            <input
              type="text"
              autoComplete="off"
              placeholder="Buscar por nombre o CI… (o escribe un nombre suelto)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId("");
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className={fieldInputClass}
            />
            <input type="hidden" name="patient_id" value={selectedId} />
            <input type="hidden" name="patient_name" value={selectedId ? "" : query} />
            {showSuggestions && filtered.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    onMouseDown={() => {
                      setQuery(p.full_name);
                      setSelectedId(p.id);
                      setShowSuggestions(false);
                    }}
                    className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <span>{p.full_name}</span>
                    {p.national_id && (
                      <span className="ml-2 text-xs text-slate-400">{p.national_id}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Saldo del paciente */}
          {selectedId && balance && (() => {
            const pending = balance.totalWorked - balance.totalPaid;
            const isZero = pending <= 0;
            return (
              <div className={`sm:col-span-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${isZero ? "bg-emerald-50 ring-emerald-200 text-emerald-800" : "bg-amber-50 ring-amber-200 text-amber-900"}`}>
                <div className="flex gap-4">
                  <span>Facturado: <strong className="tabular-nums">{bs(balance.totalWorked)}</strong></span>
                  <span>Pagado: <strong className="tabular-nums">{bs(balance.totalPaid)}</strong></span>
                </div>
                <span className={`font-semibold tabular-nums ${isZero ? "text-emerald-700" : "text-amber-700"}`}>
                  {isZero ? "Al día ✓" : `Debe: ${bs(pending)}`}
                </span>
              </div>
            );
          })()}

          {/* Selector del plan de tratamiento (aparece cuando el paciente tiene ítems) */}
          {selectedId && planItems.length > 0 && (
            <div className="sm:col-span-2">
              <FieldLabel>Seleccionar del plan de tratamiento</FieldLabel>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {planItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectPlanItem(item)}
                    className={`flex items-center justify-between rounded px-3 py-2 text-sm text-left transition-colors ${
                      selectedPlanItemId === item.id
                        ? "bg-clinic/10 font-medium text-clinic-fg ring-1 ring-clinic/30"
                        : "hover:bg-white"
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      {item.doctorName && (
                        <span className="text-xs text-slate-400">{item.doctorName}</span>
                      )}
                      <span className="tabular-nums text-slate-600">{bs(item.price)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <input type="hidden" name="treatment_item_id" value={selectedPlanItemId} />
            </div>
          )}

          {/* Doctor (solo recepcionista/admin) */}
          {doctors && (
            <label className="block text-sm sm:col-span-2">
              <FieldLabel>Doctor *</FieldLabel>
              <select
                name="doctor_id"
                required
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className={fieldInputClass}
              >
                <option value="">Selecciona un doctor…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Trabajo realizado */}
          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Trabajo realizado *</FieldLabel>
            <input
              name="description"
              type="text"
              required
              maxLength={120}
              placeholder="ej. Cirugía, Endodoncia, Limpieza…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldInputClass}
            />
          </label>

          {/* Costo del trabajo */}
          <label className="block text-sm">
            <FieldLabel>Costo del trabajo (Bs)</FieldLabel>
            <input
              name="cost"
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className={fieldInputClass}
            />
          </label>

          <label className="block text-sm">
            <FieldLabel>Comisión trabajo (%)</FieldLabel>
            <input
              name="commission_pct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="ej. 40"
              className={fieldInputClass}
            />
          </label>

          {/* Comisión calculada */}
          <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20 sm:col-span-2">
            <span className="text-slate-600">
              Comisión del trabajo
              {pctN > 0 && (
                labCostN > 0
                  ? <span className="text-slate-400"> ({pctN}% de {bs(netCost)} neto = {bs(costN)} − {bs(labCostN)} lab)</span>
                  : <span className="text-slate-400"> ({pctN}% de {bs(costN)})</span>
              )}
            </span>
            <span className="tabular-nums text-base font-semibold text-clinic">
              {bs(commission)}
            </span>
          </div>

          {/* Laboratorio */}
          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Trabajo de laboratorio (opcional)</FieldLabel>
            <input
              name="lab_work"
              type="text"
              maxLength={200}
              placeholder="ej. Corona, Prótesis parcial, Retenedor…"
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
              placeholder="0.00"
              className={fieldInputClass}
            />
          </label>

          {/* Cobro al paciente */}
          <label className="block text-sm">
            <FieldLabel>Cobrado al paciente (Bs)</FieldLabel>
            <input
              name="amount_paid"
              type="number"
              step="0.01"
              min="0"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="0.00"
              className={fieldInputClass}
            />
          </label>

          <label className="block text-sm">
            <FieldLabel>Método de pago</FieldLabel>
            <select
              name="payment_method"
              disabled={amountPaidN <= 0}
              className={fieldInputClass}
            >
              <option value="">— ninguno —</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>

          {/* Cobrado por: solo cuando hay recepcionistas */}
          {hasRecepcionistas && (
            <label className="block text-sm sm:col-span-2">
              <FieldLabel>Cobrado por *</FieldLabel>
              <select
                name="collected_by_id"
                required
                value={selectedCollectedById}
                onChange={(e) => setSelectedCollectedById(e.target.value)}
                className={fieldInputClass}
              >
                <option value="">Selecciona recepcionista…</option>
                {recepcionistas!.map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm">
            <FieldLabel>Fecha</FieldLabel>
            <input
              name="performed_at"
              type="date"
              defaultValue={today}
              className={fieldInputClass}
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Notas (opcional)</FieldLabel>
            <input
              name="notes"
              type="text"
              maxLength={300}
              placeholder="Detalle adicional…"
              className={fieldInputClass}
            />
          </label>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {!query.trim() && (
          <p className="text-xs text-amber-600">Indica el paciente.</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "Guardando…" : "Registrar"}
          </Button>
          <Button type="button" variant="ghost" onClick={resetForm}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
