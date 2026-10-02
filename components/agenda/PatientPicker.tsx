"use client";

import { useEffect, useState } from "react";
import type { PatientOption, PatientSearch } from "@/lib/agenda/patientSearch";

export type { PatientOption, PatientSearch };

// Espera tras la última tecla antes de consultar al servidor.
const SEARCH_DEBOUNCE_MS = 250;

// Buscador de paciente por nombre o CI. Escribe para filtrar, clic para elegir.
// Obliga a elegir de la lista: el valor real es `selected`, no el texto escrito.
// La búsqueda corre en el servidor (sin acentos, por palabras), así encuentra
// a cualquier paciente aunque la clínica tenga miles.
export function PatientPicker({
  searchPatients,
  selected,
  onSelect,
  autoFocus,
  openOnFocus = true,
}: {
  searchPatients: PatientSearch;
  selected: PatientOption | null;
  onSelect: (p: PatientOption | null) => void;
  autoFocus?: boolean;
  /** false: la lista solo se abre al escribir (en el popover rápido el
      autofocus abría el desplegable encima de los botones de acción). */
  openOnFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Resultado de la última búsqueda que terminó, con la consulta a la que
  // corresponde: así nunca se muestra (ni autoselecciona) una lista vieja.
  const [result, setResult] = useState<{
    query: string;
    matches: PatientOption[];
    failed: boolean;
  } | null>(null);

  const term = query.trim();

  useEffect(() => {
    if (!open || selected) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        searchPatients(term).then(
          (matches) => {
            if (!cancelled) setResult({ query: term, matches, failed: false });
          },
          () => {
            if (!cancelled) setResult({ query: term, matches: [], failed: true });
          },
        );
      },
      term ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, selected, searchPatients]);

  const current = result?.query === term ? result : null;
  const searching = !current;
  // Mientras llega la respuesta se siguen mostrando los resultados anteriores
  // (sin parpadeo al escribir); autoselección y "sin coincidencias" solo usan
  // la respuesta de la consulta actual.
  const matches = (current ?? result)?.matches ?? [];

  // Si al escribir queda exactamente un match, se autoselecciona.
  useEffect(() => {
    if (!selected && term && current && current.matches.length === 1) {
      onSelect(current.matches[0]);
    }
  }, [term, current, selected, onSelect]);

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
        onFocus={() => { if (openOnFocus || query.trim()) setOpen(true); }}
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
      {open && term && searching && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Buscando…
        </div>
      )}
      {open && current?.failed && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600 shadow-lg">
          No se pudo buscar pacientes. Intenta de nuevo.
        </div>
      )}
      {open && term && current && !current.failed && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Sin pacientes que coincidan.
        </div>
      )}
    </div>
  );
}
