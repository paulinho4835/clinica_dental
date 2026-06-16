"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createItem, updateItem, type ActionState } from "@/app/(dashboard)/inventario/actions";
import { Modal } from "@/components/ui/Modal";

const initial: ActionState = {};

export type InvItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  min_stock: number;
  current_stock: number;
  unit_price: number | null;
};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic";

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
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEditing ? "Editar insumo" : "Nuevo insumo"}
    >
      <form action={formAction}>
        {isEditing && <input type="hidden" name="id" value={item!.id} />}

        <div className="space-y-4">
          {/* Nombre */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nombre *</span>
            <input
              name="name"
              type="text"
              required
              autoFocus
              defaultValue={item?.name ?? ""}
              placeholder="ej. Guantes nitrilo M"
              className={inputCls}
            />
          </label>

          {/* Categoría + Unidad — solo en edición */}
          {isEditing && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Categoría</span>
                <input
                  name="category"
                  type="text"
                  defaultValue={item?.category ?? ""}
                  placeholder="ej. Descartables"
                  className={inputCls}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Unidad *</span>
                <input
                  name="unit"
                  type="text"
                  required
                  defaultValue={item?.unit ?? "unidad"}
                  placeholder="caja, par, ml…"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {/* Cantidad inicial — solo en alta */}
          {!isEditing && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cantidad inicial *</span>
              <input
                name="initial_qty"
                type="number"
                step="1"
                min="0"
                required
                defaultValue=""
                placeholder="0"
                className={inputCls}
              />
            </label>
          )}

          {/* Precio unitario + Stock mínimo */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Precio unitario{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
              </span>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                  Bs.
                </span>
                <input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={item?.unit_price ?? ""}
                  placeholder="0.00"
                  className="w-full rounded-md border border-slate-300 py-2 pl-10 pr-3 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Stock mínimo *</span>
              <input
                name="min_stock"
                type="number"
                step="1"
                min="0"
                required
                defaultValue={item?.min_stock ?? 5}
                className={inputCls}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Alerta cuando baje de este valor.
              </span>
            </label>
          </div>

          {/* Lote + Caducidad — solo en alta, sección opcional */}
          {!isEditing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">Opcional</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Nº de lote</span>
                  <input
                    name="lot"
                    type="text"
                    placeholder="ej. L2024-01"
                    className={inputCls}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Fecha de caducidad</span>
                  <input
                    name="expiry_date"
                    type="date"
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {state.error && (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        )}

        <div className="mt-5 flex gap-2">
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
    </Modal>
  );
}
