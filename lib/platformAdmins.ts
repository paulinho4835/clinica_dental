import { createAdminClient } from "@/lib/supabase/admin";

/** IDs de usuarios plataforma (superadmins). Se excluyen de listados de personal. */
export async function getPlatformAdminIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_admins").select("user_id");
  return (data ?? []).map((r) => r.user_id as string);
}
