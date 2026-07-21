"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Link as LinkIcon, Unlink } from "lucide-react";
import { disconnectGoogleCalendar } from "@/app/(dashboard)/ajustes/google-calendar-actions";
import { toast } from "@/lib/toast";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Vinculación de Google Calendar del doctor: sus citas agendadas en el
// sistema se replican automáticamente en su calendario personal (primary).
export function GoogleCalendarPanel({ connected }: { connected: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const gcalStatus = params.get("gcal");

  useEffect(() => {
    if (gcalStatus === "ok") toast("Google Calendar conectado", "success");
    if (gcalStatus === "error") toast("No se pudo conectar Google Calendar", "error");
    if (gcalStatus) router.replace("/ajustes");
  }, [gcalStatus, router]);

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectGoogleCalendar();
      if (res.ok) {
        toast("Google Calendar desconectado", "success");
        router.refresh();
      } else {
        toast(res.error ?? "No se pudo desconectar", "error");
      }
    });
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="max-w-sm">
        {connected ? (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <CalendarCheck className="h-4 w-4" /> Conectado
            </span>
            <button type="button" className={btn} disabled={pending} onClick={disconnect}>
              <Unlink className="h-3.5 w-3.5" /> Desconectar
            </button>
          </div>
        ) : (
          <a href="/api/google-calendar/connect" className={btn}>
            <LinkIcon className="h-3.5 w-3.5" /> Conectar Google Calendar
          </a>
        )}
      </div>
    </div>
  );
}
