import { createAdminClient } from "@/lib/supabase/admin";
import { BOLIVIA_TZ } from "@/lib/format";
import { ConfirmActions } from "./ConfirmActions";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        {children}
      </div>
    </div>
  );
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </div>
    </Shell>
  );
}

type ApptRow = {
  id: string;
  status: string;
  starts_at: string;
  dentist_name: string | null;
  reason: string | null;
  patient_name: string | null;
  patients: { full_name: string | null } | null;
  clinics: { name: string | null } | null;
};

export default async function ConfirmAppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("appointments")
    .select(
      "id, status, starts_at, dentist_name, reason, patient_name, patients(full_name), clinics(name)",
    )
    .eq("confirm_token", token)
    .maybeSingle();

  const appt = data as ApptRow | null;

  if (!appt) {
    return (
      <Notice
        title="Enlace no válido"
        message="No encontramos tu cita. El enlace puede haber expirado o ser incorrecto. Contacta a la clínica."
      />
    );
  }

  const starts = new Date(appt.starts_at);
  const dateLabel = starts.toLocaleDateString("es-BO", {
    timeZone: BOLIVIA_TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const timeLabel = starts.toLocaleTimeString("es-BO", {
    timeZone: BOLIVIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

  const name = appt.patients?.full_name ?? appt.patient_name ?? "";
  const clinic = appt.clinics?.name ?? "la clínica";
  const isPast = starts.getTime() < Date.now();

  return (
    <Shell>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-clinic">
          {clinic}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">
          {name ? `Hola ${name} 👋` : "Tu cita"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tienes una cita programada:
        </p>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left ring-1 ring-slate-100">
          <div className="text-base font-semibold capitalize text-slate-800">
            {dateLabel}
          </div>
          <div className="text-sm text-slate-600">a las {timeLabel}</div>
          {appt.dentist_name && (
            <div className="mt-1 text-sm text-slate-500">
              con {appt.dentist_name}
            </div>
          )}
          {appt.reason && (
            <div className="mt-1 text-sm italic text-slate-400">{appt.reason}</div>
          )}
        </div>
      </div>

      <ConfirmActions
        token={token}
        initialStatus={appt.status}
        isPast={isPast}
      />

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Si necesitas reprogramar, comunícate directamente con {clinic}.
      </p>
    </Shell>
  );
}
