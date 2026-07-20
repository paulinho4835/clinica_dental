"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Trash2, Plus } from "lucide-react";
import {
  createTreatment,
  updateTreatment,
  deactivateTreatment,
  type ActionState,
} from "@/app/(dashboard)/tratamientos/actions";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import { Button } from "@/components/ui/Button";

export type CatalogItem = {
  id: string;
  name: string;
  base_price: number;
  commission_pct: number;
};

const initial: ActionState = {};
const inputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic";

export function TreatmentCatalog({ items, currency }: { items: CatalogItem[]; currency: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTreatment, initial);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      setName("");
      setPrice("");
      setCommission("");
      router.refresh();
      toast("Tratamiento agregado", "success");
    } else if (state.error) {
      toast(state.error, "error");
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
      {/* Alta de tratamiento */}
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
      >
        <label className="flex-1 text-xs" style={{ minWidth: "200px" }}>
          <span className="mb-1 block text-slate-500">Tratamiento</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ej. Resina simple, Endodoncia, Limpieza…"
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Precio (Bs)</span>
          <input
            name="base_price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className={`${inputClass} w-28`}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Comisión (%)</span>
          <input
            name="commission_pct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="0"
            className={`${inputClass} w-24`}
          />
        </label>
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "…" : "Agregar"}
        </Button>
      </form>

      {/* Lista del catálogo */}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[1fr_8rem_7rem_6rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Tratamiento</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Comisión</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((it) =>
            editingId === it.id ? (
              <EditRow
                key={it.id}
                item={it}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <Row
                key={it.id}
                item={it}
                onEdit={() => setEditingId(it.id)}
                currency={currency}
              />
            ),
          )}
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              Aún no hay tratamientos. Agrega el primero arriba.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ item, onEdit, currency }: { item: CatalogItem; onEdit: () => void; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function handleDeactivate() {
    const ok = await confirm({
      title: "Desactivar tratamiento",
      message: `¿Desactivar "${item.name}"? Dejará de aparecer en el catálogo y al agregar trabajos.`,
      confirmText: "Desactivar",
      cancelText: "Cancelar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deactivateTreatment(item.id);
      if (res.error) toast(res.error, "error");
      else {
        router.refresh();
        toast("Tratamiento desactivado", "success");
      }
    });
  }

  return (
    <div className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[1fr_8rem_7rem_6rem]">
      <span className="font-medium">{item.name}</span>
      <span className="text-right tabular-nums text-slate-600">{money(item.base_price, currency)}</span>
      <span className="text-right tabular-nums text-slate-600">{item.commission_pct}%</span>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-clinic"
          title="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={pending}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          title="Desactivar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EditRow({ item, onDone }: { item: CatalogItem; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.base_price));
  const [commission, setCommission] = useState(String(item.commission_pct));

  function handleSave() {
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("base_price", price);
      fd.set("commission_pct", commission);
      const res = await updateTreatment(item.id, fd);
      if (res.error) toast(res.error, "error");
      else {
        onDone();
        router.refresh();
        toast("Tratamiento actualizado", "success");
      }
    });
  }

  return (
    <div className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[1fr_8rem_7rem_6rem]">
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      <input
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className={`${inputClass} text-right`}
      />
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={commission}
        onChange={(e) => setCommission(e.target.value)}
        className={`${inputClass} text-right`}
      />
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          title="Guardar"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded p-1 text-slate-400 hover:bg-slate-100"
          title="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
