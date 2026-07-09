"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NewCampaignModal } from "@/components/campaigns/NewCampaignModal";

export function CampaignListClient() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva campaña
      </Button>
      <NewCampaignModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
