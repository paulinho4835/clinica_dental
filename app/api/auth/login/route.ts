import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, tooManyRequestsMessage } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const { ok, retryAfterSeconds } = await checkRateLimit(
    "login",
    clientIp(req.headers),
  );
  if (!ok) {
    return NextResponse.json(
      { error: tooManyRequestsMessage(retryAfterSeconds) },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Parsear credenciales
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Correo y contraseña requeridos." }, { status: 400 });
  }

  // Delegar la autenticación a Supabase desde el servidor
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error_description ?? data.msg ?? "Credenciales incorrectas." },
      { status: res.status },
    );
  }

  return NextResponse.json(data, { status: 200 });
}
