"use client";

import { useEffect, useMemo, useState } from "react";

export type PatientOption = { id: string; full_name: string; national_id: string | null };

// Buscador de paciente por nombre o CI. Escribe para filtrar, clic para elegir.
// Obliga a elegir de la lista: el valor real es `selected`, no el texto escrito.
export function PatientPicker({
  patients,
  selected,
  onSelect,
  autoFocus,
}: {
  patients: PatientOption[];
  selected: PatientOption | null;
  onSelect: (p: PatientOption | null) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients
      .filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          (p.national_id ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, patients]);

  // Si al escribir queda exactamente un match, se autoselecciona.
  useEffect(() => {
    if (!selected && query.trim() && matches.length === 1) {
      onSelect(matches[0]);
    }
  }, [query, matches, selected, onSelect]);

  return (
    <div className="relative block text-sm">
      <span className="mb-1 block text-slate-600">Paciente *</span>
      <input type="hidden" name="patient_id" value={selected?.id ?? ""} />
      <input
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={
          selected
            ? `${selected.full_name}${selected.national_id ? ` · CI ${selected.national_id}` : ""}`
            : query
        }
        onChange={(e) => {
          onSelect(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar por nombre o CI…"
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
          selected
            ? "border-green-400 focus:border-green-500 focus:ring-green-500"
            : "border-slate-300 focus:border-clinic focus:ring-clinic"
        }`}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(p);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>{p.full_name}</span>
                <span className="text-xs text-slate-400">
                  {p.national_id ? `CI ${p.national_id}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Sin pacientes que coincidan.
        </div>
      )}
    </div>
  );
}
