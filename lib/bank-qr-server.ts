import type { SupabaseClient } from "@supabase/supabase-js";
import { BANECO_CERTIFICATION_URL, BankError, bankAmount, createBanecoClient, qrDueDate, tokenExpiresAt, type BanecoClient } from "@/lib/baneco";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

type BankPermission = "settings:write" | "billing:write";

/**
 * Cobro con QR dinámico de Banco Económico (migración 0128), addon premium `cobro_qr` que solo enciende
 * el superadmin. Las credenciales del banco se leen aquí con service_role y nunca vuelven al navegador.
 * Solo se importa desde server actions: no debe llegar al bundle del navegador.
 */
export class UserError extends Error {}

type Provider = {
  clinic_id: string;
  environment: "certification" | "production";
  enabled: boolean;
  username: string;
  password_encrypted: string;
  aes_key: string;
  account_encrypted: string;
  account_last4: string;
  currency: "BOB" | "USD";
  branch_code: string | null;
  token: string | null;
  token_expires_at: string | null;
};

export type BankContext = { admin: SupabaseClient; clinicId: string; userId: string };

export type QrPaymentRow = {
  id: string;
  qr_id: string | null;
  amount: number;
  currency: string;
  description: string | null;
  status: "pending" | "paid" | "cancelled" | "error";
  error_message: string | null;
  payer_name: string | null;
  payer_bank_code: string | null;
  payer_account: string | null;
  bank_transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
};

const PAYMENT_FIELDS =
  "id,qr_id,amount,currency,description,due_date,status,error_message,payer_name,payer_bank_code,payer_account,bank_transaction_id,paid_at,created_at";

function baseUrl(environment: string) {
  if (environment === "production") {
    const url = process.env.BANECO_PRODUCTION_URL;
    if (!url) throw new UserError("Falta configurar la URL de producción del banco (BANECO_PRODUCTION_URL).");
    return url;
  }
  return process.env.BANECO_CERTIFICATION_URL ?? BANECO_CERTIFICATION_URL;
}

/** Quién llama y de qué clínica: solo roles con permiso, nunca la clínica que mande el cliente. */
export async function bankContext(permission: BankPermission): Promise<BankContext> {
  const profile = await getProfile();
  if (!profile) throw new UserError("Tu sesión expiró. Ingresa nuevamente.");
  if (!can(profile.role, permission)) throw new UserError("No tienes permiso para esta acción.");
  return { admin: createAdminClient(), clinicId: profile.clinicId, userId: profile.userId };
}

export async function hasBankQrAddon(admin: SupabaseClient, clinicId: string) {
  const { data } = await admin.from("clinics").select("features").eq("id", clinicId).maybeSingle();
  return (data?.features as Record<string, unknown> | null)?.cobro_qr === true;
}

async function requireAddon(ctx: BankContext) {
  if (!(await hasBankQrAddon(ctx.admin, ctx.clinicId))) {
    throw new UserError("El cobro QR dinámico no está habilitado en tu plan. Contacta a tu proveedor para activarlo.");
  }
}

async function loadProvider(ctx: BankContext) {
  const { data, error } = await ctx.admin.from("payment_providers").select("*").eq("clinic_id", ctx.clinicId).maybeSingle();
  if (error) throw error;
  if (!data) throw new UserError("El cobro con QR del banco no está configurado.");
  return data as Provider;
}

/** Token vigente del banco: reutiliza el guardado y lo renueva un minuto antes de que venza. */
async function bankToken(ctx: BankContext, bank: BanecoClient, provider: Provider, renew = false) {
  if (!renew && provider.token && provider.token_expires_at) {
    if (new Date(provider.token_expires_at).getTime() - Date.now() > 60_000) return provider.token;
  }
  const token = await bank.authenticate(provider.username, provider.password_encrypted);
  const expires = tokenExpiresAt(token).toISOString();
  await ctx.admin.from("payment_providers").update({ token, token_expires_at: expires }).eq("clinic_id", ctx.clinicId);
  provider.token = token;
  provider.token_expires_at = expires;
  return token;
}

/** Ejecuta una llamada con token; si el banco lo rechaza por vencido, renueva una vez y reintenta. */
async function withToken<T>(ctx: BankContext, bank: BanecoClient, provider: Provider, task: (token: string) => Promise<T>) {
  try {
    return await task(await bankToken(ctx, bank, provider));
  } catch (reason) {
    if (reason instanceof BankError && (reason.status === 401 || reason.status === 403)) {
      return task(await bankToken(ctx, bank, provider, true));
    }
    throw reason;
  }
}

