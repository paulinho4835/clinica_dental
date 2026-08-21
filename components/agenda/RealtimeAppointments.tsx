"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Escucha cambios en la tabla appointments y refresca el tablero en vivo.
// RLS aplica al stream: solo llegan eventos de la clínica del usuario.
export type AppointmentRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export function RealtimeAppointments({
  clinicId,
  userId,
  canViewAll,
  onChange,
}: {
  clinicId: string;
  userId: string;
  canViewAll: boolean;
  onChange: (payload: AppointmentRealtimePayload) => void;
}) {

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agenda-citas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: canViewAll
            ? `clinic_id=eq.${clinicId}`
            : `dentist_id=eq.${userId}`,
        },
        (payload) => onChange(payload as AppointmentRealtimePayload),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewAll, clinicId, onChange, userId]);

  return null;
}
