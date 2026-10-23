"use client";

import { Sheet } from "@/components/ui/Sheet";
import { usePlayer } from "@/lib/audio/player";
import { PlayerPanel } from "./PlayerPanel";

export function FullPlayer() {
  const expanded = usePlayer((s) => s.expanded);
  const setExpanded = usePlayer((s) => s.setExpanded);
  const bookId = usePlayer((s) => s.bookId);
  return (
    <Sheet open={expanded && !!bookId} onClose={() => setExpanded(false)} full>
      <PlayerPanel variant="sheet" />
    </Sheet>
  );
}
