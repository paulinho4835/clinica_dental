import { Briefcase, Banknote, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireNavAccess } from "@/lib/guard";
import { money, boliviaTodayISO, fmtBoliviaTime } from "@/lib/format";
import { Stat } from "@/components/ui/Stat";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { WorkForm } from "@/components/mis-trabajos/WorkForm";
import { DeleteWorkButton } from "@/components/mis-trabajos/DeleteWorkButton";
import { EditWorkButton } from "@/components/mis-trabajos/EditWorkButton";
import { RequestFeedbackButton } from "@/components/mis-trabajos/RequestFeedbackButton";
import { DoctorFilter } from "@/components/mis-trabajos/DoctorFilter";
import { MethodFilter } from "@/components/mis-trabajos/MethodFilter";
import { DateRangeFilter } from "@/components/mis-trabajos/DateRangeFilter";
import { ExportCsvButton, type CsvWorkRow } from "@/components/mis-trabajos/ExportCsvButton";
import { PrintPdfButton } from "@/components/mis-trabajos/PrintPdfButton";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getClinicFeatures, getClinicCurrency } from "@/lib/superadmin";
import { isReceptionistLike } from "@/lib/rbac";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transf.",
};

type WorkRow = {
  id: string;
  description: string;
  cost: number;
  commission_pct: number;
  commission_amount: number;
  amount_paid: number;
  payment_method: string | null;
  performed_at: string;
  created_at: string;
  notes: string | null;
  lab_work: string | null;
  lab_cost: number;
  lab_commission_pct: number;
  lab_commission_amount: number;
  patient_name: string | null;
  commission_paid: boolean;
  // Abonos parciales de comisión recibidos (0 = nada abonado aún).
  commission_paid_amount: number;
  // null = trabajo registrado antes de existir el campo (sin dato).
  invoiced: boolean | null;
  patients: { full_name?: string } | null;
  doctor: { full_name?: string } | null;
  collected_by: { name?: string } | null;
};

type DoctorSummaryRow = {
  name: string;
  count: number;
  pendingComm: number;
};

