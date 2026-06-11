"use client";

import { useMemo, useState } from "react";
import { ItemForm, type InvItem } from "./ItemForm";

// Tabla de stock con buscador y orden por criticidad (bajos primero).
// Permite crear y editar insumos. `canWrite` habilita la edición.
export function StockTable({ items, canWrite }: { items: InvItem[]; canWrite: boolean }) {
  const [query, setQuery] = useState("");
  // null = cerrado · "new" = alta · objeto = edición
  const [editing, setEditing] = useState<InvItem | "new" | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.category ?? "").toLowerCase().includes(q),
        )
      : items;
    // Bajos primero; dentro de cada grupo, por nombre.
    return [...filtered].sort((a, b) => {
      const aLow = Number(a.current_stock) <= Number(a.min_stock) ? 0 : 1;
      const bLow = Number(b.current_stock) <= Number(b.min_stock) ? 0 : 1;
      return aLow - bLow || a.name.localeCompare(b.name);
    });
  }, [items, query]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Stock</h2>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar insumo o categoría…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          {canWrite && (
            <button
              onClick={() => setEditing("new")}
              className="whitespace-nowrap rounded-md bg-clinic px-4 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
            >
              + Nuevo insumo
            </button>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2">Insumo</th>
            <th>Categoría</th>
            <th className="text-right">Mín.</th>
            <th className="text-right">Actual</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((it) => {
            const low = Number(it.current_stock) <= Number(it.min_stock);
            return (
              <tr key={it.id} className={low ? "bg-red-50 dark:bg-red-500/10" : ""}>
                <td className="py-2 font-medium">{it.name}</td>
                <td className="text-slate-500">{it.category ?? "—"}</td>
                <td className="text-right tabular-nums">{it.min_stock}</td>
                <td className="text-right tabular-nums">
                  {it.current_stock}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {low && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        Stock bajo
                      </span>
                    )}
                    {canWrite && (
                      <button
                        onClick={() => setEditing(it)}
                        title="Editar insumo"
                        className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-clinic"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-center text-slate-500">
                {query ? "Sin coincidencias." : "Sin insumos cargados."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editing && (
        <ItemForm
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
