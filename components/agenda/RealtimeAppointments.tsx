"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Escucha cambios en la tabla appointments y refresca el tablero en vivo.
// RLS aplica al stream: solo llegan eventos de la clínica del usuario.
export function RealtimeAppointments() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agenda-citas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
