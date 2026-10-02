"use client";

import { useState, type ReactNode } from "react";

export type SettingsTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function SettingsTabs({
  tabs,
  defaultTab,
  urlParam,
}: {
  tabs: SettingsTab[];
  /** Pestaña abierta al cargar (p. ej. leída de ?tab=). Si no existe, la primera. */
  defaultTab?: string;
  /** Si se indica, la pestaña elegida se guarda en ese parámetro de la URL: al
      recargar o volver atrás se abre la misma, no siempre la primera. */
  urlParam?: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id,
  );

  function select(id: string) {
    setActive(id);
    if (!urlParam) return;
    // replaceState (no pushState): cambiar de pestaña no debe llenar el
    // historial, y no dispara una navegación (el server no vuelve a renderizar).
    const url = new URL(window.location.href);
    url.searchParams.set(urlParam, id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div>
      <div role="tablist" className="mb-8 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => select(t.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active === t.id
                ? "border-clinic text-clinic"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-10">
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  );
}
