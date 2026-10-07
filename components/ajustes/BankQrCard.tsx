"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { QrCode } from "lucide-react";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { removeBankQr, saveBankQrCredentials, setBankQrEnabled, verifyBankQrConnection, getBankQrState } from "@/app/(dashboard)/cobro-qr/actions";
import type { BankCredentials, BankQrProviderState } from "@/lib/bank-qr-server";

const EMPTY: BankCredentials = { environment: "certification", username: "", password: "", aesKey: "", account: "", currency: "BOB", branchCode: "" };
const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" });

/**
 * El administrador conecta su cuenta de Banco Económico (API Market) para cobrar con un QR que lleva el
 * monto exacto y confirma el pago solo. Es un addon premium: sin él solo se explica cómo obtenerlo.
 */
export function BankQrCard() {
  const [state, setState] = useState<BankQrProviderState | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BankCredentials>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await getBankQrState();
    if (result.ok) setState(result.data);
    else setMessage({ tone: "error", text: result.error });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const field = <K extends keyof BankCredentials>(key: K, value: BankCredentials[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function run(kind: string, task: () => Promise<{ ok?: true; error?: string }>, done: string, after?: () => void) {
    setBusy(kind);
    setMessage(null);
    const result = await task();
    setBusy(null);
    if (result.error) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setMessage({ tone: "ok", text: done });
    after?.();
    await load();
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run("save", () => saveBankQrCredentials(form), "Conexión con el banco guardada y verificada.", () => {
      setEditing(false);
      setForm(EMPTY);
    });
  }

  const configured = state?.available && state.configured ? state : null;

  return <section aria-labelledby="bank-qr-title" className="rounded-xl border border-slate-200 bg-white p-6">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-slate-100 p-3 text-clinic"><QrCode size={20} /></div>
      <div>
        <h2 className="font-black" id="bank-qr-title">Cobro QR dinámico {state && !state.available && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Premium</span>}</h2>
        <p className="text-sm text-slate-500">
          {state && !state.available
            ? "Cobra con un QR del banco que lleva el monto exacto y confirma el pago solo. Para activarlo, contacta a tu proveedor. Mientras tanto, los pagos con QR se registran como siempre."
            : "Banco Económico: el QR lleva el monto exacto del cobro y el pago se confirma solo, sin revisar el celular del cliente."}
        </p>
      </div>
    </div>

    {!state && !message && <p className="mt-4 text-sm text-slate-500">Cargando…</p>}

    {state?.available && (!configured || editing) && (!configured && !editing ? (
      <div className="mt-4"><button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50" onClick={() => { setForm(EMPTY); setEditing(true); }} type="button">Conectar cuenta del banco</button></div>
    ) : (
      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={save}>
        <p className="text-xs text-slate-500 md:col-span-2">Se guardan cifradas y solo las usa el servidor; nadie podrá verlas desde la pantalla. Antes de guardar se prueban con el banco.</p>
        <label className="block"><FieldLabel>Ambiente</FieldLabel><select className={`${fieldInputClass} mt-1 w-full`} onChange={(event) => field("environment", event.target.value as BankCredentials["environment"])} value={form.environment}><option value="certification">Certificación (pruebas)</option><option value="production">Producción</option></select></label>
        <label className="block"><FieldLabel>Usuario asignado por el banco</FieldLabel><input autoComplete="off" className={`${fieldInputClass} mt-1 w-full`} onChange={(event) => field("username", event.target.value)} required value={form.username} /></label>
        <label className="block"><FieldLabel>Contraseña</FieldLabel><input autoComplete="new-password" className={`${fieldInputClass} mt-1 w-full`} onChange={(event) => field("password", event.target.value)} required type="password" value={form.password} /></label>
        <label className="block"><FieldLabel>Llave AES</FieldLabel><input autoComplete="off" className={`${fieldInputClass} mt-1 w-full`} onChange={(event) => field("aesKey", event.target.value)} required value={form.aesKey} /></label>
        <label className="block"><FieldLabel>Número de cuenta que recibe los cobros</FieldLabel><input autoComplete="off" className={`${fieldInputClass} mt-1 w-full`} inputMode="numeric" onChange={(event) => field("account", event.target.value.replace(/\D/g, ""))} required value={form.account} /></label>
        <label className="block"><FieldLabel>Moneda de la cuenta</FieldLabel><select className={`${fieldInputClass} mt-1 w-full`} onChange={(event) => field("currency", event.target.value as BankCredentials["currency"])} value={form.currency}><option value="BOB">Bolivianos (BOB)</option><option value="USD">Dólares (USD)</option></select></label>
        <label className="block"><FieldLabel>Código de sucursal <span className="font-normal text-slate-400">(opcional, hasta 5 caracteres)</span></FieldLabel><input className={`${fieldInputClass} mt-1 w-full`} maxLength={5} onChange={(event) => field("branchCode", event.target.value)} value={form.branchCode} /></label>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => { setEditing(false); setMessage(null); }} type="button">Cancelar</button>
          <button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50" disabled={busy !== null} type="submit">{busy === "save" ? "Verificando…" : "Guardar y verificar"}</button>
        </div>
      </form>
    ))}

    {configured && !editing && <>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Estado</dt><dd className="font-bold">{configured.enabled ? "Activo" : "Desactivado"}</dd></div>
        <div><dt className="text-xs text-slate-500">Ambiente</dt><dd className="font-bold">{configured.environment === "production" ? "Producción" : "Certificación (pruebas)"}</dd></div>
        <div><dt className="text-xs text-slate-500">Cuenta</dt><dd className="font-bold">•••• {configured.accountLast4} · {configured.currency}</dd></div>
        <div><dt className="text-xs text-slate-500">Última verificación</dt><dd className="font-bold">{configured.verifiedAt ? dateTime.format(new Date(configured.verifiedAt)) : "—"}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => void run("verify", verifyBankQrConnection, "Conexión con el banco verificada.")} type="button">{busy === "verify" ? "Probando…" : "Probar conexión"}</button>
        <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => { setForm({ ...EMPTY, environment: configured.environment, username: configured.username, currency: configured.currency, branchCode: configured.branchCode ?? "" }); setEditing(true); setMessage(null); }} type="button">Cambiar credenciales</button>
        <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => void run("toggle", () => setBankQrEnabled(!configured.enabled), configured.enabled ? "Cobro QR dinámico desactivado." : "Cobro QR dinámico activado.")} type="button">{configured.enabled ? "Desactivar" : "Activar"}</button>
        <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => { if (window.confirm("¿Quitar la conexión con el banco? Los cobros con QR volverán a registrarse a mano.")) void run("remove", removeBankQr, "Conexión con el banco eliminada."); }} type="button">Quitar</button>
      </div>
    </>}

    {message && <p className={`mt-4 text-sm ${message.tone === "error" ? "text-red-600" : "text-clinic"}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
  </section>;
}
