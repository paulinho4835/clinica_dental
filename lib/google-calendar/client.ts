import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_EVENTS_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function redirectUri(): string {
  const site = env.NEXT_PUBLIC_SITE_URL ?? "https://clinica-dental-one-vert.vercel.app";
  return `${site}/api/google-calendar/callback`;
}

function oauthClient(): OAuth2Client {
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());
}

// `state` es un token anti-CSRF (ver app/api/google-calendar/connect/route.ts),
// no lleva datos del usuario.
export function getGoogleAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline", // necesario para recibir refresh_token
    prompt: "consent",      // fuerza refresh_token también en reconexiones
    scope: [SCOPE],
    state,
  });
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google no devolvió access_token/refresh_token (revisa access_type=offline y prompt=consent).",
    );
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000).toISOString(),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Google no devolvió access_token al refrescar.");
  }
  return {
    accessToken: credentials.access_token,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000).toISOString(),
  };
}

// Margen de 2 min antes del vencimiento real: evita usar un access_token que
// expira a mitad de la llamada a la Calendar API.
export function isTokenExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() - now.getTime() < 2 * 60_000;
}

export interface CalendarEventInput {
  title: string;
  description: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

function toGoogleEvent(event: CalendarEventInput) {
  return {
    summary: event.title,
    description: event.description || undefined,
    start: { dateTime: event.startsAt },
    end: { dateTime: event.endsAt },
  };
}

export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<string> {
  const res = await fetch(CALENDAR_EVENTS_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(event)),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar create falló: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<void> {
  const res = await fetch(`${CALENDAR_EVENTS_API}/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(event)),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar update falló: ${res.status} ${await res.text()}`);
  }
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${CALENDAR_EVENTS_API}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 = el doctor ya lo había borrado a mano; no es un error real.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete falló: ${res.status} ${await res.text()}`);
  }
}
