import type { Metadata } from "next";
import { StoreView } from "@/components/store/StoreView";

export const metadata: Metadata = { title: "Магазин" };

export default function StorePage() {
  return <StoreView />;
}
