import { describe, expect, it } from "vitest";
import type { MonthAppt } from "@/components/agenda/apptHelpers";
import {
  applyAppointmentChange,
  getAgendaRange,
  reconcileSelectedDay,
  type AppointmentChange,
} from "@/lib/agenda/client-state";

const range = {
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-07-13T00:00:00.000Z",
};

const appointment = (overrides: Partial<MonthAppt> = {}): MonthAppt => ({
  id: "appt-1",
  starts_at: "2026-06-10T13:00:00.000Z",
  ends_at: "2026-06-10T14:00:00.000Z",
  status: "scheduled",
  dentist_name: "Dra. Paz",
  patient_id: "patient-1",
  patient_name: null,
  reason: null,
  consult_price: 100,
  deposit: 0,
  deposit_method: null,
  patients: { full_name: "Ana Vargas", national_id: "123" },
  ...overrides,
});

describe("getAgendaRange", () => {
  it("mantiene una ventana estable de 42 días para cachear la agenda", () => {
    const result = getAgendaRange("2026-06-10");
    expect(new Date(result.end).getTime() - new Date(result.start).getTime()).toBe(
      42 * 86_400_000,
    );
  });
});

describe("applyAppointmentChange", () => {
  it("inserta y ordena una cita recibida por Realtime", () => {
    const later = appointment({ id: "appt-2", starts_at: "2026-06-11T13:00:00.000Z" });
    const change: AppointmentChange = { eventType: "INSERT", appointment: appointment() };

    expect(applyAppointmentChange([later], change, range)).toEqual([
      appointment(),
      later,
    ]);
  });

  it("actualiza una cita existente sin duplicarla", () => {
    const updated = appointment({ status: "confirmed", reason: "Control" });
    const change: AppointmentChange = { eventType: "UPDATE", appointment: updated };

    expect(applyAppointmentChange([appointment()], change, range)).toEqual([updated]);
  });

  it("retira citas canceladas o movidas fuera del rango visible", () => {
    const cancelled: AppointmentChange = {
      eventType: "UPDATE",
      appointment: appointment({ status: "cancelled" }),
    };
    const moved: AppointmentChange = {
      eventType: "UPDATE",
      appointment: appointment({ starts_at: "2026-08-01T13:00:00.000Z" }),
    };

    expect(applyAppointmentChange([appointment()], cancelled, range)).toEqual([]);
    expect(applyAppointmentChange([appointment()], moved, range)).toEqual([]);
  });

  it("elimina una cita usando únicamente su id", () => {
    const change: AppointmentChange = { eventType: "DELETE", id: "appt-1" };
    expect(applyAppointmentChange([appointment()], change, range)).toEqual([]);
  });
});

describe("reconcileSelectedDay", () => {
  it("limpia el detalle seleccionado al cambiar de mes", () => {
    expect(reconcileSelectedDay("2026-06-10", "2026-06-10", "2026-07-10", "month"))
      .toBeNull();
  });

  it("en vista día selecciona siempre la fecha navegada", () => {
    expect(reconcileSelectedDay(null, "2026-06-10", "2026-06-12", "day"))
      .toBe("2026-06-12");
  });
});
