"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerPayment, type ActionState } from "@/app/(dashboard)/caja/actions";

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
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
      >
        + Registrar pago
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Paciente con autocomplete */}
        <div ref={containerRef} className="relative block text-sm">
          <span className="mb-1 block text-slate-600">Paciente *</span>
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
            required={false}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
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
          <span className="mb-1 block text-slate-600">Monto *</span>
          <input name="amount" type="number" step="0.01" min="0.01" required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Método</span>
          <select name="method" defaultValue="cash"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select name="kind" defaultValue="payment"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="payment">Pago</option>
            <option value="credit">Saldo a favor</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Doctor</span>
          <select
            name="doctor_id"
            defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          >
            <option value="">— Sin asignar —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Motivo de pago</span>
          <input
            name="note"
            type="text"
            maxLength={120}
            placeholder="ej. Adelanto, Pago endodoncia…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {!selectedId && query.length > 0 && (
        <p className="text-xs text-amber-600">Selecciona un paciente de la lista.</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !selectedId}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Registrar"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setQuery(""); setSelectedId(""); }}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}
