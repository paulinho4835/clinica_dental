"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Pasar por nuestro endpoint para aplicar rate limiting antes de llegar a Supabase.
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body.error ?? "Error al iniciar sesión.");
      setPassword("");
      return;
    }

    const data = await res.json();

    // Supabase necesita que el browser tenga la cookie de sesión.
    // Usamos el cliente del browser para establecerla a partir del token obtenido.
    const supabase = createClient();
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    setLoading(false);
    router.push("/agenda");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-clinic">
          Bienvenido de nuevo
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Iniciar sesión</h1>
        <p className="text-sm text-slate-500">
          Ingresa con tu cuenta de la clínica.
        </p>
      </div>

      <Field
        label="Correo"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="text-right">
        <Link
          href="/recuperar"
          className="text-sm font-medium text-clinic hover:text-clinic-fg"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      {error && (
        <p key={error} className="animate-shake text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Entrando…" : "Entrar"}
      </Button>

      <p className="pt-2 text-center text-xs text-slate-400">
        Al ingresar aceptas los{" "}
        <a href="/terminos" className="text-clinic hover:underline">
          Términos
        </a>{" "}
        y la{" "}
        <a href="/privacidad" className="text-clinic hover:underline">
          Política de Privacidad
        </a>
        .
      </p>
    </form>
  );
}
