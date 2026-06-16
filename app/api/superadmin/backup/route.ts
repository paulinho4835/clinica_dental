import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Descarga un backup completo (JSON) de una clínica. Solo superadmin.
// La generación ocurre en la función SQL backup_clinic() (service_role).
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin()))
    return new NextResponse("No autorizado", { status: 403 });

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId)
    return new NextResponse("Falta clinicId", { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("backup_clinic", {
    p_clinic_id: clinicId,
  });
  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data) return new NextResponse("Clínica no encontrada", { status: 404 });

  const clinicName = String(
    (data as { clinic?: { name?: string } }).clinic?.name ?? "clinica",
  );
  const slug =
    clinicName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "clinica";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `backup-${slug}-${date}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
