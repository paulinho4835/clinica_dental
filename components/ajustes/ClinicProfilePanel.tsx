"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateClinicProfile, type ActionState } from "@/app/(dashboard)/ajustes/actions";

export type ClinicProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  nit: string | null;
  logo_url: string | null;
  currency: string;
};

const initial: ActionState = {};

export function ClinicProfilePanel({
  profile,
  canWrite,
}: {
  profile: ClinicProfile;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateClinicProfile, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={formAction}
      className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {/* Nombre */}
        <label className="sm:col-span-2 text-xs">
          <span className="mb-1 block font-medium text-slate-600">
            Nombre de la clínica *
          </span>
          <input
            name="name"
            type="text"
            required
            defaultValue={profile.name}
            disabled={!canWrite}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        {/* Dirección */}
        <label className="sm:col-span-2 text-xs">
          <span className="mb-1 block font-medium text-slate-600">Dirección</span>
          <input
            name="address"
            type="text"
            defaultValue={profile.address ?? ""}
            disabled={!canWrite}
            placeholder="ej. Av. América 123, Cochabamba"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        {/* Teléfono */}
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Teléfono</span>
          <input
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ""}
            disabled={!canWrite}
            placeholder="ej. 71234567"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        {/* NIT / RUC */}
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">NIT / RUC</span>
          <input
            name="nit"
            type="text"
            defaultValue={profile.nit ?? ""}
            disabled={!canWrite}
            placeholder="ej. 1234567890"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        {/* Moneda */}
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Moneda</span>
          <select
            name="currency"
            defaultValue={profile.currency}
            disabled={!canWrite}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="Bs">Bs — Boliviano</option>
            <option value="S/">S/ — Sol peruano</option>
            <option value="$">$ — Peso / genérico</option>
            <option value="US$">US$ — Dólar</option>
            <option value="€">€ — Euro</option>
          </select>
        </label>

        {/* Logo URL */}
        <label className="sm:col-span-2 text-xs">
          <span className="mb-1 block font-medium text-slate-600">URL del logo</span>
          <input
            name="logo_url"
            type="url"
            defaultValue={profile.logo_url ?? ""}
            disabled={!canWrite}
            placeholder="https://..."
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Imagen pública accesible por URL. Se usará en documentos impresos.
          </span>
        </label>

        {/* Preview del logo */}
        {profile.logo_url && (
          <div className="sm:col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.logo_url}
              alt="Logo de la clínica"
              className="h-16 w-auto rounded border border-slate-200 object-contain p-1"
            />
          </div>
        )}
      </div>

      {canWrite && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {state.ok && !state.error && (
            <p className="text-sm text-emerald-600">Guardado correctamente.</p>
          )}
          {!state.error && !state.ok && <span />}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </form>
  );
}
