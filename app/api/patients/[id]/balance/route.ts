import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = await createClient();

  const [{ data: plans }, { data: payments }] = await Promise.all([
    // Suma precios del plan de tratamiento (misma fuente que la Cuenta del paciente en la ficha)
    supabase
      .from("treatment_plans")
      .select(
        "treatment_phases(treatment_items(price, status))",
      )
      .eq("patient_id", patientId),
    supabase
      .from("payments")
      .select("amount")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinicId),
  ]);

  // Sumar precios de ítems activos del plan
  const planItems = (plans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .filter((it) => (it.status as string) !== "cancelled");

  const totalWorked =
    planItems.length > 0
      ? planItems.reduce((s, it) => s + Number(it.price), 0)
      : 0;

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({ totalWorked, totalPaid });
}
