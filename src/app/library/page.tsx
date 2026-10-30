import type { Metadata } from "next";
import { LibraryView } from "@/components/library/LibraryView";

export const metadata: Metadata = { title: "Книги" }; // i18n-ignore: static HTML; the app shell sets the title in the chosen language

export default function LibraryPage() {
  return <LibraryView />;
}
