import type { Metadata } from "next";
import { Suspense } from "react";
import { BookScreen } from "@/components/book/BookScreen";

export const metadata: Metadata = { title: "Книга" };

// Book ids are local (IndexedDB), so the page is a static shell that reads ?id= on the client.
export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <BookScreen />
    </Suspense>
  );
}
