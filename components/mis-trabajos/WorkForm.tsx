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

const initial: ActionState = {};

type Patient = { id: string; full_name: string; national_id?: string | null };
type Doctor = { id: string; full_name: string };
type Recepcionista = { id: string; full_name: string };

const PAYMENT_METHODS = [
  { value: "cash",     label: "Efectivo" },
  { value: "qr",       label: "QR" },
  { value: "card",     label: "Tarjeta" },
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

  // Paciente: autocomplete sobre los pacientes visibles + texto libre.
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedCollectedById, setSelectedCollectedById] = useState("");

  // Cálculo de comisión en vivo.
  const [cost, setCost] = useState("");
  const [pct, setPct] = useState("");
  const costN = Number(cost) || 0;
  const pctN = Number(pct) || 0;
  const commission = Math.round(costN * pctN) / 100;

  // Pago al momento del registro.
  const [amountPaid, setAmountPaid] = useState("");
  const amountPaidN = Number(amountPaid) || 0;
  const [labCost, setLabCost] = useState("");

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

  function resetForm() {
    formRef.current?.reset();
    setQuery("");
    setSelectedId("");
    setSelectedDoctorId("");
    setSelectedCollectedById("");
    setCost("");
    setPct("");
    setAmountPaid("");
    setLabCost("");
    setOpen(false);
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
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Paciente: registrado (autocomplete) o nombre suelto */}
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
            {/* Si eligió uno registrado viaja patient_id; si no, patient_name. */}
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

          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Trabajo realizado *</FieldLabel>
            <input
              name="description"
              type="text"
              required
              maxLength={120}
              placeholder="ej. Cirugía, Endodoncia, Limpieza…"
              className={fieldInputClass}
            />
          </label>

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
            <FieldLabel>Comisión (%)</FieldLabel>
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

          {/* Comisión calculada automáticamente */}
          <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20 sm:col-span-2">
            <span className="text-slate-600">
              Comisión del doctor{pctN > 0 && <span className="text-slate-400"> ({pctN}% de {bs(costN)})</span>}
            </span>
            <span className="tabular-nums text-base font-semibold text-clinic">
              {bs(commission)}
            </span>
          </div>

          {/* ── Cobro al paciente ── */}
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

          {/* Cobrado por: solo visible cuando hay recepcionistas */}
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