async function loadPayment(ctx: BankContext, paymentId: string) {
  const { data, error } = await ctx.admin
    .from("qr_payments")
    .select(`${PAYMENT_FIELDS},environment`)
    .eq("clinic_id", ctx.clinicId)
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new UserError("El cobro QR no existe.");
  return data as QrPaymentRow & { environment: string };
}

/** Guarda lo que dijo el banco (pagado o anulado) si el cobro seguía pendiente y devuelve cómo quedó. */
async function settle(ctx: BankContext, paymentId: string, status: Awaited<ReturnType<BanecoClient["qrStatus"]>>) {
  const paid = status.payments[0];
  const update =
    status.code === 1
      ? {
          status: "paid",
          payer_name: paid?.senderName ?? null,
          payer_bank_code: paid?.senderBankCode ?? null,
          payer_account: paid?.senderAccount ?? null,
          bank_transaction_id: paid?.transactionId ?? null,
          paid_at: paid?.paymentDate
            ? `${paid.paymentDate.slice(0, 10)}T${paid.paymentTime ?? "00:00:00"}-04:00`
            : new Date().toISOString(),
        }
      : { status: "cancelled" };
  const { data, error } = await ctx.admin
    .from("qr_payments")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select(PAYMENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return (data ?? (await loadPayment(ctx, paymentId))) as QrPaymentRow;
}

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export type BankQrProviderState =
  | { available: false }
  | { available: true; configured: false }
  | {
      available: true;
      configured: true;
      environment: "certification" | "production";
      enabled: boolean;
      username: string;
      accountLast4: string;
      currency: "BOB" | "USD";
      branchCode: string | null;
      verifiedAt: string | null;
    };

/** Estado para la pantalla, sin secretos. */
export async function providerState(ctx: BankContext): Promise<BankQrProviderState> {
  if (!(await hasBankQrAddon(ctx.admin, ctx.clinicId))) return { available: false };
  const { data } = await ctx.admin
    .from("payment_providers")
    .select("environment,enabled,username,account_last4,currency,branch_code,verified_at")
    .eq("clinic_id", ctx.clinicId)
    .maybeSingle();
  if (!data) return { available: true, configured: false };
  return {
    available: true,
    configured: true,
    environment: data.environment,
    enabled: data.enabled,
    username: data.username,
    accountLast4: data.account_last4,
    currency: data.currency,
    branchCode: data.branch_code,
    verifiedAt: data.verified_at,
  };
}

export type BankCredentials = {
  environment: "certification" | "production";
  username: string;
  password: string;
  aesKey: string;
  account: string;
  currency: "BOB" | "USD";
  branchCode: string;
};

/** Cifra la contraseña y la cuenta con el banco, comprueba que las acepta y recién entonces las guarda. */
export async function configureProvider(ctx: BankContext, input: BankCredentials) {
  await requireAddon(ctx);
  const environment = input.environment === "production" ? "production" : "certification";
  const username = text(input.username, 80);
  const password = text(input.password, 120);
  const aesKey = text(input.aesKey, 64);
  const account = text(input.account, 40);
  const branchCode = text(input.branchCode, 5);
  if (!username || !password || !aesKey || !account) {
    throw new UserError("Completa usuario, contraseña, llave AES y número de cuenta.");
  }
  if (!/^[0-9]{4,}$/.test(account)) throw new UserError("El número de cuenta solo lleva dígitos.");
  const bank = createBanecoClient(baseUrl(environment));
  const passwordEncrypted = await bank.encrypt(password, aesKey);
  const accountEncrypted = await bank.encrypt(account, aesKey);
  const token = await bank.authenticate(username, passwordEncrypted);
  const now = new Date().toISOString();
  const { error } = await ctx.admin.from("payment_providers").upsert({
    clinic_id: ctx.clinicId,
    provider: "baneco",
    environment,
    enabled: true,
    username,
    password_encrypted: passwordEncrypted,
    aes_key: aesKey,
    account_encrypted: accountEncrypted,
    account_last4: account.slice(-4),
    currency: input.currency === "USD" ? "USD" : "BOB",
    branch_code: branchCode || null,
    token,
    token_expires_at: tokenExpiresAt(token).toISOString(),
    verified_at: now,
    updated_by: ctx.userId,
    updated_at: now,
  });
  if (error) throw error;
}

export async function verifyProvider(ctx: BankContext) {
  await requireAddon(ctx);
  const provider = await loadProvider(ctx);
  const bank = createBanecoClient(baseUrl(provider.environment));
  await bankToken(ctx, bank, provider, true);
  await ctx.admin.from("payment_providers").update({ verified_at: new Date().toISOString() }).eq("clinic_id", ctx.clinicId);
}

export async function setProviderEnabled(ctx: BankContext, enabled: boolean) {
  if (enabled) await requireAddon(ctx);
  await loadProvider(ctx);
  const { error } = await ctx.admin
    .from("payment_providers")
    .update({ enabled, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq("clinic_id", ctx.clinicId);
  if (error) throw error;
}

export async function removeProvider(ctx: BankContext) {
  const { error } = await ctx.admin.from("payment_providers").delete().eq("clinic_id", ctx.clinicId);
  if (error) throw error;
}

export type GeneratedQr = { paymentId: string; qrId: string; qrImage: string; amount: number; currency: string; dueDate: string };

export async function generateQr(
  ctx: BankContext,
  input: { amount: number; description?: string; patientId?: string | null },
): Promise<GeneratedQr> {
  await requireAddon(ctx);
  const provider = await loadProvider(ctx);
  if (!provider.enabled) throw new UserError("El cobro con QR del banco está desactivado.");
  const amount = bankAmount(Number(input.amount));
  const description = text(input.description, 120) || null;
  const patientId = /^[0-9a-f-]{36}$/i.test(String(input.patientId ?? "")) ? String(input.patientId) : null;
  const dueDate = qrDueDate();
  const { data: payment, error: insertError } = await ctx.admin
    .from("qr_payments")
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      environment: provider.environment,
      amount,
      currency: provider.currency,
      description,
      due_date: dueDate,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const bank = createBanecoClient(baseUrl(provider.environment));
  try {
    const qr = await withToken(ctx, bank, provider, (token) =>
      bank.generateQr(token, {
        transactionId: payment.id,
        accountCredit: provider.account_encrypted,
        currency: provider.currency,
        amount,
        description: description ?? undefined,
        dueDate,
        singleUse: true,
        modifyAmount: false,
        branchCode: provider.branch_code ?? undefined,
      }),
    );
    await ctx.admin.from("qr_payments").update({ qr_id: qr.qrId, updated_at: new Date().toISOString() }).eq("id", payment.id);
    return { paymentId: payment.id, qrId: qr.qrId, qrImage: qr.qrImage, amount, currency: provider.currency, dueDate };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "No se pudo generar el QR.";
    await ctx.admin
      .from("qr_payments")
      .update({ status: "error", error_message: message.slice(0, 300), updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    throw reason;
  }
}

export async function checkQr(ctx: BankContext, paymentId: string): Promise<QrPaymentRow> {
  const payment = await loadPayment(ctx, paymentId);
  if (payment.status !== "pending" || !payment.qr_id) return payment;
  const provider = await loadProvider(ctx);
  const bank = createBanecoClient(baseUrl(payment.environment));
  const status = await withToken(ctx, bank, provider, (token) => bank.qrStatus(token, payment.qr_id!));
  if (status.code === 0) return payment;
  return settle(ctx, payment.id, status);
}

/** Si el cliente pagó justo antes de anular, no se anula: se devuelve pagado para registrar el cobro. */
export async function cancelQr(ctx: BankContext, paymentId: string): Promise<QrPaymentRow> {
  const payment = await loadPayment(ctx, paymentId);
  if (payment.status !== "pending") return payment;
  if (payment.qr_id) {
    const provider = await loadProvider(ctx);
    const bank = createBanecoClient(baseUrl(payment.environment));
    const status = await withToken(ctx, bank, provider, (token) => bank.qrStatus(token, payment.qr_id!));
    if (status.code !== 0) return settle(ctx, payment.id, status);
    await withToken(ctx, bank, provider, (token) => bank.cancelQr(token, payment.qr_id!));
  }
  const { data, error } = await ctx.admin
    .from("qr_payments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select(PAYMENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return (data ?? (await loadPayment(ctx, payment.id))) as QrPaymentRow;
}

/** Mensaje para el usuario: los errores propios y del banco se muestran; el resto, uno genérico. */
export function bankErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof UserError || reason instanceof BankError) return reason.message;
  console.error("bank-qr", reason);
  return fallback;
}
