import type { CapacitorConfig } from "@capacitor/cli";

// Native shells wrap the static export in /out. Add platforms with `npx cap add ios|android`.
const config: CapacitorConfig = {
  appId: "app.titan.reader",
  appName: "Titan",
  webDir: "out",
  backgroundColor: "#0A0B0D",
  ios: { contentInset: "never", backgroundColor: "#0A0B0D" },
  android: { backgroundColor: "#0A0B0D" },
};

export default config;