export default async function MisTrabajosPage({
  searchParams,
}: {
  searchParams: Promise<{ doctor?: string; method?: string; from?: string; to?: string }>;
}) {
  await requireNavAccess("mis_trabajos");
  const supabase = await createClient();
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const isRecepcionista = isReceptionistLike(profile?.role);
  const isDoctor = profile?.role === "odontologo_general" || profile?.role === "especialista";
  const canPickDoctor = isAdmin || isRecepcionista;
  // Botón "Pedir calificación": solo admin/recepción (ven el teléfono) y solo si
  // el addon de calificaciones está activo para la clínica.
  const features = await getClinicFeatures();
  const currency = await getClinicCurrency();
  const canSendFeedback = (isAdmin || isRecepcionista) && features.calificaciones;
  const today = boliviaTodayISO();

  const resolvedParams = await searchParams;
  const doctorParam = canPickDoctor ? (resolvedParams.doctor ?? "") : "";
  const methodParam = ["cash", "qr", "card"].includes(resolvedParams.method ?? "")
    ? (resolvedParams.method ?? "")
    : "";
  const fromParam = resolvedParams.from ?? "";
  const toParam = resolvedParams.to ?? "";
  // Sin filtro de fecha, la query trae solo el día de hoy en vez de TODO el
  // historial de la clínica desde el día uno (crecía sin límite). fromParam/
  // toParam (crudos, sin este default) se conservan para la UI — el filtro
  // de fecha, el nombre del CSV y el mensaje de "sin resultados" deben seguir
  // reflejando lo que el usuario realmente eligió, no este default interno.
  const hasDateFilter = Boolean(fromParam || toParam);
  const effectiveFrom = fromParam || (hasDateFilter ? "" : today);
  const effectiveTo = toParam || (hasDateFilter ? "" : today);

  const selectedDoctor = canPickDoctor
    ? doctorParam === "all"
      ? "all"
      : doctorParam || (isAdmin ? (profile?.userId ?? "") : "all")
    : "";

  // Cliente normal con RLS para todos los roles (ya no service-role): la
  // migración 0055 da a la recepcionista acceso de lectura por RLS. El
  // aislamiento por clínica queda doblemente cubierto (RLS + filtro explícito).
  let worksQuery = supabase
    .from("doctor_works")
    .select(
      "id, description, cost, commission_pct, commission_amount, amount_paid, payment_method, performed_at, created_at, notes, lab_work, lab_cost, treatment_lab_cost, lab_commission_pct, lab_commission_amount, patient_name, commission_paid, commission_paid_amount, invoiced, patients(full_name), doctor:profiles!doctor_works_doctor_id_fkey(full_name), collected_by:clinic_receptionists!doctor_works_collected_by_id_fkey(name)",
    )
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false });

  // Aislamiento por clínica EXPLÍCITO (defensa en profundidad), no opcional:
  // aunque ahora todos los roles usan el cliente con RLS, este filtro refuerza
  // la RLS por si el claim clinic_id del JWT no estuviera, y es la barrera que
  // garantiza no ver trabajos de otras clínicas.
  if (profile) {
    worksQuery = worksQuery.eq("clinic_id", profile.clinicId);
  }
  if (canPickDoctor && selectedDoctor && selectedDoctor !== "all") {
    worksQuery = worksQuery.eq("doctor_id", selectedDoctor);
  } else if (!canPickDoctor && profile) {
    worksQuery = worksQuery.eq("doctor_id", profile.userId);
  }
  if (methodParam) {
    worksQuery = worksQuery.eq("payment_method", methodParam);
  }
  if (effectiveFrom) {
    worksQuery = worksQuery.gte("performed_at", effectiveFrom);
  }
  if (effectiveTo) {
    worksQuery = worksQuery.lte("performed_at", effectiveTo);
  }

  const platformAdminIds = canPickDoctor ? await getPlatformAdminIds() : [];

  let recepcionistasQuery = (isRecepcionista || isAdmin) && profile
    ? supabase
        .from("clinic_receptionists")
        .select("id, name")
        .eq("clinic_id", profile.clinicId)
        .eq("active", true)
        .order("name")
    : null;

  let doctorsQuery = canPickDoctor && profile
    ? supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["admin", "odontologo_general", "especialista", "colega"])
        .eq("clinic_id", profile.clinicId)
        .eq("active", true)
        .order("full_name")
    : null;
  if (doctorsQuery && platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  // Doctores/colegas (no pueden elegir doctor): solo ven pacientes con los
  // que ya tuvieron contacto real (cita, trabajo, o ítem de plan asignado a
  // ellos). Calculado en SQL (visible_patients_for_work_doctor, migración
  // 0102) en vez de traer historial completo de 3 tablas a JS.
  const patientsQuery =
    !canPickDoctor && profile
      ? supabase.rpc("visible_patients_for_work_doctor", {
          p_clinic_id: profile.clinicId,
          p_doctor_id: profile.userId,
          p_dentist_name: profile.fullName,
        })
      : (() => {
          let q = supabase.from("patients").select("id, full_name, national_id").order("full_name");
          if (profile) q = q.eq("clinic_id", profile.clinicId);
          return q;
        })();

  const [{ data: works }, { data: patients }, { data: doctorProfiles }, { data: recepData }] =
    await Promise.all([
      worksQuery,
      patientsQuery,
      doctorsQuery ?? Promise.resolve({ data: null }),
      recepcionistasQuery ?? Promise.resolve({ data: null }),
    ]);

  const rows = (works as WorkRow[] | null) ?? [];
  const totalCost = rows.reduce((s, w) => s + Number(w.cost), 0);
  const totalPaid = rows.reduce((s, w) => s + Number(w.amount_paid), 0);
  const todayPaid = isRecepcionista
    ? rows
        .filter((w) => w.performed_at === today)
        .reduce((s, w) => s + Number(w.amount_paid), 0)
    : totalPaid;

  // Comisiones pendientes de pago (visible en el período/filtro actual).
  // Pendiente = comisión total − abonos parciales recibidos: un trabajo con
  // adelanto cuenta solo por su restante, para cuadrar con /pagos.
  const totalPendingCommission = !isRecepcionista
    ? rows
        .filter((w) => !w.commission_paid)
        .reduce(
          (s, w) =>
            s +
            Math.max(
              0,
              Number(w.commission_amount) +
                Number(w.lab_commission_amount) -
                Number(w.commission_paid_amount ?? 0),
            ),
          0,
        )
    : 0;

  // Resumen por doctor (solo admin viendo todos)
  const doctorSummary: DoctorSummaryRow[] =
    isAdmin && selectedDoctor === "all" && rows.length > 0
      ? (() => {
          const map = new Map<string, DoctorSummaryRow>();
          for (const w of rows) {
            const name = w.doctor?.full_name ?? "Sin asignar";
            if (!map.has(name)) map.set(name, { name, count: 0, pendingComm: 0 });
            const entry = map.get(name)!;
            entry.count++;
            const comm = Number(w.commission_amount) + Number(w.lab_commission_amount);
            if (!w.commission_paid)
              entry.pendingComm += Math.max(0, comm - Number(w.commission_paid_amount ?? 0));
          }
          return [...map.values()].sort((a, b) => b.pendingComm - a.pendingComm);
        })()
      : [];

  const csvRows: CsvWorkRow[] = rows.map((w) => ({
    fecha: w.performed_at,
    paciente: w.patients?.full_name ?? w.patient_name ?? "",
    doctor: w.doctor?.full_name ?? "",
    cobrado_por:
      w.collected_by?.name ?? (w.amount_paid > 0 ? (w.doctor?.full_name ?? "") : ""),
    trabajo: w.description,
    lab_trabajo: w.lab_work ?? "",
    costo: Number(w.cost),
    lab_costo: Number(w.lab_cost),
    comision_pct: Number(w.commission_pct),
    comision_bs: Number(w.commission_amount) + Number(w.lab_commission_amount),
    cobrado: Number(w.amount_paid),
    metodo: w.payment_method ?? "",
    factura: w.invoiced === true ? "Sí" : w.invoiced === false ? "No" : "",
    comision_pagada: w.commission_paid
      ? "Sí"
      : Number(w.commission_paid_amount ?? 0) > 0
        ? `Parcial (${Number(w.commission_paid_amount).toFixed(2)})`
        : "No",
    notas: w.notes ?? "",
  }));

  const csvFilename =
    fromParam || toParam
      ? `trabajos-${fromParam || "inicio"}-a-${toParam || "hoy"}.csv`
      : `trabajos-${today}.csv`;

  const sortedDoctors = doctorProfiles
    ? [
        ...(doctorProfiles.filter((d) => d.id === profile?.userId) ?? []),
        ...(doctorProfiles.filter((d) => d.id !== profile?.userId) ?? []),
      ]
    : [];

  const selectedName =
    selectedDoctor === "all"
      ? null
      : sortedDoctors.find((d) => d.id === selectedDoctor)?.full_name;

  const doctorNameForPrint =
    selectedDoctor === "all"
      ? "Todos los doctores"
      : selectedName ?? profile?.fullName ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={canPickDoctor ? "Trabajos y comisiones" : "Mis trabajos"}
          subtitle={
            canPickDoctor
              ? selectedName
                ? `Mostrando trabajos de ${selectedName}.`
                : "Trabajos registrados por todos los doctores de la clínica."
              : "Registra tus trabajos; la comisión se calcula sola."
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          {canPickDoctor && sortedDoctors.length > 0 && (
            <DoctorFilter
              doctors={sortedDoctors}
              selected={selectedDoctor}
              currentUserId={profile?.userId ?? ""}
            />
          )}
          <MethodFilter selected={methodParam} />
        </div>
      </div>

      {/* Filtro de rango de fechas */}
      <DateRangeFilter from={fromParam} to={toParam} />
      {!hasDateFilter && (
        <p className="text-xs text-slate-400">
          Mostrando los trabajos de hoy. Usa el filtro de fecha para ver otro período.
        </p>
      )}

      {!isDoctor && (
        <WorkForm
          patients={patients ?? []}
          today={today}
          doctors={canPickDoctor ? sortedDoctors : undefined}
          recepcionistas={canPickDoctor ? (recepData ?? []) : undefined}
          currency={currency}
        />
      )}

      {/* Stats — los doctores solo ven su comisión pendiente (lo acumulado
          confundía al admin: lo accionable es cuánto falta pagar/cobrar),
          no los montos facturados ni lo cobrado a pacientes. "Trabajos
          facturados" (costo total, sin restar lab ni comisión) se ocultó
          para todos los roles porque confundía — no es un monto accionable. */}
      <div
        className={`grid grid-cols-1 gap-4 ${
          isRecepcionista ? "sm:grid-cols-2" : isDoctor ? "sm:grid-cols-1" : "sm:grid-cols-2"
        }`}
      >
        {!isDoctor && (
          <Stat
            label={isRecepcionista ? "Cobrado hoy" : "Cobrado a pacientes"}
            value={money(isRecepcionista ? todayPaid : totalPaid, currency)}
            icon={<Banknote className="h-5 w-5" />}
            valueClassName="text-emerald-600"
          />
        )}
        {!isRecepcionista && (
          <Stat
            label="Comisión pendiente"
            value={money(totalPendingCommission, currency)}
            icon={<Clock className="h-5 w-5" />}
            valueClassName={totalPendingCommission > 0 ? "text-amber-600" : "text-emerald-600"}
          />
        )}
      </div>

      {/* Resumen por doctor (admin viendo todos) */}
      {doctorSummary.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Resumen por doctor</h2>
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_9rem] px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Doctor</span>
              <span className="text-right">Trabajos</span>
              <span className="text-right">Pendiente</span>
            </div>
            {doctorSummary.map((d) => (
              <div
                key={d.name}
                className="grid grid-cols-[minmax(0,1fr)_5rem_9rem] border-t border-slate-100 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-slate-800">{d.name}</span>
                <span className="text-right tabular-nums text-slate-500">{d.count}</span>
                <span
                  className={`text-right tabular-nums font-medium ${
                    d.pendingComm > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  {d.pendingComm > 0 ? money(d.pendingComm, currency) : "Al día ✓"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabla de trabajos */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {rows.length} trabajo{rows.length !== 1 ? "s" : ""}
          </h2>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <ExportCsvButton rows={csvRows} filename={csvFilename} />
              <PrintPdfButton
                rows={csvRows}
                doctorName={doctorNameForPrint}
                from={fromParam}
                to={toParam}
                currency={currency}
              />
            </div>
          )}
        </div>
        {/* Móvil: tarjetas apiladas — la grilla de columnas fijas de abajo se
            aplasta y trunca el texto en pantallas angostas (bug visto en
            producción). Desde sm (≥640px) se usa la grilla con scroll. */}
        <div className="space-y-3 sm:hidden">
          {rows.map((w) => (
            <div
              key={w.id}
              className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {w.patients?.full_name ?? w.patient_name ?? "—"}
                  </p>
                  <p className="truncate text-sm text-slate-500">{w.description}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="font-medium text-slate-800">{money(Number(w.amount_paid), currency)}</p>
                  <p className="text-xs text-slate-400">cobrado</p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="whitespace-nowrap tabular-nums">
                  {fmtDate(w.performed_at)} · {fmtBoliviaTime(w.created_at)}
                </span>
                {isAdmin && w.doctor?.full_name && (
                  <span className="truncate">Dr(a). {w.doctor.full_name}</span>
                )}
                <span className="truncate">
                  Cobró: {w.collected_by?.name ??
                    (w.amount_paid > 0 ? w.doctor?.full_name : undefined) ?? "—"}
                </span>
              </div>

              {w.lab_work && (
                <span className="mt-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                  Lab: {w.lab_work}
                </span>
              )}
              {w.notes && (
                <p className="mt-1 truncate text-xs text-slate-400">{w.notes}</p>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Costo</p>
                  <p className="tabular-nums">
                    {money(Number(w.cost), currency)}
                    {Number(w.lab_cost) > 0 && (
                      <span className="ml-1 text-xs text-amber-600">
                        +{money(Number(w.lab_cost), currency)} lab
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Comisión</p>
                  <p className="tabular-nums font-medium text-clinic">
                    {money(Number(w.commission_amount), currency)}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      ({Number(w.commission_pct)}%)
                    </span>
                  </p>
                  {w.commission_paid && (
                    <p className="text-xs font-medium text-emerald-600">Pagada ✓</p>
                  )}
                  {!w.commission_paid && Number(w.commission_paid_amount ?? 0) > 0 && (
                    <p className="text-xs font-medium text-amber-600">
                      Abono {money(Number(w.commission_paid_amount), currency)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Método</p>
                  <p>
                    {w.payment_method
                      ? (METHOD_LABEL[w.payment_method] ?? w.payment_method)
                      : <span className="text-slate-300">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Comprobante</p>
                  <p>
                    {w.invoiced === true && (
                      <span className="font-medium text-sky-600">Factura ✓</span>
                    )}
                    {w.invoiced === false && (
                      <span className="text-slate-400">Sin factura</span>
                    )}
                    {w.invoiced === null && <span className="text-slate-300">—</span>}
                  </p>
                </div>
              </div>

              {(canSendFeedback || isAdmin) && (
                <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                  {canSendFeedback && <RequestFeedbackButton workId={w.id} />}
                  {isAdmin && <EditWorkButton work={w} currency={currency} />}
                  {isAdmin && <DeleteWorkButton id={w.id} />}
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <EmptyState
              icon={<Briefcase className="h-6 w-6" />}
              title="Aún no hay trabajos registrados en este período"
              description={
                !isDoctor
                  ? "Usa el botón “Registrar trabajo” de arriba, o el filtro de fecha para ver otro período."
                  : undefined
              }
            />
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200 sm:block">
          <div className="min-w-[60rem]">
            <div className={`${GRID(isAdmin)} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
              <span>Fecha</span>
              <span>Paciente</span>
              {isAdmin && <span>Doctor</span>}
              <span>Cobrado por</span>
              <span>Trabajo</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Comisión</span>
              <span className="text-right">Cobrado</span>
              <span>Método</span>
              <span />
            </div>
            {rows.map((w) => (
              <div
                key={w.id}
                className={`${GRID(isAdmin)} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}
              >
                <div className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                  <div>{fmtDate(w.performed_at)}</div>
                  <div className="text-slate-300">{fmtBoliviaTime(w.created_at)}</div>
                </div>
                <span className="truncate font-medium">
                  {w.patients?.full_name ?? w.patient_name ?? "—"}
                </span>
                {isAdmin && (
                  <span className="truncate text-slate-600">
                    {w.doctor?.full_name ?? "—"}
                  </span>
                )}
                <span className="truncate text-slate-500">
                  {/* Recepcionista que cobró; si no hubo (doctor/colega cobró
                      directo), mostrar el doctor cuando hubo monto cobrado. */}
                  {w.collected_by?.name ??
                    (w.amount_paid > 0 ? w.doctor?.full_name : undefined) ?? (
                      <span className="text-slate-300">—</span>
                    )}
                </span>
                <span className="truncate text-slate-600">
                  {w.description}
                  {w.lab_work && (
                    <span className="mt-0.5 flex items-center gap-1">
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                        Lab: {w.lab_work}
                      </span>
                    </span>
                  )}
                  {w.notes && (
                    <span className="block truncate text-xs text-slate-400">{w.notes}</span>
                  )}
                </span>
                <div className="text-right tabular-nums leading-tight">
                  <span>{money(Number(w.cost), currency)}</span>
                  {Number(w.lab_cost) > 0 && (
                    <span className="block text-xs text-amber-600">+{money(Number(w.lab_cost), currency)} lab</span>
                  )}
                </div>
                <div className="text-right tabular-nums leading-tight">
                  <span className="font-medium text-clinic">
                    {money(Number(w.commission_amount), currency)}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {Number(w.commission_pct)}%{Number(w.lab_cost) > 0 && " s/neto"}
                  </span>
                  {w.commission_paid && (
                    <span className="block text-xs font-medium text-emerald-600">Pagada ✓</span>
                  )}
                  {!w.commission_paid && Number(w.commission_paid_amount ?? 0) > 0 && (
                    <span className="block text-xs font-medium text-amber-600">
                      Abono {money(Number(w.commission_paid_amount), currency)}
                    </span>
                  )}
                </div>
                <span className="text-right tabular-nums">{money(Number(w.amount_paid), currency)}</span>
                <span className="text-sm text-slate-500">
                  {w.payment_method
                    ? (METHOD_LABEL[w.payment_method] ?? w.payment_method)
                    : <span className="text-slate-300">—</span>}
                  {/* Comprobante: null = trabajo anterior al campo, no se muestra */}
                  {w.invoiced === true && (
                    <span className="block text-xs font-medium text-sky-600">Factura ✓</span>
                  )}
                  {w.invoiced === false && (
                    <span className="block text-xs text-slate-400">Sin factura</span>
                  )}
                </span>
                <div className="flex items-center justify-end gap-1">
                  {canSendFeedback && <RequestFeedbackButton workId={w.id} />}
                  {isAdmin && <EditWorkButton work={w} currency={currency} />}
                  {isAdmin && <DeleteWorkButton id={w.id} />}
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <EmptyState
                icon={<Briefcase className="h-6 w-6" />}
                title="Aún no hay trabajos registrados en este período"
                description={
                  !isDoctor
                    ? "Usa el botón “Registrar trabajo” de arriba, o el filtro de fecha para ver otro período."
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const GRID = (admin: boolean) =>
  admin
    ? "grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_7rem_8rem_8rem_6rem_6rem] items-center gap-x-4"
    : "grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_7rem_8rem_8rem_6rem_3.5rem] items-center gap-x-4";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
  });
}
