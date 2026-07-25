// Endpoint de recordatorios vía Zavu — reemplazará /api/whatsapp/send-reminders
// cuando la migración de Baileys esté lista.
//
// Puede llamarse:
//   - Manualmente desde el dashboard (POST)
//   - Automáticamente por el Vercel Cron (ver instrucciones en lib/zavu-reminders.ts)
//   - Con el header Authorization: Bearer <CRON_SECRET> para el cron de Vercel

import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";
import { processRemindersZavu } from "@/lib/zavu-reminders";

export async function POST(req: NextRequest) {
  // Vercel Cron llama con Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  // Si no es el cron, verificar sesión normal y acotar a la clínica del que
  // llama — sin esto, cualquier admin disparaba el envío de recordatorios de
  // TODAS las clínicas, no solo la suya.
  let clinicId: string | undefined;
  if (!isVercelCron) {
    const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
    if (!can(profile?.role, "appointments:write")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    if (!features.whatsapp) {
      return NextResponse.json(
        { error: "Módulo WhatsApp no habilitado para esta clínica" },
        { status: 403 }
      );
    }
    clinicId = profile?.clinicId;
  }

  const result = await processRemindersZavu(clinicId);
  return NextResponse.json({ ok: true, ...result });
}
