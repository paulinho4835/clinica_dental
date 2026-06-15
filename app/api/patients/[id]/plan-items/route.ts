import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type PlanItemRow = {
  id: string;
  name: string;
  price: number;
  paidAmount: number;
  labCost: number;
  doctorId: string | null;
  doctorName: string | null;
  defaultCommissionPct: number;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: plans }, { data: paidRows }, { data: labRows }] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "treatment_phases(treatment_items(id, price, status, custom_name, doctor_id, procedure:procedure_catalog(name, default_commission_pct), doctor:profiles!treatment_items_doctor_id_fkey(full_name)))",
      )
      .eq("patient_id", patientId),
    supabase
      .from("payments")
      .select("treatment_item_id, amount")
      .eq("patient_id", patientId)
      .not("treatment_item_id", "is", null),
    // Buscar el lab_cost registrado para cada ítem del plan (primera sesión con lab)
    supabase
      .from("doctor_works")
      .select("treatment_item_id, lab_cost")
      .eq("patient_id", patientId)
      .not("treatment_item_id", "is", null)
      .gt("lab_cost", 0),
  ]);

  // Mapa itemId → total pagado
  const paidByItem = new Map<string, number>();
  for (const row of paidRows ?? []) {
    const key = row.treatment_item_id as string;
    paidByItem.set(key, (paidByItem.get(key) ?? 0) + Number(row.amount));
  }

  // Mapa itemId → lab_cost del tratamiento (solo necesitamos uno, cualquier sesión)
  const labCostByItem = new Map<string, number>();
  for (const row of labRows ?? []) {
    const key = row.treatment_item_id as string;
    if (!labCostByItem.has(key)) {
      labCostByItem.set(key, Number(row.lab_cost));
    }
  }

  const items: PlanItemRow[] = (plans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .filter((it) => it.status !== "cancelled")
    .map((it) => {
      const proc = it.procedure as { name?: string; default_commission_pct?: number } | null;
      return {
        id: it.id as string,
        name: (proc?.name ?? (it.custom_name as string)) || "—",
        price: Number(it.price),
        paidAmount: paidByItem.get(it.id as string) ?? 0,
        labCost: labCostByItem.get(it.id as string) ?? 0,
        doctorId: (it.doctor_id as string | null) ?? null,
        doctorName: ((it.doctor as { full_name?: string } | null)?.full_name) ?? null,
        defaultCommissionPct: Number(proc?.default_commission_pct ?? 0),
      };
    });

  return NextResponse.json({ items });
}
