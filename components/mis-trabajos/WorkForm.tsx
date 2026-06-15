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
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, formAction, pending] = useActionState(createDoctorWork, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
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

  const [amountPaid, setAmountPaid] = useState("");
  const amountPaidN = Number(amountPaid) || 0;

  // Lab cost del tratamiento (para cálculo proporcional de comisión):
  // si hay plan item con lab ya registrado, se usa ese; si no, el campo manual.
  const selectedPlanItem = planItems.find((i) => i.id === selectedPlanItemId) ?? null;
  const planItemLabCostN = selectedPlanItem?.labCost ?? 0;
  // Si el plan item ya tiene lab registrado en DB, usar ese; si no, usar el campo manual.
  const treatmentLabCostN = planItemLabCostN > 0 ? planItemLabCostN : labCostN;

  // Comisión proporcional: cada cuota aporta su fracción de la ganancia neta.
  const netRate = costN > 0 ? Math.max(0, costN - treatmentLabCostN) / costN : 1;
  const commission = Math.round(amountPaidN * netRate * pctN) / 100;

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
      setSelectedPlanItemId("");
      setDescription("");
      setCost("");
      setAmountPaid("");
      setPct("");
    } else {
      setSelectedPlanItemId(item.id);
      setDescription(item.name);
      setCost(String(item.price));
      // Pre-rellenar con el saldo restante de ese ítem.
      const restante = Math.max(0, item.price - item.paidAmount);
      setAmountPaid(restante > 0 ? String(restante) : "");
      // Auto-llenar comisión desde el catálogo de procedimientos.
      if (item.defaultCommissionPct > 0) {
        setPct(String(item.defaultCommissionPct));
      }
      if (doctors && item.doctorId) {
        setSelectedDoctorId(item.doctorId);
      }
    }
  }

  useEffect(() => {
    if (state.ok) {
      toast("Trabajo registrado", "success");
      // Limpiar campos del trabajo pero mantener paciente y doctor,
      // para registrar otro trabajo del mismo paciente sin reseleccionar.
      formRef.current?.reset();
      setSelectedPlanItemId("");
      setDescription("");
      setCost("");
      setPct("");
      setLabCost("");
      setAmountPaid("");
      // Refrescar barras de progreso inmediatamente.
      if (selectedId) {
        fetch(`/api/patients/${selectedId}/plan-items`)
          .then((r) => r.json())
          .then((d) => setPlanItems(d.items ?? []))
          .catch(() => {});
        fetch(`/api/patients/${selectedId}/balance`)
          .then((r) => r.json())
          .then((d) => setBalance(d.totalWorked != null ? d : null))
          .catch(() => {});
      }
      router.refresh();
    }
    // selectedId y router se capturan en closure; state es nueva referencia en cada acción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Cerrar modal de confirmación con Escape.
  useEffect(() => {
    if (!showConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowConfirm(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConfirm]);

  // Enfocar "Volver" al abrir el modal (el usuario debe confirmar activamente).
  useEffect(() => {
    if (showConfirm) confirmCancelRef.current?.focus();
  }, [showConfirm]);

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
    <>
    <Card className="p-4">
      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          {/* ── Paciente ──────────────────────────────────────── */}
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
            const deuda = balance.totalWorked - balance.totalPaid;
            const alDia = deuda <= 0;
            return (
              <div className={`sm:col-span-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${alDia ? "bg-emerald-50 ring-emerald-200 text-emerald-800" : "bg-amber-50 ring-amber-200 text-amber-900"}`}>
                <div className="flex gap-4">
                  <span>Facturado: <strong className="tabular-nums">{bs(balance.totalWorked)}</strong></span>
                  <span>Pagado: <strong className="tabular-nums">{bs(balance.totalPaid)}</strong></span>
                </div>
                <span className={`font-semibold tabular-nums ${alDia ? "text-emerald-700" : "text-amber-700"}`}>
                  {alDia ? "Al día ✓" : `Debe: ${bs(deuda)}`}
                </span>
              </div>
            );
          })()}

          {/* Plan de tratamiento */}
          {selectedId && planItems.length > 0 && (
            <div className="sm:col-span-2">
              <FieldLabel>Seleccionar del plan de tratamiento</FieldLabel>
              <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {planItems.map((item) => {
                  const pagado = item.paidAmount;
                  const saldado = pagado >= item.price && item.price > 0;
                  const parcial = pagado > 0 && !saldado;
                  const isSelected = selectedPlanItemId === item.id;
                  const pct = item.price > 0 ? Math.min(100, Math.round((pagado / item.price) * 100)) : 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectPlanItem(item)}
                      className={`flex flex-col rounded px-3 py-2 text-sm text-left transition-colors ${
                        isSelected
                          ? "bg-clinic/10 font-medium text-clinic-fg ring-1 ring-clinic/30"
                          : saldado
                          ? "bg-emerald-50 hover:bg-emerald-100"
                          : "hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">{item.name}</span>
                        <div className="ml-3 flex shrink-0 items-center gap-2">
                          {item.doctorName && (
                            <span className="text-xs text-slate-400">{item.doctorName}</span>
                          )}
                          {saldado ? (
                            <span className="text-xs font-semibold text-emerald-700">Saldado ✓</span>
                          ) : parcial ? (
                            <span className="text-xs text-amber-700 tabular-nums">
                              {bs(pagado)}<span className="text-slate-400"> / {bs(item.price)}</span>
                            </span>
                          ) : (
                            <span className="tabular-nums text-slate-600">{bs(item.price)}</span>
                          )}
                        </div>
                      </div>
                      {item.price > 0 && (
                        <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200">
                          <div
                            className={`h-1 rounded-full transition-all ${saldado ? "bg-emerald-500" : parcial ? "bg-amber-400" : "bg-slate-300"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
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

          {/* ── Trabajo realizado ─────────────────────────────── */}
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Trabajo</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

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

          <label className="block text-sm">
            <FieldLabel>Fecha</FieldLabel>
            <input
              name="performed_at"
              type="date"
              defaultValue={today}
              className={fieldInputClass}
            />
          </label>

          <label className="block text-sm">
            <FieldLabel>Notas (opcional)</FieldLabel>
            <input
              name="notes"
              type="text"
              maxLength={300}
              placeholder="Detalle adicional…"
              className={fieldInputClass}
            />
          </label>

          {/* ── Laboratorio ───────────────────────────────────── */}
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Laboratorio (opcional)</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Nombre del trabajo de laboratorio</FieldLabel>
            <input
              name="lab_work"
              type="text"
              maxLength={200}
              placeholder="ej. Corona, Prótesis parcial, Retenedor…"
              className={fieldInputClass}
            />
          </label>

          {/* ── Montos ────────────────────────────────────────── */}
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Montos</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {/* Costo del trabajo | Costo laboratorio */}
          <label className="block text-sm">
            <FieldLabel>Costo del tratamiento (Bs)</FieldLabel>
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

          {selectedPlanItemId && planItemLabCostN > 0 ? (
            <div className="block text-sm">
              <FieldLabel>Costo laboratorio (Bs)</FieldLabel>
              <div className={`${fieldInputClass} bg-slate-50 text-slate-500 flex items-center gap-2`}>
                <span className="tabular-nums font-medium text-slate-700">{bs(planItemLabCostN)}</span>
                <span className="text-xs text-slate-400">(ya registrado)</span>
              </div>
              <input type="hidden" name="lab_cost" value="0" />
              <input type="hidden" name="treatment_lab_cost" value={planItemLabCostN} />
            </div>
          ) : (
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
              <input type="hidden" name="treatment_lab_cost" value={labCostN} />
            </label>
          )}

          {/* Cobrado al paciente | Método de pago */}
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

          {/* Cobrado por */}
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

          {/* ── Comisión ──────────────────────────────────────── */}
          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comisión del doctor</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <label className="block text-sm">
            <FieldLabel>Porcentaje de comisión (%)</FieldLabel>
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

          <div className="flex flex-col justify-end">
            <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2.5 text-sm ring-1 ring-clinic/20">
              <span className="text-slate-500">
                {pctN > 0 && costN > 0 ? (
                  treatmentLabCostN > 0
                    ? <span>{pctN}% × {Math.round(netRate * 100)}% neto</span>
                    : <span>{pctN}% de {bs(amountPaidN)}</span>
                ) : "Comisión"}
              </span>
              <span className="tabular-nums text-base font-bold text-clinic">
                {bs(commission)}
              </span>
            </div>
          </div>

        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {!query.trim() && (
          <p className="text-xs text-amber-600">Indica el paciente.</p>
        )}

        <div className="flex gap-2">
          <Button type="button" disabled={!canSubmit} onClick={() => setShowConfirm(true)}>
            {pending ? "Guardando…" : "Registrar"}
          </Button>
          <Button type="button" variant="ghost" onClick={resetForm}>
            Cancelar
          </Button>
        </div>
        {/* Botón real de submit, invisible, disparado desde el modal */}
        <button ref={hiddenSubmitRef} type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Card>

    {/* ── Modal de confirmación ───────────────────────────────── */}
    {showConfirm && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Backdrop — clic cierra sin guardar */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowConfirm(false)}
        />

        {/* Panel */}
        <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10">
          <h2 id="confirm-title" className="text-base font-semibold text-slate-800 dark:text-white">
            Confirmar registro
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Revisa que los montos y comisiones sean correctos antes de continuar.
          </p>

          {/* Resumen de datos críticos */}
          <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
            <div className="flex justify-between gap-2 px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Paciente</dt>
              <dd className="max-w-[60%] truncate text-right font-medium text-slate-800 dark:text-white">{query}</dd>
            </div>
            <div className="flex justify-between gap-2 px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Trabajo</dt>
              <dd className="max-w-[60%] truncate text-right font-medium text-slate-800 dark:text-white">{description || "—"}</dd>
            </div>
            {doctors && selectedDoctorId && (
              <div className="flex justify-between gap-2 px-3 py-2">
                <dt className="text-slate-500 dark:text-slate-400">Doctor</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-white">
                  {doctors.find((d) => d.id === selectedDoctorId)?.full_name ?? "—"}
                </dd>
              </div>
            )}
            {costN > 0 && (
              <div className="flex justify-between gap-2 px-3 py-2">
                <dt className="text-slate-500 dark:text-slate-400">Costo tratamiento</dt>
                <dd className="tabular-nums font-medium text-slate-800 dark:text-white">{bs(costN)}</dd>
              </div>
            )}
            {treatmentLabCostN > 0 && (
              <div className="flex justify-between gap-2 px-3 py-2">
                <dt className="text-slate-500 dark:text-slate-400">Costo laboratorio</dt>
                <dd className="tabular-nums font-medium text-slate-800 dark:text-white">{bs(treatmentLabCostN)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2 px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Cobrado hoy</dt>
              <dd className="tabular-nums font-semibold text-slate-900 dark:text-white">{bs(amountPaidN)}</dd>
            </div>
            {pctN > 0 && (
              <div className="flex justify-between gap-2 px-3 py-2">
                <dt className="text-slate-500 dark:text-slate-400">Comisión doctor</dt>
                <dd className="tabular-nums font-semibold text-clinic">{pctN}% → {bs(commission)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-5 flex gap-2">
            <button
              ref={confirmCancelRef}
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                hiddenSubmitRef.current?.click();
              }}
              disabled={pending}
              className="flex-1 rounded-lg bg-clinic px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Sí, registrar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
