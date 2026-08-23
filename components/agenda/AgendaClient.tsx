"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AgendaShell, type AgendaView } from "./AgendaShell";
import { RealtimeAppointments, type AppointmentRealtimePayload } from "./RealtimeAppointments";
import type { DoctorOption, MonthAppt } from "./apptHelpers";
import type { PatientOption } from "./PatientPicker";
import { mapAvailabilityRow, type AvailabilityBlock } from "@/lib/availability";
import {
  applyAppointmentChange,
  getAgendaRange,
  type AgendaRange,
} from "@/lib/agenda/client-state";
import { AGENDA_REFRESH_EVENT } from "@/lib/agenda/client-events";

type RangeData = { appts: MonthAppt[]; availability: AvailabilityBlock[] };

const isView = (value: string | null): value is AgendaView =>
  value === "day" || value === "week" || value === "month" || value === "overview";

const isDate = (value: string | null): value is string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

function appointmentFromRealtime(
  raw: Record<string, unknown>,
  patients: PatientOption[],
): MonthAppt {
  const patientId = (raw.patient_id as string | null) ?? null;
  const patient = patientId ? patients.find((item) => item.id === patientId) : null;
  return {
    id: raw.id as string,
    starts_at: raw.starts_at as string,
    ends_at: (raw.ends_at as string | null) ?? null,
    status: raw.status as string,
    dentist_name: (raw.dentist_name as string | null) ?? null,
    patient_id: patientId,
    patient_name: (raw.patient_name as string | null) ?? null,
    reason: (raw.reason as string | null) ?? null,
    consult_price: raw.consult_price == null ? null : Number(raw.consult_price),
    deposit: raw.deposit == null ? null : Number(raw.deposit),
    deposit_method: (raw.deposit_method as string | null) ?? null,
    patients: patient
      ? { full_name: patient.full_name, national_id: patient.national_id }
      : null,
  };
}

