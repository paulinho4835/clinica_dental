import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, isTokenExpired, type GoogleTokens } from "@/lib/google-calendar/client";

export async function saveTokens(
  profileId: string,
  clinicId: string,
  tokens: GoogleTokens,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("google_calendar_tokens").upsert({
    profile_id: profileId,
    clinic_id: clinicId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
  });
  await admin.from("profiles").update({ google_calendar_connected: true }).eq("id", profileId);
}

export async function clearTokens(profileId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("google_calendar_tokens").delete().eq("profile_id", profileId);
  await admin.from("profiles").update({ google_calendar_connected: false }).eq("id", profileId);
}

// Devuelve un access_token vigente para el doctor, refrescándolo si venció.
// Devuelve null si el doctor no está conectado, o si Google rechazó el
// refresh (revocado desde su cuenta de Google) — en ese caso desconecta
// automáticamente para que Ajustes vuelva a mostrar el botón "Conectar".
export async function ensureFreshAccessToken(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!row) return null;

  if (!isTokenExpired(row.expires_at)) return row.access_token;

  try {
    const refreshed = await refreshAccessToken(row.refresh_token);
    await admin
      .from("google_calendar_tokens")
      .update({ access_token: refreshed.accessToken, expires_at: refreshed.expiresAt })
      .eq("profile_id", profileId);
    return refreshed.accessToken;
  } catch (err) {
    console.error("google-calendar: refresh token inválido, desconectando doctor", profileId, err);
    await clearTokens(profileId);
    return null;
  }
}
