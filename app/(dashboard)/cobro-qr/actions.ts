"use server";

import {
  bankContext,
  bankErrorMessage,
  cancelQr,
  checkQr,
  configureProvider,
  generateQr,
  providerState,
  removeProvider,
  setProviderEnabled,
  verifyProvider,
  type BankCredentials,
  type BankQrProviderState,
  type GeneratedQr,
  type QrPaymentRow,
} from "@/lib/bank-qr-server";

/** Quien registra cobros a pacientes (billing:write) cobra con QR; solo quien administra la clínica conecta la cuenta. */
const COLLECT = "billing:write" as const;
const ADMIN = "settings:write" as const;

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok?: undefined; error: string };

async function run<T>(permission: typeof COLLECT | typeof ADMIN, fallback: string, task: (ctx: Awaited<ReturnType<typeof bankContext>>) => Promise<T>): Promise<Result<{ data: T }>> {
  try {
    return { ok: true, data: await task(await bankContext(permission)) };
  } catch (reason) {
    return { error: bankErrorMessage(reason, fallback) };
  }
}

export async function getBankQrState(): Promise<Result<{ data: BankQrProviderState }>> {
  return run(COLLECT, "No se pudo consultar el cobro QR.", providerState);
}

export async function saveBankQrCredentials(credentials: BankCredentials): Promise<Result<{ data: void }>> {
  return run(ADMIN, "No se pudo guardar la conexión con el banco.", (ctx) => configureProvider(ctx, credentials));
}

export async function verifyBankQrConnection(): Promise<Result<{ data: void }>> {
  return run(ADMIN, "No se pudo probar la conexión con el banco.", verifyProvider);
}

export async function setBankQrEnabled(enabled: boolean): Promise<Result<{ data: void }>> {
  return run(ADMIN, "No se pudo cambiar el estado del cobro QR.", (ctx) => setProviderEnabled(ctx, enabled === true));
}

export async function removeBankQr(): Promise<Result<{ data: void }>> {
  return run(ADMIN, "No se pudo quitar la conexión con el banco.", removeProvider);
}

export async function generateBankQr(input: { amount: number; description?: string; patientId?: string | null }): Promise<Result<{ data: GeneratedQr }>> {
  return run(COLLECT, "No se pudo generar el QR.", (ctx) => generateQr(ctx, input));
}

export async function checkBankQr(paymentId: string): Promise<Result<{ data: QrPaymentRow }>> {
  return run(COLLECT, "No se pudo consultar el QR.", (ctx) => checkQr(ctx, String(paymentId)));
}

export async function cancelBankQr(paymentId: string): Promise<Result<{ data: QrPaymentRow }>> {
  return run(COLLECT, "No se pudo anular el QR.", (ctx) => cancelQr(ctx, String(paymentId)));
}
