import type { Metadata } from "next";
import { LibraryView } from "@/components/library/LibraryView";

export const metadata: Metadata = { title: "Книги" };

export default function LibraryPage() {
  return <LibraryView />;
}
