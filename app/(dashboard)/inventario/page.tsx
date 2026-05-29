import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { MovementForm } from "@/components/inventory/MovementForm";

export default async function InventoryPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const [{ data: items }, { data: batches }] = await Promise.all([
    supabase.from("inventory_items")
      .select("id, name, category, unit, min_stock, current_stock").order("name"),
    supabase.from("inventory_batches")
      .select("lot, expiry_date, quantity, inventory_items(name)")
      .order("expiry_date", { ascending: true }).limit(20),
  ]);

  const soon = new Date();
  soon.setMonth(soon.getMonth() + 3);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Inventario y suministros</h1>

      {can(profile?.role, "inventory:write") && (
        <MovementForm
          items={(items ?? []).map((it) => ({ id: it.id, name: it.name, unit: it.unit }))}
        />
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Stock</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Insumo</th><th>Categoría</th><th className="text-right">Mín.</th><th className="text-right">Actual</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items?.map((it, i) => {
              const low = Number(it.current_stock) <= Number(it.min_stock);
              return (
                <tr key={i} className={low ? "bg-red-50" : ""}>
                  <td className="py-2 font-medium">{it.name}</td>
                  <td className="text-slate-500">{it.category ?? "—"}</td>
                  <td className="text-right tabular-nums">{it.min_stock}</td>
                  <td className="text-right tabular-nums">{it.current_stock} {it.unit}</td>
                  <td className="text-right">{low && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Stock bajo</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Lotes y caducidad</h2>
        <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {batches?.map((b, i) => {
            const exp = b.expiry_date ? new Date(b.expiry_date) : null;
            const expiring = exp && exp <= soon;
            return (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">{(b.inventory_items as { name?: string } | null)?.name ?? "—"}</span>
                <span className="text-slate-500">Lote {b.lot ?? "—"} · {b.quantity}</span>
                <span className={expiring ? "font-medium text-red-600" : "text-slate-500"}>
                  {b.expiry_date ?? "—"}
                </span>
              </div>
            );
          })}
          {!batches?.length && <p className="px-4 py-2 text-sm text-slate-500">Sin lotes.</p>}
        </div>
      </section>
    </div>
  );
}
