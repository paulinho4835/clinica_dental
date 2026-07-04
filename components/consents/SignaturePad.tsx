"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type SignaturePadRef = {
  toDataURL: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

// El canvas queda transparente si solo se dibuja el trazo: el PNG exportado
// se ve bien sobre fondo blanco (modo claro) pero se vuelve invisible si el
// contenedor que lo muestra después usa un fondo que se invierte en modo
// oscuro (clase `bg-white`, ver tailwind.config.ts). Pintar un fondo blanco
// real como primer píxel del canvas hace que la firma se vea igual siempre,
// sin depender del tema de quien la visualice.
function fillWhite(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getPos(
  e: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export const SignaturePad = forwardRef<SignaturePadRef>(
  function SignaturePad(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const hasDrawn = useRef(false);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) fillWhite(canvas);
    }, []);

    useImperativeHandle(ref, () => ({
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      isEmpty: () => !hasDrawn.current,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        fillWhite(canvas);
        hasDrawn.current = false;
      },
    }));

    const onPointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        isDrawing.current = true;
        const ctx = canvas.getContext("2d")!;
        const { x, y } = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(x, y);
      },
      []
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const { x, y } = getPos(e, canvas);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1e293b";
        ctx.lineTo(x, y);
        ctx.stroke();
        hasDrawn.current = true;
      },
      []
    );

    const stopDrawing = useCallback(() => {
      isDrawing.current = false;
    }, []);

    return (
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{ touchAction: "none" }}
        className="w-full rounded border border-slate-300 bg-[#ffffff] cursor-crosshair"
      />
    );
  }
);
