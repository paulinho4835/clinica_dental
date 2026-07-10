"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Escucha cambios en anamnesis_invitations y refresca el panel de registros
// entrantes por WhatsApp en vivo. RLS aplica al stream: solo llegan eventos
// de la clínica del usuario.
export function RealtimeIntakes() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pacientes-intakes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "anamnesis_invitations" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
