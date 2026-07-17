// Cálculo de horarios libres por doctor (feature "Horarios libres", addon
// "disponibilidad"). Mismo algoritmo que la tool check_availability del
// agente de IA (lib/agent/tools.ts): grilla de buildSlots() menos citas
// reservadas (60 min) menos bloques de no disponibilidad del doctor. Se
// extrae aquí para que un humano (botón en la Agenda) use el mismo cálculo
// sin duplicar la lógica de solapamiento de intervalos.

import { buildSlots } from "@/lib/vapi-helpers";
import { blocksForDay, blockRange, type AvailabilityBlock } from "@/lib/availability";

const APPOINTMENT_DURATION_MS = 60 * 60 * 1000;

export function freeSlotsForDay(
  dateISO: string,
  bookedIntervals: { start: number; end: number }[],
  availabilityBlocks: AvailabilityBlock[],
  dentistName: string,
): string[] {
  const blocks = blocksForDay(dateISO, availabilityBlocks).filter(
    (b) => b.dentist_name.trim() === dentistName.trim(),
  );
  const blockIntervals = blocks.map((b) => {
    const r = blockRange(dateISO, b);
    return { start: r.start.getTime(), end: r.end.getTime() };
  });
  const intervals = [...bookedIntervals, ...blockIntervals];

  return buildSlots(dateISO).filter((s) => {
    const slotStart = new Date(`${dateISO}T${s}:00-04:00`).getTime();
    const slotEnd = slotStart + APPOINTMENT_DURATION_MS;
    return !intervals.some((iv) => iv.start < slotEnd && iv.end > slotStart);
  });
}

export function formatFreeSlotsMessage(
  days: { dateISO: string; label: string; slots: string[] }[],
): string {
  const withSlots = days.filter((d) => d.slots.length > 0);
  if (withSlots.length === 0) {
    return `No hay horarios disponibles en los próximos ${days.length} días.`;
  }
  const lines = withSlots.map((d) => `✨ *${d.label}:* ${d.slots.join(" | ")}`);
  return `Estos son los horarios disponibles para programar su cita:\n\n${lines.join("\n")}`;
}
