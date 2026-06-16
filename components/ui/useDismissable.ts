"use client";

import { useEffect, useRef } from "react";

// Hook para modales con layout propio (header/body/footer fijos) que no usan
// el componente <Modal>. Aporta el comportamiento de teclado/accesibilidad sin
// imponer estructura: cierra con Escape y bloquea el scroll del body.
//
// `active` permite usarlo cuando el modal se renderiza condicionalmente dentro
// del mismo componente (no puede llamarse el hook bajo una condición).
export function useDismissable(onClose: () => void, active = true) {
  // Ref para que el listener siempre llame al onClose más reciente sin
  // re-suscribirse en cada render (onClose suele ser una arrow nueva).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
