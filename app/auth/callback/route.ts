import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Supabase redirige aquí en dos casos y ambos dejan la sesión en cookies SSR:
//   1. magic link / OAuth → ?code=...        → exchangeCodeForSession
//   2. enlace de correo (invitación, recuperación, confirmación) con
//      ?token_hash=...&type=...              → verifyOtp
// Luego redirige a `next` (?next=/bienvenida, /restablecer, etc.).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/agenda";

  const supabase = await createClient();
  if (tokenHash && type) {
    await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
