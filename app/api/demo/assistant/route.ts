import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInboundAssistant, type VapiClinicConfig } from "@/lib/vapi";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? process.env.VAPI_CLINIC_ID ?? "";

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, settings")
    .eq("id", clinicId)
    .single();

  if (!clinic) {
    return NextResponse.json({ error: "Clínica no encontrada" }, { status: 404 });
  }

  const vapiConfig = (clinic.settings ?? {}) as VapiClinicConfig;
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  const assistantConfig = buildInboundAssistant(clinic.name, vapiConfig, todayISO);

  const webhookUrl =
    (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clinica-dental-one-vert.vercel.app") +
    "/api/vapi/webhook";

  return NextResponse.json({
    clinicName: clinic.name,
    assistant: {
      ...assistantConfig,
      // clinicId en metadata: el webhook lo lee para saber a qué clínica
      // pertenece cada tool call (get_doctors, book_appointment, etc.)
      metadata: { clinicId },
      server: { url: webhookUrl },
    },
  });
}
