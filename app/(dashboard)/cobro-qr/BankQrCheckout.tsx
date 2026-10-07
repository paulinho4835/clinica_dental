"use client";

import { useCallback, useEffect, useRef, useState } from "react";
const moneyFormat = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import { cancelBankQr, checkBankQr, generateBankQr, getBankQrState } from "./actions";

const POLL_MS = 4000;
/** Pasado este tiempo sin pago, la pantalla deja de preguntar sola; se puede consultar o anular a mano. */
const GIVE_UP_MS = 10 * 60 * 1000;

type Qr = { paymentId: string; qrImage: string; amount: number; qrId: string };
export type PaidQr = { id: string; payerName: string | null; bankTransactionId: string | null; paidAt: string | null };

/** ¿La organización tiene el addon, la cuenta del banco conectada y activa? Sin eso se cobra QR como siempre. */
export function useBankQrAvailable(enabled = true) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void getBankQrState().then((result) => {
      if (active) setReady(result.ok === true && result.data.available && result.data.configured && result.data.enabled);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return ready;
}

/** Un "ding" corto para enterarse del pago sin mirar la pantalla. */
function playPaidSound() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.14;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
    });
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // Sin sonido: la pantalla igual muestra el pago.
  }
}

/**
 * Genera el QR del banco por el monto exacto, espera el pago y, al confirmarse, avisa con `onPaid` para que
 * quien lo usa registre el cobro. Si `onPaid` devuelve un mensaje, el pago llegó pero el registro falló.
 */
export function BankQrCheckout({ amount, patientId, description, onPaid, onCancelled, onDone }: {
  amount: number;
  patientId?: string | null;
  description: string;
  onPaid: (payment: PaidQr) => Promise<string | null>;
  onCancelled: () => void;
  /** Con esto, el aviso de pago exitoso queda en pantalla hasta que se pulse «Listo». */
  onDone?: () => void;
}) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [paid, setPaid] = useState<PaidQr | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState<"check" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registeredOk, setRegisteredOk] = useState(false);
  const started = useRef(false);
  const startedAt = useRef(0);
  const current = useRef<string | null>(null);
  const registered = useRef(false);

  const generate = useCallback(async () => {
    setError(null);
    const result = await generateBankQr({ amount, description, patientId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    current.current = result.data.paymentId;
    startedAt.current = Date.now();
    setQr(result.data);
    setWaiting(true);
  }, [amount, patientId, description]);

  useEffect(() => {
    // Una sola vez por cobro, también con los efectos dobles de desarrollo.
    if (started.current) return;
    started.current = true;
    void generate();
  }, [generate]);

  const register = useCallback(
    async (payment: PaidQr) => {
      setRegistering(true);
      setRegisterError(null);
      const problem = await onPaid(payment);
      setRegistering(false);
      if (problem) setRegisterError(problem);
      else setRegisteredOk(true);
    },
    [onPaid],
  );

  const apply = useCallback(
    (row: { id: string; status: string; payer_name: string | null; bank_transaction_id: string | null; paid_at: string | null }) => {
      if (row.status === "pending") return;
      setWaiting(false);
      if (row.status === "paid") {
        const payment = { id: row.id, payerName: row.payer_name, bankTransactionId: row.bank_transaction_id, paidAt: row.paid_at };
        setPaid(payment);
        if (!registered.current) {
          registered.current = true;
          playPaidSound();
          void register(payment);
        }
      } else {
        onCancelled();
      }
    },
    [onCancelled, register],
  );

  const check = useCallback(
    async (quiet: boolean) => {
      const paymentId = current.current;
      if (!paymentId) return;
      if (!quiet) setBusy("check");
      const result = await checkBankQr(paymentId);
      if (!quiet) setBusy(null);
      if (current.current !== paymentId) return;
      // Una consulta automática fallida no corta la espera; una manual muestra el motivo.
      if (!result.ok) {
        if (!quiet) setError(result.error);
        return;
      }
      if (!quiet) setError(null);
      apply(result.data);
    },
    [apply],
  );

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        setWaiting(false);
        return;
      }
      if (document.visibilityState === "visible") await check(true);
      if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [check, waiting]);

  async function cancel() {
    const paymentId = current.current;
    if (!paymentId) {
      onCancelled();
      return;
    }
    setBusy("cancel");
    setError(null);
    // Si el cliente pagó justo antes, el servidor lo devuelve como pagado y se registra el cobro.
    const result = await cancelBankQr(paymentId);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(result.data);
  }

  if (paid) {
    return <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 text-center" role="status" aria-live="assertive">
      <p className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-clinic text-3xl font-black text-white" aria-hidden="true">✓</p>
      <h3 className="mt-3 text-xl font-black">Pago exitoso</h3>
      <p className="mt-1 text-2xl font-black">{moneyFormat.format(qr?.amount ?? amount)} Bs</p>
      {paid.payerName && <p className="mt-1 text-sm">Pagado por {paid.payerName}</p>}
      {paid.bankTransactionId && <p className="text-xs text-slate-500">Transacción {paid.bankTransactionId}</p>}
      {registering && <p className="mt-3 text-sm text-slate-500">Registrando el pago…</p>}
      {registerError && <>
        <p className="mt-3 text-sm text-red-600" role="alert">El pago se recibió, pero no se pudo registrar: {registerError}</p>
        <button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50 mt-3" disabled={registering} onClick={() => void register(paid)} type="button">Reintentar registrar el pago</button>
      </>}
      {registeredOk && onDone && <>
        <p className="mt-3 text-sm text-green-600">El pago quedó registrado.</p>
        <button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg mt-3" onClick={onDone} type="button">Listo</button>
      </>}
    </div>;
  }

  if (!qr) {
    return <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 text-center text-sm">
      {error ? <>
        <p className="text-red-600" role="alert">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" onClick={onCancelled} type="button">Volver</button>
          <button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50" onClick={() => void generate()} type="button">Reintentar</button>
        </div>
      </> : <p className="text-slate-500" role="status">Generando el QR de cobro…</p>}
    </div>;
  }

  return <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 text-center">
    {/* El QR es una imagen en base64 que manda el banco. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt={`QR de cobro por ${moneyFormat.format(qr.amount)} Bs`} className="mx-auto h-60 w-60 max-w-full rounded-xl bg-white p-2" src={`data:image/png;base64,${qr.qrImage}`} />
    <p className="mt-3 text-2xl font-black">{moneyFormat.format(qr.amount)} Bs</p>
    <p className="mt-1 text-sm text-slate-600" role="status">{waiting ? "Esperando el pago… muestra este QR al cliente." : "Ya no se consulta solo. Usa «Consultar pago» o anula el cobro."}</p>
    {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    <div className="mt-4 flex justify-center gap-2">
      <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy !== null} onClick={() => void cancel()} type="button">{busy === "cancel" ? "Anulando…" : "Anular cobro"}</button>
      <button className="inline-flex items-center justify-center rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50" disabled={busy !== null} onClick={() => void check(false)} type="button">{busy === "check" ? "Consultando…" : "Consultar pago"}</button>
    </div>
  </div>;
}
