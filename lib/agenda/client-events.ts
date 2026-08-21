export const AGENDA_REFRESH_EVENT = "agenda:refresh";

export function requestAgendaRefresh() {
  window.dispatchEvent(new Event(AGENDA_REFRESH_EVENT));
}
