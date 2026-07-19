"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // El enlace del correo pasa por /auth/callback (canjea el código por sesión)
    // y luego cae en /restablecer para definir la nueva contraseña.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
    });

    // Mensaje genérico siempre: no revelamos si el correo existe o no
    // (evita enumeración de cuentas). Supabase limita el envío por su cuenta.
    setLoading(false);
    setSent(true);
  }

  return sent ? (
    <div className="space-y-3 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Revisa tu correo</h1>
      <p className="text-sm text-slate-500">
        Si <strong>{email}</strong> está registrado, te enviamos un enlace
        para restablecer tu contraseña. Revisa también la carpeta de spam.
      </p>
      <Link
        href="/login"
        className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
      >
        Volver al inicio de sesión
      </Link>
    </div>
  ) : (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
        <p className="text-sm text-slate-500">
          Ingresa tu correo y te enviaremos un enlace para crear una nueva
          contraseña.
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

      <Button type="submit" loading={loading} className="w-full">
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>

      <Link
        href="/login"
        className="block pt-1 text-center text-sm font-medium text-clinic hover:text-clinic-fg"
      >
        Volver al inicio de sesión
      </Link>
    </form>
  );
}
