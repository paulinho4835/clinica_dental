// Contenido del evento de Google Calendar que ve el doctor (fase 1: sync
// sistema -> Google, uno solo por cita, sin invitados).

export function buildEventTitle(
  patientName: string,
  reason: string | null | undefined,
  cancelled: boolean,
): string {
  const base = reason?.trim() ? `${patientName} — ${reason.trim()}` : patientName;
  return cancelled ? `[Cancelado] ${base}` : base;
}

export function buildEventDescription(phone: string | null | undefined): string {
  return phone?.trim() ? `Tel: ${phone.trim()}` : "";
}
