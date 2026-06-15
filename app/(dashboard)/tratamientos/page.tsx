import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/guard";
import { bs } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function TreatmentsPage() {
  await requireFeature("tratamientos");
  const supabase = await createClient();
  const { data: procs } = await supabase
    .from("procedure_catalog")
    .select("code, name, base_price, default_commission_pct, specialty")
    .eq("active", true)
    .order("name");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Catálogo de procedimientos</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2">Código</th>
            <th>Procedimiento</th>
            <th>Especialidad</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Comisión</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {procs?.map((p) => (
            <tr key={p.code}>
              <td className="py-2 font-mono text-xs">{p.code}</td>
              <td>{p.name}</td>
              <td className="text-slate-500">{p.specialty ?? "—"}</td>
              <td className="text-right tabular-nums">{bs(Number(p.base_price))}</td>
              <td className="text-right tabular-nums">{p.default_commission_pct}%</td>
            </tr>
          ))}
          {!procs?.length && (
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="Catálogo vacío"
                  description="Aún no hay procedimientos cargados en el catálogo."
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
