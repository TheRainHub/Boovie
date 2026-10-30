import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";

export const metadata: Metadata = { title: "Настройки" }; // i18n-ignore: static HTML; the app shell sets the title in the chosen language

export default function SettingsPage() {
  return <SettingsView />;
}
