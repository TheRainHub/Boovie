"use client";

import { Sheet } from "@/components/ui/Sheet";
import { usePlayer } from "@/lib/audio/player";
import { useToned } from "@/lib/covers/tone";
import { useBook } from "@/lib/library/hooks";
import { PlayerPanel } from "./PlayerPanel";

/** Full-screen player sheet, painted in the colour of the book's cover. */
export function FullPlayer() {
  const expanded = usePlayer((s) => s.expanded);
  const setExpanded = usePlayer((s) => s.setExpanded);
  const bookId = usePlayer((s) => s.bookId);
  const cover = usePlayer((s) => s.cover);
  const book = useBook(bookId);
  const { style } = useToned(book?.coverFileId, book?.coverUrl ?? cover);
  return (
    <Sheet
      open={expanded && !!bookId}
      onClose={() => setExpanded(false)}
      full
      style={{ ...style, background: "var(--t-bg)" }}
      handleClassName="bg-t-ink/30"
    >
      <PlayerPanel variant="sheet" onClose={() => setExpanded(false)} />
    </Sheet>
  );
}
