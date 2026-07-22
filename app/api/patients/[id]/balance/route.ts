import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { fetchPatientPlanItems } from "@/lib/treatments/planItems";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = await createClient();

  const [{ data: works }, { data: payments }, planItems] = await Promise.all([
    supabase
      .from("doctor_works")
      .select("cost, treatment_item_id")
      .eq("patient_id", patientId),
    supabase
      .from("payments")
      .select("amount")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinicId),
    fetchPatientPlanItems(supabase, patientId),
  ]);

  // "Total facturado" = costo de sesiones ya registradas (doctor_works) +
  // precio de tratamientos del plan que AÚN no tienen ninguna sesión
  // registrada. Misma fórmula que /cuentas (ver lib/treatments/planItems.ts) —
  // antes esto solo sumaba treatment_items y un trabajo suelto (sin ítem de
  // plan vinculado) hacía que "Facturado" mostrara Bs 0 aunque el paciente
  // ya hubiera pagado por él.
  const itemIdsWithWork = new Set(
    (works ?? [])
      .map((w) => w.treatment_item_id as string | null)
      .filter((id): id is string => !!id),
  );
  const unstartedPlanItemsTotal = planItems
    .filter((item) => !itemIdsWithWork.has(item.id))
    .reduce((s, item) => s + item.price, 0);

  const totalWorked =
    (works ?? []).reduce((s, w) => s + Number(w.cost), 0) + unstartedPlanItemsTotal;

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({ totalWorked, totalPaid });
}
