"use client";

import { MiniStatus } from "./MiniStatus";
import { type MonthAppt, isQuickConsult } from "./apptHelpers";

export function ApptActions({
  appt,
  canWrite,
  onLink,
  compact = false,
  iconOnly = false,
}: {
  appt: MonthAppt;
  canWrite: boolean;
  onLink: (a: MonthAppt) => void;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 ${compact ? "flex-wrap" : ""}`}>
      <MiniStatus id={appt.id} status={appt.status} canWrite={canWrite} iconOnly={iconOnly} />
      {canWrite && isQuickConsult(appt) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLink(appt);
          }}
          className="rounded border border-clinic px-1.5 py-0.5 text-[10px] font-medium text-clinic hover:bg-clinic hover:text-white"
        >
          Vincular
        </button>
      )}
    </div>
  );
}
