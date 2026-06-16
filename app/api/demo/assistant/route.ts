import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ID del asistente "Recepcionista Dentica" configurado en el dashboard de Vapi.
// Usar este ID garantiza la misma voz, modelo y configuración que la versión de producción.
const VAPI_DEMO_ASSISTANT_ID =
  process.env.VAPI_DEMO_ASSISTANT_ID ?? "a1e45a77-f58d-4d2d-af5a-734db89f2c1e";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? process.env.VAPI_CLINIC_ID ?? "";

  let clinicName = "la clínica";

  if (clinicId) {
    const admin = createAdminClient();
    const { data: clinic } = await admin
      .from("clinics")
      .select("name")
      .eq("id", clinicId)
      .single();
    if (clinic) clinicName = clinic.name;
  }

  return NextResponse.json({
    clinicName,
    assistantId: VAPI_DEMO_ASSISTANT_ID,
  });
}
