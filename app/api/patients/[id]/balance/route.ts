import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { fetchPatientPlanItems } from "@/lib/treatments/planItems";
import { calculateTreatmentTotal } from "@/lib/patientAccount";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = await createClient();

  const [{ data: payments }, planItems] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinicId),
    fetchPatientPlanItems(supabase, patientId),
  ]);

  // El plan es la unica fuente del total. doctor_works contiene sesiones y
  // cuotas; sumarlo volveria a cobrar el mismo tratamiento varias veces.
  const totalWorked = calculateTreatmentTotal(planItems);

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({ totalWorked, totalPaid });
}
