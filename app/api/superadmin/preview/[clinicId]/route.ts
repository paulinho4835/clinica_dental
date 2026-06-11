import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/superadmin";

// Dominio interno que identifica a los usuarios de vista previa.
export const PREVIEW_DOMAIN = "plataforma.internal";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const superadminPanel = new URL("/superadmin", req.url);
  const loginUrl = new URL("/login", req.url);

  if (!(await isPlatformAdmin())) {
    return NextResponse.redirect(loginUrl);
  }

  const { clinicId } = await params;
  const admin = createAdminClient();

  // Verificar que la clínica existe
  const { data: clinic } = await admin
    .from("clinics")
    .select("id, name")
    .eq("id", clinicId)
    .single();

  if (!clinic) {
    return NextResponse.redirect(superadminPanel);
  }

  const previewEmail = `preview-${clinicId}@${PREVIEW_DOMAIN}`;

  // Buscar si ya existe el usuario preview de esta clínica
  let previewUserId: string | null = null;
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of authList?.users ?? []) {
    if (u.email === previewEmail) {
      previewUserId = u.id;
      break;
    }
  }

  // Crear usuario preview si no existe
  if (!previewUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: previewEmail,
      email_confirm: true,
      user_metadata: { is_preview: true },
    });

    if (createErr || !created.user) {
      superadminPanel.searchParams.set("error", "preview_user");
      return NextResponse.redirect(superadminPanel);
    }

    previewUserId = created.user.id;

    const { error: profErr } = await admin.from("profiles").insert({
      id: previewUserId,
      clinic_id: clinicId,
      role: "admin",
      full_name: "Vista Superadmin",
    });

    if (profErr) {
      await admin.auth.admin.deleteUser(previewUserId);
      superadminPanel.searchParams.set("error", "preview_profile");
      return NextResponse.redirect(superadminPanel);
    }
  }

  // Contraseña aleatoria de un solo uso — nadie la conoce después de esta request.
  const tempPassword = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  await admin.auth.admin.updateUserById(previewUserId, { password: tempPassword });

  // Iniciar sesión en el servidor — createClient escribe las cookies de sesión vía setAll.
  const serverClient = await createClient();
  const { error: signInErr } = await serverClient.auth.signInWithPassword({
    email: previewEmail,
    password: tempPassword,
  });

  if (signInErr) {
    superadminPanel.searchParams.set("error", "preview_signin");
    return NextResponse.redirect(superadminPanel);
  }

  return NextResponse.redirect(new URL("/agenda", req.url));
}
