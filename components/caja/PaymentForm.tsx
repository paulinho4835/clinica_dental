"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { registerPayment, type ActionState } from "@/app/(dashboard)/caja/actions";
import { toast } from "@/lib/toast";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const initial: ActionState = {};

type Patient = { id: string; full_name: string; national_id?: string | null };
type Doctor = { id: string; full_name: string };

export function PaymentForm({ patients, doctors }: { patients: Patient[]; doctors: Doctor[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(registerPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Autocomplete state
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 1
    ? patients.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.full_name.toLowerCase().includes(q) ||
          (p.national_id ?? "").toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setQuery("");
      setSelectedId("");
      setOpen(false);
      router.refresh();
      toast("Pago registrado", "success");
    }
  }, [state.ok, router]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Registrar pago
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Paciente con autocomplete */}
          <div ref={containerRef} className="relative block text-sm">
            <FieldLabel>Paciente *</FieldLabel>
            <input
              type="text"
              autoComplete="off"
              placeholder="Buscar por nombre o CI…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId("");
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className={fieldInputClass}
            />
            <input type="hidden" name="patient_id" value={selectedId} required />
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

          <label className="block text-sm">
            <FieldLabel>Monto *</FieldLabel>
            <input name="amount" type="number" step="0.01" min="0.01" required className={fieldInputClass} />
          </label>

          <label className="block text-sm">
            <FieldLabel>Método</FieldLabel>
            <select name="method" defaultValue="cash" className={fieldInputClass}>
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="card">Tarjeta</option>
            </select>
          </label>

          <label className="block text-sm">
            <FieldLabel>Tipo</FieldLabel>
            <select name="kind" defaultValue="payment" className={fieldInputClass}>
              <option value="payment">Pago</option>
              <option value="credit">Saldo a favor</option>
            </select>
          </label>

          <label className="block text-sm">
            <FieldLabel>Doctor</FieldLabel>
            <select name="doctor_id" defaultValue="" className={fieldInputClass}>
              <option value="">— Sin asignar —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm sm:col-span-2">
            <FieldLabel>Motivo de pago</FieldLabel>
            <input
              name="note"
              type="text"
              maxLength={120}
              placeholder="ej. Adelanto, Pago endodoncia…"
              className={fieldInputClass}
            />
          </label>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {!selectedId && query.length > 0 && (
          <p className="text-xs text-amber-600">Selecciona un paciente de la lista.</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !selectedId}>
            {pending ? "Guardando…" : "Registrar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setOpen(false); setQuery(""); setSelectedId(""); }}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
