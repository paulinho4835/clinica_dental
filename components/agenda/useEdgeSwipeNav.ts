"use client";

import { useRef } from "react";
import type React from "react";

// Umbrales iguales a los del swipe de MonthView: distancia mínima para
// navegar y dominancia horizontal para no confundir el gesto con el scroll
// vertical de la página.
const SWIPE_MIN_PX = 60;

/**
 * Swipe horizontal para navegar (semana/día anterior o siguiente) en
 * contenedores que pueden tener scroll horizontal propio (la grilla es más
 * ancha que la pantalla en móvil). Para que panear la grilla y navegar no se
 * pisen, se usa el patrón carrusel: el gesto solo navega si al empezar el
 * scroll ya estaba pegado al borde correspondiente. Si la grilla cabe entera
 * (sin scroll), ambos bordes cuentan como alcanzados y el swipe navega
 * siempre.
 *
 * Los handlers deben adjuntarse AL contenedor scrolleable (el que tiene
 * overflow-x-auto), no a un ancestro.
 */
export function useEdgeSwipeNav(onNavigate?: (delta: 1 | -1) => void): {
  onTouchStart?: React.TouchEventHandler<HTMLElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLElement>;
} {
  const start = useRef<{
    x: number;
    y: number;
    atLeft: boolean;
    atRight: boolean;
  } | null>(null);

  if (!onNavigate) return {};

  return {
    onTouchStart(e) {
      const el = e.currentTarget;
      const t = e.touches[0];
      start.current = {
        x: t.clientX,
        y: t.clientY,
        atLeft: el.scrollLeft <= 1,
        atRight: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      };
    },
    onTouchEnd(e) {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      // Deslizar a la izquierda = avanzar (como el swipe del mes).
      if (dx < 0 && s.atRight) onNavigate(1);
      else if (dx > 0 && s.atLeft) onNavigate(-1);
    },
  };
}
