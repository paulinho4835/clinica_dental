"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Users } from "lucide-react";
import type { Features, FeatureKey } from "@/lib/features";
import { FeatureToggle } from "@/components/superadmin/FeatureToggle";
import { AddonToggle } from "@/components/superadmin/AddonToggle";
import { PlanSelect } from "@/components/superadmin/PlanSelect";
import { ClinicUsers, type ClinicUser } from "@/components/superadmin/ClinicUsers";
import { AddUserForm } from "@/components/superadmin/AddUserForm";
import { EditClinicName } from "@/components/superadmin/EditClinicName";
import { DeleteClinicButton } from "@/components/superadmin/DeleteClinicButton";
import { SuspendClinicButton } from "@/components/superadmin/SuspendClinicButton";
import { MaxUsersInput } from "@/components/superadmin/MaxUsersInput";
import { EnterClinicButton } from "@/components/superadmin/EnterClinicButton";

type FeatureItem = { key: FeatureKey; label: string };

export type ClinicRow = {
  id: string;
  name: string;
  plan: string;
  features: Features;
  active: boolean;
  max_users: number;
  created_at: string;
  users: ClinicUser[];
};

type SortOption = { key: string; label: string };

export function ClinicList({
  clinics,
  modules,
  addons,
  sort,
  sorts,
}: {
  clinics: ClinicRow[];
  modules: FeatureItem[];
  addons: FeatureItem[];
  sort: string;
  sorts: readonly SortOption[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) => c.name.toLowerCase().includes(q));
  }, [search, clinics]);

  return (
    <section className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Clínicas{" "}
          <span className="text-slate-400">
            ({search ? `${filtered.length} de ${clinics.length}` : clinics.length})
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar clínica…"
              className="w-48 rounded-full border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic sm:w-56"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Ordenar:</span>
            {sorts.map((s) => (
              <Link
                key={s.key}
                href={`/superadmin?sort=${s.key}`}
                scroll={false}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  sort === s.key
                    ? "bg-clinic text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Listado */}
      {filtered.map((c) => (
        <ClinicCard key={c.id} clinic={c} modules={modules} addons={addons} />
      ))}

      {!clinics.length && (
        <p className="text-sm text-slate-500">Sin clínicas registradas aún.</p>
      )}
      {!!clinics.length && !filtered.length && (
        <p className="text-sm text-slate-500">
          Ninguna clínica coincide con “{search}”.
        </p>
      )}
    </section>
  );
}

function ClinicCard({
  clinic: c,
  modules,
  addons,
}: {
  clinic: ClinicRow;
  modules: FeatureItem[];
  addons: FeatureItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-xl bg-white shadow-sm ring-1 transition ${
        c.active ? "ring-slate-200" : "ring-amber-300"
      }`}
    >
      {/* Encabezado (siempre visible) */}
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Contraer" : "Expandir"}
            className="mt-0.5 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EditClinicName clinicId={c.id} name={c.name} />
              {c.active ? (
                <span className="rounded-full bg-clinic/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clinic-fg">
                  Activa
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Suspendida
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <MaxUsersInput
                  clinicId={c.id}
                  maxUsers={c.max_users ?? 10}
                  currentCount={c.users.length}
                />
              </span>
              <span className="text-slate-300">·</span>
              <span>{new Date(c.created_at).toLocaleDateString("es-BO")}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <EnterClinicButton clinicId={c.id} />
          <PlanSelect clinicId={c.id} plan={c.plan} />
          <SuspendClinicButton clinicId={c.id} clinicName={c.name} active={c.active} />
          <DeleteClinicButton clinicId={c.id} clinicName={c.name} />
        </div>
      </div>

      {/* Detalle (colapsable) */}
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-5 pt-4">
          {/* Módulos principales */}
          <div>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Módulos
            </h3>
            <div className="flex flex-wrap gap-2">
              {modules.map((f) => (
                <FeatureToggle
                  key={f.key}
                  clinicId={c.id}
                  featureKey={f.key}
                  label={f.label}
                  enabled={c.features[f.key]}
                />
              ))}
            </div>
          </div>

          {/* Add-ons opcionales */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Add-ons
            </h3>
            <div className="flex flex-wrap gap-2">
              {addons.map((f) => (
                <AddonToggle
                  key={f.key}
                  clinicId={c.id}
                  featureKey={f.key}
                  label={f.label}
                  enabled={c.features[f.key]}
                />
              ))}
            </div>
          </div>

          {/* Usuarios */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Usuarios
            </h3>
            <ClinicUsers users={c.users} />
            <AddUserForm clinicId={c.id} />
          </div>
        </div>
      )}
    </div>
  );
}
