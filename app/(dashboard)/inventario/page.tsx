import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { MovementForm } from "@/components/inventory/MovementForm";
import { StockTable } from "@/components/inventory/StockTable";
import { requireNavAccess } from "@/lib/guard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageOpen } from "lucide-react";

const MOVE_LABEL: Record<string, string> = {
  in: "Entrada",
  out: "Salida",
  adjust: "Ajuste",
};
const MOVE_TONE: Record<string, "success" | "danger" | "warning"> = {
  in: "success",
  out: "danger",
  adjust: "warning",
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Días hasta una fecha (negativo = ya vencido).
function daysUntil(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

export default async function InventoryPage() {
  await requireNavAccess("inventario");
  const supabase = await createClient();
  const profile = await getProfile();
  const canWrite = can(profile?.role, "inventory:write");

  const [{ data: items }, { data: batches }, { data: movements }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, name, category, unit, min_stock, current_stock, unit_price")
      .order("name"),
    supabase
      .from("inventory_batches")
      .select("lot, expiry_date, quantity, inventory_items(name)")
      .order("expiry_date", { ascending: true })
      .limit(20),
    supabase
      .from("inventory_movements")
      .select("id, type, quantity, reason, created_at, inventory_items(name, unit), profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const soon = new Date();
  soon.setMonth(soon.getMonth() + 3);

  // ── KPIs ──
  const itemList = items ?? [];
  const lowCount = itemList.filter((it) => Number(it.current_stock) <= Number(it.min_stock)).length;
  const expiringCount = (batches ?? []).filter(
    (b) => b.expiry_date && new Date(b.expiry_date) <= soon,
  ).length;
  const capitalTotal = itemList.reduce((sum, it) => {
    if (it.unit_price == null) return sum;
    return sum + Number(it.current_stock) * Number(it.unit_price);
  }, 0);
  const capitalStr =
    capitalTotal > 0
      ? `Bs. ${capitalTotal.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Inventario y suministros</h1>

      {/* ── Resumen ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Insumos" value={itemList.length} tone="neutral" />
        <Kpi label="Bajo mínimo" value={lowCount} tone={lowCount > 0 ? "danger" : "ok"} />
        <Kpi
          label="Lotes por vencer (3m)"
          value={expiringCount}
          tone={expiringCount > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Capital en insumos"
          value={capitalStr ?? "—"}
          tone={capitalTotal > 0 ? "neutral" : "neutral"}
        />
      </div>

      {/* ── Alertas activas ── */}
      {(lowCount > 0 || expiringCount > 0) && (
        <div className="space-y-3">
          {lowCount > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
              <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
                ⚠ {lowCount} insumo{lowCount !== 1 ? "s" : ""} bajo mínimo — registra una entrada para reponer
              </p>
              <ul className="space-y-1">
                {itemList
                  .filter((it) => Number(it.current_stock) <= Number(it.min_stock))
                  .map((it) => (
                    <li key={it.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-red-800 dark:text-red-300">{it.name}</span>
                      <span className="tabular-nums text-red-600 dark:text-red-400">
                        {it.current_stock} / {it.min_stock} {it.unit}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {expiringCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                ⏰ {expiringCount} lote{expiringCount !== 1 ? "s" : ""} por vencer en menos de 3 meses
              </p>
              <ul className="space-y-1">
                {(batches ?? [])
                  .filter((b) => b.expiry_date && new Date(b.expiry_date) <= soon)
                  .map((b, i) => {
                    const days = b.expiry_date ? daysUntil(b.expiry_date) : null;
                    return (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-amber-800 dark:text-amber-300">
                          {(b.inventory_items as { name?: string } | null)?.name ?? "—"}
                        </span>
                        <span className="tabular-nums text-amber-600 dark:text-amber-400">
                          {b.expiry_date}
                          {days !== null && (
                            <span className="ml-1 text-xs">
                              {days < 0 ? "(vencido)" : `(${days} d)`}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <MovementForm
          items={itemList.map((it) => ({ id: it.id, name: it.name, unit: it.unit }))}
        />
      )}

      {/* ── Stock (buscador + alta/edición) ── */}
      <StockTable
        items={itemList.map((it) => ({
          id: it.id,
          name: it.name,
          category: it.category,
          unit: it.unit,
          min_stock: Number(it.min_stock),
          current_stock: Number(it.current_stock),
          unit_price: it.unit_price != null ? Number(it.unit_price) : null,
        }))}
        canWrite={canWrite}
      />

      {/* ── Historial de movimientos ── */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Movimientos recientes</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th>Insumo</th>
                <th>Tipo</th>
                <th className="text-right">Cantidad</th>
                <th className="hidden md:table-cell">Motivo</th>
                <th className="hidden md:table-cell">Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(movements ?? []).map((m) => {
                const it = m.inventory_items as { name?: string; unit?: string } | null;
                const who = (m.profiles as { full_name?: string } | null)?.full_name;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {fmtDate(m.created_at)}
                    </td>
                    <td className="font-medium">{it?.name ?? "—"}</td>
                    <td>
                      <Badge tone={MOVE_TONE[m.type] ?? "neutral"}>
                        {MOVE_LABEL[m.type] ?? m.type}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums">
                      {m.quantity} {it?.unit ?? ""}
                    </td>
                    <td className="hidden text-slate-500 md:table-cell">{m.reason ?? "—"}</td>
                    <td className="hidden text-slate-500 md:table-cell">{who || "—"}</td>
                  </tr>
                );
              })}
              {!movements?.length && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<PackageOpen className="h-6 w-6" />}
                      title="Sin movimientos registrados"
                      description="Las entradas y salidas de stock aparecerán aquí."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lotes y caducidad ── */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Lotes y caducidad</h2>
        <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {batches?.map((b, i) => {
            const days = b.expiry_date ? daysUntil(b.expiry_date) : null;
            const expiring = days !== null && days <= 90;
            const expired = days !== null && days < 0;
            return (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">
                  {(b.inventory_items as { name?: string } | null)?.name ?? "—"}
                </span>
                <span className="text-slate-500">
                  Lote {b.lot ?? "—"} · {b.quantity}
                </span>
                <span
                  className={
                    expired
                      ? "font-medium text-red-700"
                      : expiring
                        ? "font-medium text-amber-600"
                        : "text-slate-500"
                  }
                >
                  {b.expiry_date ?? "—"}
                  {days !== null && (
                    <span className="ml-1 text-xs">
                      {expired ? "(vencido)" : `(${days} d)`}
                    </span>
                  )}
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

// ─── Tarjeta KPI ──────────────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "ok" | "warn" | "danger";
}) {
  const color = {
    neutral: "text-slate-800",
    ok: "text-emerald-600",
    warn: "text-amber-600",
    danger: "text-red-600",
  }[tone];
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
