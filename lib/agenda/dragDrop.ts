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
  const containerRef = useRef<HTMLElement | null>(null);
  const offsetYRef = useRef(0);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top - offsetYRef.current;
      setGhostSlot(snapToSlot(y, axisH, day));
    },
    [axisH, day],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const target = e.currentTarget as HTMLElement | null;
      target?.removeEventListener("pointermove", handlePointerMove);
      target?.removeEventListener("pointerup", handlePointerUp as EventListener);
      target?.releasePointerCapture(e.pointerId);
      if (draggingId && ghostSlot) {
        onDrop(draggingId, ghostSlot);
      }
      setDraggingId(null);
      setGhostSlot(null);
    },
    [draggingId, ghostSlot, handlePointerMove, onDrop],
  );

  const dragHandlers = useCallback(
    (apptId: string) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        containerRef.current = e.currentTarget.closest<HTMLElement>("[data-agenda-col]");
        offsetYRef.current = e.nativeEvent.offsetY;
        setDraggingId(apptId);
        setGhostSlot(snapToSlot(e.nativeEvent.offsetY, axisH, day));
        e.currentTarget.addEventListener("pointermove", handlePointerMove);
        e.currentTarget.addEventListener("pointerup", handlePointerUp as EventListener);
      },
    }),
    [axisH, day, handlePointerMove, handlePointerUp],
  );

  const isDragging = useCallback(
    (apptId: string) => draggingId === apptId,
    [draggingId],
  );

  return { draggingId, ghostSlot, dragHandlers, isDragging };
}
