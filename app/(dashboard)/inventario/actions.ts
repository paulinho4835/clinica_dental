"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const MoveSchema = z.object({
  item_id: z.string().uuid("Insumo requerido"),
  type: z.enum(["in", "out"]),
  quantity: z.coerce.number().positive("Cantidad debe ser > 0"),
  reason: z.string().optional().nullable(),
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
    created_by: profile.userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/inventario");
  return { ok: true };
}

// ─── Alta / edición de insumos ───────────────────────────────────────────────
const ItemSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  category: z.string().trim().optional().nullable(),
  unit: z.string().trim().min(1, "Unidad requerida"),
  min_stock: z.coerce.number().min(0, "Mínimo inválido"),
});

// Alta de insumo: nombre + cantidad inicial + stock mínimo (default 5) + lote/caducidad opcionales.
const CreateItemSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  initial_qty: z.coerce.number().min(0, "Cantidad inválida").default(0),
  min_stock: z.coerce.number().min(0, "Mínimo inválido").default(5),
  lot: z.string().trim().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
});

// Crea el insumo y carga su stock inicial como un movimiento de "Entrada"
// (queda en el historial y el trigger ajusta current_stock).
export async function createItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "inventory:write"))
    return { error: "Sin permiso para editar inventario." };

  const parsed = CreateItemSchema.safeParse({
    name: formData.get("name"),
    initial_qty: formData.get("initial_qty") || 0,
    min_stock: formData.get("min_stock") ?? 5,
    lot: formData.get("lot") || null,
    expiry_date: formData.get("expiry_date") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      clinic_id: profile.clinicId,
      name: parsed.data.name,
      unit: "unidad",
      min_stock: parsed.data.min_stock,
    })
    .select("id")
    .single();
  if (error || !item) return { error: error?.message ?? "No se pudo crear el insumo." };

  // Stock inicial -> movimiento de entrada (trigger suma a current_stock).
  if (parsed.data.initial_qty > 0) {
    await supabase.from("inventory_movements").insert({
      clinic_id: profile.clinicId,
      item_id: item.id,
      type: "in",
      quantity: parsed.data.initial_qty,
      reason: "Stock inicial",
      created_by: profile.userId,
    });
  }

  // Lote/caducidad opcionales: se registran si se proporcionó alguno de los dos.
  if (parsed.data.lot || parsed.data.expiry_date) {
    await supabase.from("inventory_batches").insert({
      clinic_id: profile.clinicId,
      item_id: item.id,
      lot: parsed.data.lot ?? null,
      expiry_date: parsed.data.expiry_date ?? null,
      quantity: parsed.data.initial_qty,
    });
  }

  revalidatePath("/inventario");
  return { ok: true };
}

// Edita los metadatos de un insumo (no toca current_stock: eso son movimientos).
export async function updateItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "inventory:write"))
    return { error: "Sin permiso para editar inventario." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Insumo inválido." };

  const parsed = ItemSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || null,
    unit: formData.get("unit") || "unidad",
    min_stock: formData.get("min_stock") || 0,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      min_stock: parsed.data.min_stock,
    })
    .eq("id", id); // RLS limita a la clínica
  if (error) return { error: error.message };

  revalidatePath("/inventario");
  return { ok: true };
}
