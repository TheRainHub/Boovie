import type { Metadata } from "next";
import { StoreView } from "@/components/store/StoreView";

export const metadata: Metadata = { title: "Магазин" }; // i18n-ignore: static HTML; the app shell sets the title in the chosen language

export default function StorePage() {
  return <StoreView />;
}
