import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/ProfileView";

export const metadata: Metadata = { title: "Профиль" }; // i18n-ignore: static HTML; the app shell sets the title in the chosen language

export default function ProfilePage() {
  return <ProfileView />;
}
