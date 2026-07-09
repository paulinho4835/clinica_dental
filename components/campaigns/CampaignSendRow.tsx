"use client";

import { useState } from "react";
import { ExternalLink, Check, Undo2 } from "lucide-react";
import { buildCampaignWaLink } from "@/lib/campaign-message";
import { markSent, unmarkSent } from "@/app/(dashboard)/campanas/actions";
import { cn } from "@/lib/cn";

export function CampaignSendRow({
  campaignId,
  patientId,
  fullName,
  phone,
  message,
  initialSentAt,
}: {
  campaignId: string;
  patientId: string;
  fullName: string;
  phone: string | null;
  message: string;
  initialSentAt: string | null;
}) {
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [pending, setPending] = useState(false);

  const waLink = buildCampaignWaLink(phone, message, fullName);

  async function handleSend() {
    if (!waLink) return;
    window.open(waLink, "_blank", "noopener,noreferrer");
    // Optimista: marcamos enviado de inmediato; revertimos si la action falla.
    const prev = sentAt;
    setSentAt(new Date().toISOString());
    setPending(true);
    const res = await markSent(campaignId, patientId);
    setPending(false);
    if (!res.ok) setSentAt(prev);
  }

  async function handleUndo() {
    const prev = sentAt;
    setSentAt(null);
    setPending(true);
    const res = await unmarkSent(campaignId, patientId);
    setPending(false);
    if (!res.ok) setSentAt(prev);
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm first:border-t-0">
      <div>
        <p className="font-medium text-slate-800">{fullName}</p>
        <p className="text-xs text-slate-400">{phone}</p>
      </div>
      {sentAt ? (
        <button
          onClick={handleUndo}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          title="Deshacer"
        >
          <Check className="h-3.5 w-3.5" />
          Enviado
          <Undo2 className="h-3 w-3 opacity-60" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!waLink || pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            waLink
              ? "bg-green-600 text-white hover:bg-green-700"
              : "cursor-not-allowed bg-slate-100 text-slate-400",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Enviar
        </button>
      )}
    </div>
  );
}
