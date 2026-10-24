"use client";

import { CoverBackdrop } from "@/components/ui/CoverBackdrop";
import { Sheet } from "@/components/ui/Sheet";
import { usePlayer } from "@/lib/audio/player";
import { useToned } from "@/lib/covers/tone";
import { useBook } from "@/lib/library/hooks";
import { PlayerPanel } from "./PlayerPanel";

/** Full-screen player sheet: the blurred cover under the colour of the book. */
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
      fill
      style={{ ...style, background: "var(--t-solid)" }}
      handleClassName="bg-t-ink/30"
      backdrop={<CoverBackdrop fileId={book?.coverFileId} url={book?.coverUrl ?? cover} />}
    >
      <PlayerPanel variant="sheet" onClose={() => setExpanded(false)} />
    </Sheet>
  );
}
