import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type PlanItemRow = {
  id: string;
  name: string;
  price: number;
  doctorId: string | null;
  doctorName: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plans } = await supabase
    .from("treatment_plans")
    .select(
      "treatment_phases(treatment_items(id, price, status, custom_name, doctor_id, procedure:procedure_catalog(name), doctor:profiles!treatment_items_doctor_id_fkey(full_name)))",
    )
    .eq("patient_id", patientId);

  const items: PlanItemRow[] = (plans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .filter((it) => it.status !== "cancelled")
    .map((it) => ({
      id: it.id as string,
      name:
        ((it.procedure as { name?: string } | null)?.name ??
          (it.custom_name as string)) || "—",
      price: Number(it.price),
      doctorId: (it.doctor_id as string | null) ?? null,
      doctorName:
        ((it.doctor as { full_name?: string } | null)?.full_name) ?? null,
    }));

  return NextResponse.json({ items });
}
