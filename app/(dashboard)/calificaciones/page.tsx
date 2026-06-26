import { Star, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireNavAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  COMFORT_EMOJI,
  COMFORT_LABEL,
  type ComfortKey,
} from "@/lib/schemas/work-feedback";

type FeedbackRow = {
  id: string;
  rating: number | null;
  comfort: ComfortKey | null;
  comment: string | null;
  submitted_at: string | null;
  expires_at: string;
  doctor: { full_name?: string } | { full_name?: string }[] | null;
  patient: { full_name?: string } | { full_name?: string }[] | null;
  work: { description?: string; performed_at?: string } | { description?: string; performed_at?: string }[] | null;
};

function first<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
          }`}
        />
      ))}
    </span>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function CalificacionesPage() {
  await requireNavAccess("calificaciones");
  const supabase = await createClient();
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  // RLS limita el alcance: admin ve toda la clínica; el doctor ve solo las suyas.
  // El filtro de clínica explícito es defensa en profundidad sobre la RLS.
  let query = supabase
    .from("work_feedback")
    .select(
      "id, rating, comfort, comment, submitted_at, expires_at, doctor:profiles!work_feedback_doctor_id_fkey(full_name), patient:patients!work_feedback_patient_id_fkey(full_name), work:doctor_works!work_feedback_work_id_fkey(description, performed_at)",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (profile?.clinicId) query = query.eq("clinic_id", profile.clinicId);
  const { data } = await query.returns<FeedbackRow[]>();

  const rows = data ?? [];
  const answered = rows.filter((r) => r.submitted_at && r.rating);
  const now = Date.now();
  const pendingCount = rows.filter(
    (r) => !r.submitted_at && new Date(r.expires_at).getTime() > now,
  ).length;

  const total = answered.length;
  const avg =
    total > 0
      ? answered.reduce((s, r) => s + (r.rating ?? 0), 0) / total
      : 0;

  // Resumen por doctor (solo admin).
  const byDoctor = isAdmin
    ? (() => {
        const map = new Map<string, { name: string; count: number; sum: number }>();
        for (const r of answered) {
          const name = first(r.doctor)?.full_name ?? "Sin asignar";
          if (!map.has(name)) map.set(name, { name, count: 0, sum: 0 });
          const e = map.get(name)!;
          e.count++;
          e.sum += r.rating ?? 0;
        }
        return [...map.values()]
          .map((e) => ({ name: e.name, count: e.count, avg: e.sum / e.count }))
          .sort((a, b) => b.avg - a.avg);
      })()
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Calificaciones"
        subtitle={
          isAdmin
            ? "Opiniones de los pacientes sobre cada trabajo, por doctor."
            : "Las opiniones de tus pacientes sobre tu atención."
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Promedio general"
          value={total > 0 ? `${avg.toFixed(1)} ★` : "—"}
          icon={<Star className="h-5 w-5" />}
          valueClassName="text-amber-500"
        />
        <Stat
          label="Calificaciones recibidas"
          value={String(total)}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <Stat
          label="Pendientes de responder"
          value={String(pendingCount)}
          valueClassName={pendingCount > 0 ? "text-slate-500" : "text-emerald-600"}
        />
      </div>

      {/* Resumen por doctor (admin) */}
      {byDoctor.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Promedio por doctor</h2>
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_6rem_10rem] px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Doctor</span>
              <span className="text-right">Opiniones</span>
              <span className="text-right">Promedio</span>
            </div>
            {byDoctor.map((d) => (
              <div
                key={d.name}
                className="grid grid-cols-[minmax(0,1fr)_6rem_10rem] items-center border-t border-slate-100 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-800">{d.name}</span>
                <span className="text-right tabular-nums text-slate-500">
                  {d.count}
                </span>
                <span className="flex items-center justify-end gap-2 tabular-nums font-medium text-amber-500">
                  {d.avg.toFixed(1)} <Stars value={Math.round(d.avg)} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lista de opiniones */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">
          {total} opinión{total !== 1 ? "es" : ""}
        </h2>
        <div className="space-y-3">
          {answered.map((r) => {
            const doctorName = first(r.doctor)?.full_name ?? "—";
            const patientName = first(r.patient)?.full_name ?? "Paciente";
            const work = first(r.work);
            return (
              <div
                key={r.id}
                className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating ?? 0} />
                    {r.comfort && (
                      <span className="text-sm text-slate-500">
                        {COMFORT_EMOJI[r.comfort]} {COMFORT_LABEL[r.comfort]}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {r.submitted_at ? fmtDate(r.submitted_at) : ""}
                  </span>
                </div>
                {r.comment && (
                  <p className="mt-2 text-sm text-slate-700">“{r.comment}”</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {patientName}
                  {work?.description ? ` · ${work.description}` : ""}
                  {isAdmin && doctorName !== "—" ? ` · Dr(a). ${doctorName}` : ""}
                </p>
              </div>
            );
          })}
          {total === 0 && (
            <EmptyState
              icon={<Star className="h-6 w-6" />}
              title="Aún no hay calificaciones"
              description="Cuando un paciente responda el enlace que envíes desde Mis trabajos, su opinión aparecerá aquí."
            />
          )}
        </div>
      </section>
    </div>
  );
}
