import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    // 5 intentos por IP cada 15 minutos (ventana fija)
    limiter: Ratelimit.fixedWindow(5, "15 m"),
    prefix: "rl:login",
  });
  return ratelimit;
}

export async function POST(req: NextRequest) {
  const rl = getRatelimit();

  if (rl) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const { success, remaining, reset } = await rl.limit(ip);

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // Exponer cuántos intentos quedan (útil para debugging, opcional)
    void remaining;
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
