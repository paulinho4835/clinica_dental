import type { MonthAppt } from "@/components/agenda/apptHelpers";
import { gridRange } from "@/lib/agenda";

export type AgendaRange = { start: string; end: string };

export type AppointmentChange =
  | { eventType: "INSERT" | "UPDATE"; appointment: MonthAppt }
  | { eventType: "DELETE"; id: string };

export function reconcileSelectedDay(
  current: string | null,
  previousDate: string,
  nextDate: string,
  view: "day" | "week" | "month" | "overview",
): string | null {
  if (view === "day") return nextDate;
  if (view === "month" && previousDate !== nextDate) return null;
  return current;
}

export function getAgendaRange(date: string): AgendaRange {
  const { start, end } = gridRange(new Date(`${date}T00:00:00`));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function applyAppointmentChange(
  current: MonthAppt[],
  change: AppointmentChange,
  range: AgendaRange,
): MonthAppt[] {
  const id = change.eventType === "DELETE" ? change.id : change.appointment.id;
  const withoutPrevious = current.filter((appointment) => appointment.id !== id);

  if (change.eventType === "DELETE") return withoutPrevious;

  const appointment = change.appointment;
  const startsAt = new Date(appointment.starts_at).getTime();
  const inRange =
    startsAt >= new Date(range.start).getTime() && startsAt < new Date(range.end).getTime();

  if (!inRange || appointment.status === "cancelled") return withoutPrevious;

  return [...withoutPrevious, appointment].sort(
    (left, right) =>
      new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
  );
}
