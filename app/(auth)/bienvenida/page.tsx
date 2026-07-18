"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Status = "checking" | "ready" | "invalid";

// Página de bienvenida del usuario invitado. El enlace del correo de invitación
// trae la sesión; aquí el usuario define su propia contraseña por primera vez.
export default function BienvenidaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    function ready(userEmail: string | null | undefined) {
      setEmail(userEmail ?? "");
      setStatus("ready");
    }

    // El cliente detecta la sesión del enlace de invitación de forma asíncrona.
    // Escuchamos el evento y, como respaldo, consultamos getUser con un margen.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) ready(session.user.email);
    });

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        ready(data.user.email);
      } else {
        setTimeout(() => {
          supabase.auth.getUser().then(({ data: d2 }) => {
            if (d2.user) ready(d2.user.email);
            else setStatus("invalid");
          });
        }, 1500);
      }
    });

    return () => sub.subscription.unsubscribe();
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
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) {
      setLoading(false);
      setError("No se pudo guardar la contraseña. Solicita una invitación nueva.");
      return;
    }

    router.push("/agenda");
    router.refresh();
  }

  return (
    <>
      {status === "checking" && (
        <p className="text-center text-sm text-slate-500">Verificando invitación…</p>
      )}

      {status === "invalid" && (
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Invitación no válida</h1>
          <p className="text-sm text-slate-500">
            Este enlace de invitación expiró o ya fue usado. Pide a quien te
            invitó que te envíe uno nuevo.
          </p>
          <Link
            href="/login"
            className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
          >
            Ir al inicio de sesión
          </Link>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">¡Te damos la bienvenida!</h1>
            <p className="text-sm text-slate-500">
              {email ? <>Estás creando la cuenta de <strong>{email}</strong>. </> : null}
              Define una contraseña para acceder.
            </p>
          </div>

          <Field
            label="Contraseña"
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
            <p key={error} className="animate-shake text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Guardando…" : "Crear mi cuenta"}
          </Button>
        </form>
      )}
    </>
  );
}
