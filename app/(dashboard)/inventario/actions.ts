"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const MoveSchema = z
  .object({
    item_id: z.string().uuid("Insumo requerido"),
    type: z.enum(["in", "out", "adjust"]),
    quantity: z.coerce.number(),
    reason: z.string().optional().nullable(),
  })
  // in/out usan cantidad positiva; adjust acepta delta negativo, pero nunca cero.
  .refine((d) => d.quantity !== 0, { message: "Cantidad no puede ser cero", path: ["quantity"] })
  .refine((d) => d.type === "adjust" || d.quantity > 0, {
    message: "Cantidad debe ser > 0",
    path: ["quantity"],
  });

export async function registerMovement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "inventory:write"))
    return { error: "Sin permiso para mover inventario." };

  const parsed = MoveSchema.safeParse({
    item_id: formData.get("item_id"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  // Trigger en DB ajusta current_stock según el tipo de movimiento.
  const { error } = await supabase.from("inventory_movements").insert({
    clinic_id: profile.clinicId,
    item_id: parsed.data.item_id,
    type: parsed.data.type,
    quantity: parsed.data.quantity,
    reason: parsed.data.reason,
  });
  if (error) return { error: error.message };

  revalidatePath("/inventario");
  return { ok: true };
}
