"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";

export type SignaturePadRef = {
  toDataURL: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

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

    useImperativeHandle(ref, () => ({
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      isEmpty: () => !hasDrawn.current,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        className="w-full rounded border border-slate-300 bg-white cursor-crosshair"
      />
    );
  }
);
