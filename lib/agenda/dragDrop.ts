import { useCallback, useRef, useState } from "react";
import type React from "react";
import { OPEN_HOUR, CLOSE_HOUR } from "@/lib/agenda";

const STEP_MIN_DRAG = 15;
const pad = (n: number) => String(n).padStart(2, "0");

// ─── Pure types ──────────────────────────────────────────────────────────────

type TimeAppt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  [key: string]: unknown;
};

export type SlotTarget = { date: string; time: string };

// ─── Pure logic (testable without React) ─────────────────────────────────────

export function snapToSlot(y: number, axisH: number, date: string): SlotTarget {
  const totalMin = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const rawMin = (Math.max(0, Math.min(axisH, y)) / axisH) * totalMin;
  const snapped = Math.floor(rawMin / STEP_MIN_DRAG) * STEP_MIN_DRAG;
  const clamped = Math.min(snapped, totalMin - STEP_MIN_DRAG);
  const absMin = clamped + OPEN_HOUR * 60;
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return { date, time: `${pad(h)}:${pad(m)}` };
}

export function applyOptimisticMove<T extends TimeAppt>(
  appts: T[],
  id: string,
  date: string,
  time: string,
): T[] {
  return appts.map((a) => {
    if (a.id !== id) return a;
    const oldStart = new Date(a.starts_at);
    const oldEnd = a.ends_at ? new Date(a.ends_at) : new Date(oldStart.getTime() + 30 * 60_000);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const [h, m] = time.split(":").map(Number);
    const [y, mo, d] = date.split("-").map(Number);
    const newStart = new Date(y, mo - 1, d, h, m);
    const newEnd = new Date(newStart.getTime() + durationMs);
    return {
      ...a,
      starts_at: `${date}T${pad(h)}:${pad(m)}:00`,
      ends_at: `${date}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}:00`,
    } as T;
  });
}

export function revertMove<T extends TimeAppt>(current: T[], original: T[]): T[] {
  const map = new Map(original.map((a) => [a.id, a]));
  return current.map((a) => map.get(a.id) ?? a);
}

// ─── React hook ──────────────────────────────────────────────────────────────

export interface UseDragOptions {
  axisH: number;
  day: string;
  onDrop: (apptId: string, slot: SlotTarget) => void;
}

export interface UseDragReturn {
  draggingId: string | null;
  ghostSlot: SlotTarget | null;
  dragHandlers: (apptId: string) => {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
  };
  isDragging: (apptId: string) => boolean;
}

export function useDrag({ axisH, day, onDrop }: UseDragOptions): UseDragReturn {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostSlot, setGhostSlot] = useState<SlotTarget | null>(null);

  // Estado en refs: los handlers adjuntados imperativamente leen siempre
  // el valor actual y no una copia "congelada" del render donde se montaron.
  const containerRef = useRef<HTMLElement | null>(null);
  const blockRef = useRef<HTMLElement | null>(null);
  const offsetYRef = useRef(0);
  const dragDayRef = useRef(day);
  const draggingIdRef = useRef<string | null>(null);
  const ghostSlotRef = useRef<SlotTarget | null>(null);

  const axisHRef = useRef(axisH);
  axisHRef.current = axisH;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Handlers estables (se crean una sola vez). Toda la data viva sale de refs.
  const moveRef = useRef<((e: PointerEvent) => void) | undefined>(undefined);
  const upRef = useRef<((e: PointerEvent) => void) | undefined>(undefined);

  if (!moveRef.current) {
    moveRef.current = (e: PointerEvent) => {
      // Columna bajo el cursor → permite arrastrar entre días/columnas.
      const under = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-agenda-col]");
      if (under) {
        containerRef.current = under;
        dragDayRef.current = under.dataset.day || dragDayRef.current;
      }
      const col = containerRef.current;
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top - offsetYRef.current;
      const slot = snapToSlot(y, axisHRef.current, dragDayRef.current);
      ghostSlotRef.current = slot;
      setGhostSlot(slot);
    };
  }

  if (!upRef.current) {
    upRef.current = (e: PointerEvent) => {
      const b = blockRef.current;
      if (b) {
        b.removeEventListener("pointermove", moveRef.current!);
        b.removeEventListener("pointerup", upRef.current! as EventListener);
        try {
          b.releasePointerCapture(e.pointerId);
        } catch {
          /* el puntero pudo soltarse fuera del elemento */
        }
      }
      const id = draggingIdRef.current;
      const slot = ghostSlotRef.current;
      if (id && slot) onDropRef.current(id, slot);
      draggingIdRef.current = null;
      ghostSlotRef.current = null;
      blockRef.current = null;
      containerRef.current = null;
      setDraggingId(null);
      setGhostSlot(null);
    };
  }

  const dragHandlers = useCallback(
    (apptId: string) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const col = el.closest<HTMLElement>("[data-agenda-col]");
        containerRef.current = col;
        blockRef.current = el;
        dragDayRef.current = col?.dataset.day || day;
        offsetYRef.current = e.nativeEvent.offsetY;
        draggingIdRef.current = apptId;
        const slot = snapToSlot(e.nativeEvent.offsetY, axisHRef.current, dragDayRef.current);
        ghostSlotRef.current = slot;
        setDraggingId(apptId);
        setGhostSlot(slot);
        el.addEventListener("pointermove", moveRef.current!);
        el.addEventListener("pointerup", upRef.current! as EventListener);
      },
    }),
    [day],
  );

  const isDragging = useCallback(
    (apptId: string) => draggingId === apptId,
    [draggingId],
  );

  return { draggingId, ghostSlot, dragHandlers, isDragging };
}
