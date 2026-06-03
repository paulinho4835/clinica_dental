"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createItem, updateItem, type ActionState } from "@/app/(dashboard)/inventario/actions";

const initial: ActionState = {};

export type InvItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  min_stock: number;
  current_stock: number;
};

// Modal de alta/edición de insumo. Si recibe `item` → modo edición.
export function ItemForm({ item, onClose }: { item?: InvItem; onClose: () => void }) {
  const router = useRouter();
  const isEditing = !!item;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateItem : createItem,
    initial,
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state.ok, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            {isEditing ? "Editar insumo" : "Nuevo insumo"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {isEditing && <input type="hidden" name="id" value={item!.id} />}

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Nombre *</span>
          <input
            name="name"
            type="text"
            required
            autoFocus
            defaultValue={item?.name ?? ""}
            placeholder="ej. Guantes nitrilo M"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>

        {/* Categoría y unidad: solo al editar (en el alta se simplifica). */}
        {isEditing && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Categoría</span>
              <input
                name="category"
                type="text"
                defaultValue={item?.category ?? ""}
                placeholder="ej. Descartables"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Unidad *</span>
              <input
                name="unit"
                type="text"
                required
                defaultValue={item?.unit ?? "unidad"}
                placeholder="caja, par, ml…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          </div>
        )}

        {/* Cantidad inicial + lote/caducidad opcionales: solo en el alta. */}
        {!isEditing && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Cantidad inicial *</span>
              <input
                name="initial_qty"
                type="number"
                step="1"
                min="0"
                required
                defaultValue=""
                placeholder="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Nº de lote <span className="text-slate-400">(opcional)</span></span>
                <input
                  name="lot"
                  type="text"
                  placeholder="ej. L2024-01"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Fecha de caducidad <span className="text-slate-400">(opcional)</span></span>
                <input
                  name="expiry_date"
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
            </div>
          </>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Stock mínimo *</span>
          <input
            name="min_stock"
            type="number"
            step="1"
            min="0"
            required
            defaultValue={item?.min_stock ?? 5}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Avisa cuando el stock llegue o baje de este valor.
          </span>
        </label>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear insumo"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
