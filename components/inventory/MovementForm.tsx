"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerMovement, type ActionState } from "@/app/(dashboard)/inventario/actions";

const initial: ActionState = {};

type Item = { id: string; name: string; unit: string };

export function MovementForm({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(registerMovement, initial);
  const [selected, setSelected] = useState<Item | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setSelected(null);
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
      >
        + Movimiento de stock
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
        {/* Buscador de insumo (filtra por nombre; obliga a elegir de la lista). */}
        <ItemPicker items={items} selected={selected} onSelect={setSelected} />

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select
            name="type"
            defaultValue="in"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          >
            <option value="in">Entrada</option>
            <option value="out">Salida</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">
            Cantidad * {selected ? <span className="text-slate-400">({selected.unit})</span> : null}
          </span>
          <input
            name="quantity"
            type="number"
            step="0.01"
            min="0"
            required
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Motivo</span>
          <input
            name="reason"
            type="text"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !selected}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Registrar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
        {!selected && <span className="text-xs text-amber-600">Elige un insumo de la lista.</span>}
      </div>
    </form>
  );
}

// ─── Buscador de insumo con filtro ───────────────────────────────────────────
// Escribe para filtrar, clic para elegir. El valor real viaja como item_id.
function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: Item | null;
  onSelect: (it: Item | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 10);
    return items.filter((it) => it.name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, items]);

  return (
    <div className="relative block text-sm">
      <span className="mb-1 block text-slate-600">Insumo *</span>
      <input type="hidden" name="item_id" value={selected?.id ?? ""} />
      <input
        type="search"
        autoComplete="off"
        value={selected ? selected.name : query}
        onChange={(e) => {
          onSelect(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar insumo…"
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
          selected
            ? "border-green-400 focus:border-green-500 focus:ring-green-500"
            : "border-slate-300 focus:border-clinic focus:ring-clinic"
        }`}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(it);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>{it.name}</span>
                <span className="text-xs text-slate-400">{it.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Sin insumos que coincidan.
        </div>
      )}
    </div>
  );
}
