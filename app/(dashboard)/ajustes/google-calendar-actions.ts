"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { clearTokens } from "@/lib/google-calendar/tokens";

export type GoogleCalendarState = { ok?: boolean; error?: string };

export async function disconnectGoogleCalendar(): Promise<GoogleCalendarState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso." };

  await clearTokens(profile.userId);
  revalidatePath("/ajustes");
  return { ok: true };
}
