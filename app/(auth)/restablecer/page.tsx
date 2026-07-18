"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Status = "checking" | "ready" | "invalid";

export default function RestablecerPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // El enlace del correo pasó por /auth/callback, que canjeó el código por una
  // sesión de recuperación. Si hay sesión, mostramos el formulario; si no, el
  // enlace expiró o es inválido.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setStatus(data.user ? "ready" : "invalid");
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError("No se pudo actualizar la contraseña. Solicita un enlace nuevo.");
      return;
    }

    // Contraseña cambiada: ya tiene sesión válida, lo llevamos al panel.
    router.push("/agenda");
    router.refresh();
  }

  return (
    <>
      {status === "checking" && (
        <p className="text-center text-sm text-slate-500">Verificando enlace…</p>
      )}

      {status === "invalid" && (
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Enlace no válido</h1>
          <p className="text-sm text-slate-500">
            El enlace para restablecer tu contraseña expiró o ya fue usado.
            Solicita uno nuevo.
          </p>
          <Link
            href="/recuperar"
            className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
          >
            Solicitar enlace nuevo
          </Link>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Nueva contraseña</h1>
            <p className="text-sm text-slate-500">
              Define una contraseña nueva para tu cuenta.
            </p>
          </div>

          <Field
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Repetir contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && (
            <p key={error} role="alert" className="animate-shake text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      )}
    </>
  );
}
