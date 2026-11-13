import type { Metadata } from "next";
import { Suspense } from "react";
import { WrappedView } from "@/components/wrapped/WrappedView";

export const metadata: Metadata = { title: "Итоги года" }; // i18n-ignore: static HTML; the app shell sets the title in the chosen language

export default function WrappedPage() {
  return (
    <Suspense>
      <WrappedView />
    </Suspense>
  );
}
