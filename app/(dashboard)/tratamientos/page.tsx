import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireFeature } from "@/lib/guard";
import { TreatmentCatalog, type CatalogItem } from "@/components/treatments/TreatmentCatalog";

export default async function TreatmentsPage() {
  await requireFeature("tratamientos");
  const profile = await getProfile();
  // El catálogo (precios y comisiones) lo gestiona solo el admin.
  if (profile?.role !== "admin") redirect("/agenda");

  const supabase = await createClient();
  const { data: procs } = await supabase
    .from("procedure_catalog")
    .select("id, name, base_price, default_commission_pct")
    .eq("active", true)
    .order("name");

  const items: CatalogItem[] = (procs ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    base_price: Number(p.base_price),
    commission_pct: Number(p.default_commission_pct),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tratamientos</h1>
        <p className="text-sm text-slate-500">
          Catálogo de tratamientos de tu clínica. Estos aparecen al agregar un trabajo
          al plan de tratamiento de un paciente, autocompletando el precio.
        </p>
      </div>
      <TreatmentCatalog items={items} />
    </div>
  );
}
