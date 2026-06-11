import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Revoca todas las sesiones anteriores del usuario, dejando activa solo la actual.
// El cliente envía su access_token recién emitido; 'others' elimina el resto.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access_token: string | undefined = body?.access_token;

  if (!access_token) {
    return NextResponse.json({ error: "token requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.signOut(access_token, "others");

  if (error) {
    // No bloqueamos el login por este error; solo lo reportamos.
    console.error("[single-session] error revocando sesiones anteriores:", error.message);
  }

  return NextResponse.json({ ok: true });
}
