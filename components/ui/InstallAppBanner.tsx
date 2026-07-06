"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, Smartphone, X } from "lucide-react";

// Chrome/Edge disparan este evento cuando la PWA es instalable. No está tipado
// en lib.dom, así que declaramos lo mínimo que usamos.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-banner-dismissed-at";
const DISMISS_DAYS = 14;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage bloqueado (modo privado estricto): solo ocultar en memoria.
  }
}

// Invita a instalar el sistema como app en el celular: un toque al ícono y el
// doctor entra directo a la agenda con la sesión guardada, sin escribir la
// contraseña cada vez. En Android/Chrome usa el prompt nativo; en iOS (que no
// tiene prompt) muestra los pasos de Safari. No aparece si ya está instalada
// (modo standalone) ni durante los 14 días posteriores a cerrarlo.
export function InstallAppBanner() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Ya abierta desde el ícono instalado: no molestar.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || dismissedRecently()) return;

    // iOS nunca dispara beforeinstallprompt: detectar y mostrar instrucciones.
    // (iPadOS se reporta como MacIntel pero con pantalla táctil.)
    const isIos =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIos) {
      setIos(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!installPrompt && !ios) return null;

  const dismiss = () => {
    rememberDismiss();
    setInstallPrompt(null);
    setIos(false);
  };

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    // Si rechazó el prompt nativo, no insistir por 14 días.
    if (outcome === "dismissed") rememberDismiss();
    setInstallPrompt(null);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 md:inset-x-auto md:bottom-4 md:right-4 md:w-96">
      <div className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-clinic" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-800">
            Instala la aplicación en tu celular
          </p>
          {ios ? (
            <p className="mt-1 text-slate-500">
              Abre el sistema en Safari, toca{" "}
              <Share className="inline h-3.5 w-3.5 align-[-2px]" />{" "}
              <span className="font-medium text-slate-700">Compartir</span> y luego{" "}
              <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" />{" "}
              <span className="font-medium text-slate-700">
                Añadir a pantalla de inicio
              </span>
              . Inicia sesión una vez y después entras directo con un toque.
            </p>
          ) : (
            <>
              <p className="mt-1 text-slate-500">
                Un toque en el ícono y entras directo a la agenda, sin escribir
                la contraseña cada vez.
              </p>
              <button
                type="button"
                onClick={install}
                className="mt-2 rounded-md bg-clinic px-3 py-1.5 text-xs font-medium text-white hover:bg-clinic-fg"
              >
                Instalar en este dispositivo
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
