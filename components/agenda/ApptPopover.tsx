"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { type MonthAppt, apptName, apptCI, isQuickConsult } from "./apptHelpers";
import { STEP_MIN } from "@/lib/agenda";
import { MiniStatus } from "./MiniStatus";
import { cancelAppointment } from "@/app/(dashboard)/agenda/actions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { Pencil, Link, Trash2 } from "lucide-react";

const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" });

export type PopoverAppt = {
  appt: MonthAppt;
  anchor: DOMRect; // bounding rect del bloque de cita
};

export function ApptPopover({
  appt,
  anchor,
  canWrite,
  onEdit,
  onLink,
  onClose,
}: {
  appt: MonthAppt;
  anchor: DOMRect;
  canWrite: boolean;
  onEdit: () => void;
  onLink: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [canceling, startCancel] = useTransition();

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancelar cita",
      message: `¿Cancelar la cita de ${apptName(appt)}? Esta acción no se puede deshacer.`,
      confirmText: "Sí, cancelar",
      cancelText: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    startCancel(async () => {
      const res = await cancelAppointment(appt.id);
      if (res.error) toast(res.error, "error");
      else {
        toast("Cita cancelada", "success");
        router.refresh();
        onClose();
      }
    });
  }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handle), 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handle);
    };
  }, [onClose]);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const POPOVER_W = 240;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = anchor.right + 8;
  if (left + POPOVER_W > vw - 8) left = anchor.left - POPOVER_W - 8;
  if (left < 8) left = 8;

  let top = anchor.top;
  const estimatedH = 190;
  if (top + estimatedH > vh - 8) top = vh - estimatedH - 8;
  if (top < 8) top = 8;

  const s = new Date(appt.starts_at);
  const e = appt.ends_at
    ? new Date(appt.ends_at)
    : new Date(s.getTime() + STEP_MIN * 60_000);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Acciones de cita"
      style={{ position: "fixed", top, left, width: POPOVER_W, zIndex: 9999 }}
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-100"
    >
      <div className="mb-2 border-b border-slate-100 pb-2">
        <p className="break-words text-sm font-semibold text-slate-800">{apptName(appt)}</p>
        <p className="text-xs text-slate-400 tabular-nums">
          {hhmm(s)} – {hhmm(e)}
        </p>
        {appt.dentist_name && (
          <p className="break-words text-xs text-slate-400">{appt.dentist_name}</p>
        )}
        {appt.reason && (
          <p className="mt-0.5 break-words text-xs italic text-slate-500">{appt.reason}</p>
        )}
      </div>

      {canWrite && (
        <div className="space-y-1.5">
          <MiniStatus id={appt.id} status={appt.status} canWrite={canWrite} iconOnly={false} />

          {isQuickConsult(appt) && onLink && (
            <button
              type="button"
              onClick={() => { onLink(); onClose(); }}
              className="flex w-full items-center gap-1.5 rounded-lg border border-clinic px-2.5 py-1.5 text-xs font-medium text-clinic hover:bg-clinic hover:text-white"
            >
              <Link className="h-3.5 w-3.5" /> Vincular a paciente
            </button>
          )}

          <button
            type="button"
            onClick={() => { onEdit(); onClose(); }}
            className="flex w-full items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar cita
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={canceling}
            className="flex w-full items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {canceling ? "Cancelando…" : "Cancelar cita"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
