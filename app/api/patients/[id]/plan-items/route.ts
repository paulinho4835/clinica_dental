import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPatientPlanItems, type PlanItemRow } from "@/lib/treatments/planItems";

export type { PlanItemRow };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await fetchPatientPlanItems(supabase, patientId);
  return NextResponse.json({ items });
}