export function AgendaClient({
  initialDate,
  initialView,
  clinicId,
  userId,
  role,
  myName,
  canWrite,
  canViewAll,
  platformAdminIds,
  recordatoriosEnabled,
  whatsappManualEnabled,
  avisoDoctoresEnabled,
  disponibilidadEnabled,
  currency,
}: {
  initialDate: string;
  initialView: AgendaView;
  clinicId: string;
  userId: string;
  role: string;
  myName: string;
  canWrite: boolean;
  canViewAll: boolean;
  platformAdminIds: string[];
  recordatoriosEnabled: boolean;
  whatsappManualEnabled: boolean;
  avisoDoctoresEnabled: boolean;
  disponibilidadEnabled: boolean;
  currency: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState(initialView);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [appts, setAppts] = useState<MonthAppt[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, RangeData>());
  const requestVersion = useRef(0);
  const range = useMemo(() => getAgendaRange(date), [date]);
  const rangeKey = `${range.start}|${range.end}`;

  useEffect(() => {
    let active = true;
    async function loadReferences() {
      const isDoctor = role === "odontologo_general" || role === "especialista";
      const patientRequest = isDoctor
        ? supabase.rpc("visible_patients_for_doctor", {
            p_clinic_id: clinicId,
            p_dentist_name: myName,
            p_doctor_id: userId,
          })
        : supabase
            .from("patients")
            .select("id, full_name, national_id")
            .eq("clinic_id", clinicId)
            .order("full_name");
      const doctorRequest = canViewAll
        ? supabase
            .from("profiles")
            .select("id, full_name, agenda_color")
            .in("role", ["odontologo_general", "especialista", "colega", "admin"])
            .eq("clinic_id", clinicId)
            .eq("active", true)
            .order("full_name")
        : supabase
            .from("profiles")
            .select("id, full_name, agenda_color")
            .eq("id", userId)
            .maybeSingle()
            .then((result) => ({
              data: result.data ? [result.data] : [{ id: userId, full_name: myName }],
              error: result.error,
            }));

      const [patientResult, doctorResult] = await Promise.all([patientRequest, doctorRequest]);
      if (!active) return;
      if (patientResult.error || doctorResult.error) {
        setError(patientResult.error?.message ?? doctorResult.error?.message ?? "No se pudo cargar la agenda.");
      } else {
        setPatients((patientResult.data ?? []) as PatientOption[]);
        setDoctors(
          ((doctorResult.data ?? []) as DoctorOption[]).filter(
            (doctor) => !platformAdminIds.includes(doctor.id),
          ),
        );
      }
      setReferencesLoading(false);
    }

    void loadReferences();
    return () => {
      active = false;
    };
  }, [canViewAll, clinicId, myName, platformAdminIds, role, supabase, userId]);

  const loadRange = useCallback(
    async (requestedRange: AgendaRange, force = false) => {
      const key = `${requestedRange.start}|${requestedRange.end}`;
      const version = ++requestVersion.current;
      const cached = cache.current.get(key);
      if (cached && !force) {
        setAppts(cached.appts);
        setAvailability(cached.availability);
        setRangeLoading(false);
        return;
      }

      setRangeLoading(true);
      const appointmentsRequest = supabase.rpc("get_agenda_appointments", {
        p_start: requestedRange.start,
        p_end: requestedRange.end,
      });

      const startISO = requestedRange.start.slice(0, 10);
      const endISO = requestedRange.end.slice(0, 10);
      const availabilityRequest = disponibilidadEnabled
        ? supabase
            .from("doctor_availability")
            .select(
              "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles!doctor_availability_dentist_id_fkey(full_name)",
            )
            .eq("clinic_id", clinicId)
            .or(`weekday.not.is.null,and(date_from.lte.${endISO},date_to.gte.${startISO})`)
        : Promise.resolve({ data: [], error: null });

      const [appointmentResult, availabilityResult] = await Promise.all([
        appointmentsRequest,
        availabilityRequest,
      ]);
      if (version !== requestVersion.current) return;
      if (appointmentResult.error || availabilityResult.error) {
        setError(
          appointmentResult.error?.message ??
            availabilityResult.error?.message ??
            "No se pudo cargar la agenda.",
        );
        setRangeLoading(false);
        return;
      }

      const data: RangeData = {
        appts: (appointmentResult.data ?? []) as unknown as MonthAppt[],
        availability: ((availabilityResult.data ?? []) as Record<string, unknown>[]).map(
          mapAvailabilityRow,
        ),
      };
      cache.current.set(key, data);
      setAppts(data.appts);
      setAvailability(data.availability);
      setError(null);
      setRangeLoading(false);
    },
    [clinicId, disponibilidadEnabled, supabase],
  );

  useEffect(() => {
    void loadRange(range);
  }, [loadRange, range]);

  useEffect(() => {
    const refresh = () => void loadRange(range, true);
    window.addEventListener(AGENDA_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(AGENDA_REFRESH_EVENT, refresh);
  }, [loadRange, range]);

  const handleRealtime = useCallback(
    (payload: AppointmentRealtimePayload) => {
      const raw = payload.eventType === "DELETE" ? payload.old : payload.new;
      const id = raw.id as string | undefined;
      if (!id) return;
      if (payload.eventType !== "DELETE" && !canViewAll && raw.dentist_name !== myName) {
        setAppts((current) =>
          applyAppointmentChange(current, { eventType: "DELETE", id }, range),
        );
        return;
      }

      setAppts((current) => {
        const change =
          payload.eventType === "DELETE"
            ? ({ eventType: "DELETE", id } as const)
            : ({
                eventType: payload.eventType,
                appointment: appointmentFromRealtime(raw, patients),
              } as const);
        const next = applyAppointmentChange(current, change, range);
        const cached = cache.current.get(rangeKey);
        if (cached) cache.current.set(rangeKey, { ...cached, appts: next });
        return next;
      });
    },
    [canViewAll, myName, patients, range, rangeKey],
  );

  const navigate = useCallback((nextDate: string, nextView: AgendaView) => {
    setDate(nextDate);
    setView(nextView);
    window.history.pushState({}, "", `/agenda?date=${nextDate}&view=${nextView}`);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextDate = params.get("date");
      const nextView = params.get("view");
      if (isDate(nextDate)) setDate(nextDate);
      if (isView(nextView)) setView(nextView);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (referencesLoading || (rangeLoading && appts.length === 0)) {
    return <p className="py-10 text-center text-sm text-slate-500">Cargando agenda…</p>;
  }

  if (error && appts.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <>
      <RealtimeAppointments
        clinicId={clinicId}
        userId={userId}
        canViewAll={canViewAll}
        onChange={handleRealtime}
      />
      {rangeLoading && (
        <div className="h-1 overflow-hidden rounded bg-slate-100" aria-label="Actualizando agenda">
          <div className="h-full w-1/2 animate-pulse rounded bg-clinic" />
        </div>
      )}
      <AgendaShell
        patients={patients}
        appts={appts}
        date={date}
        view={view}
        canWrite={canWrite}
        doctors={doctors}
        isAdmin={canViewAll}
        myName={myName}
        recordatoriosEnabled={recordatoriosEnabled}
        whatsappManualEnabled={whatsappManualEnabled}
        avisoDoctoresEnabled={avisoDoctoresEnabled}
        disponibilidadEnabled={disponibilidadEnabled}
        availability={availability}
        currency={currency}
        onNavigate={navigate}
      />
    </>
  );
}
