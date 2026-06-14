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

  const [{ data: works }, { data: payments }] = await Promise.all([
    supabase
      .from("doctor_works")
      .select("cost")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinicId),
    supabase
      .from("payments")
      .select("amount")
      .eq("patient_id", patientId)
      .eq("clinic_id", profile.clinicId),
  ]);

  const totalWorked = (works ?? []).reduce((s, w) => s + Number(w.cost), 0);
  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({ totalWorked, totalPaid });
}
