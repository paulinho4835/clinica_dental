"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closeCashSession,
  openCashSession,
  type ActionState,
} from "@/app/(dashboard)/caja/actions";
import { bs } from "@/lib/format";

const initial: ActionState = {};

export type OpenSession = {
  id: string;
  opened_at: string;
  opening_float: number;
} | null;

export function CashSessionPanel({ session }: { session: OpenSession }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(openCashSession, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [closing, startClose] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  if (session) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="text-sm">
          <span className="font-semibold text-green-700">Caja abierta</span>
          <span className="ml-3 text-slate-500">
            Desde {new Date(session.opened_at).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {" · "}Fondo {bs(Number(session.opening_float))}
          </span>
        </div>
        <button
          disabled={closing}
          onClick={() =>
            startClose(async () => {
              setErr(null);
              const res = await closeCashSession(session.id);
              if (res.error) setErr(res.error);
              else router.refresh();
            })
          }
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {closing ? "Cerrando…" : "Cerrar caja"}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Fondo inicial</span>
        <input
          name="opening_float"
          type="number"
          step="0.01"
          min="0"
          defaultValue={0}
          className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {pending ? "Abriendo…" : "Abrir caja"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
