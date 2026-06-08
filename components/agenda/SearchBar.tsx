"use client";

import { useState } from "react";
import { Search } from "lucide-react";

// ─── Buscador de la agenda ───────────────────────────────────────────────────
export function SearchBar({
  onSearch,
  message,
}: {
  onSearch: (q: string) => void;
  message: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(value);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (!e.target.value.trim()) onSearch(""); // limpiar resaltado al vaciar
            }}
            placeholder="Buscar cita por nombre o CI del paciente…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
        >
          Buscar
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-amber-600">{message}</p>}
    </div>
  );
}
