import type { CapacitorConfig } from "@capacitor/cli";

// Native shells wrap the static export in /out. Add platforms with `npx cap add ios|android`.
const config: CapacitorConfig = {
  appId: "app.boowie.reader",
  appName: "Boowie",
  webDir: "out",
  backgroundColor: "#F6F1E9",
  ios: { contentInset: "never", backgroundColor: "#F6F1E9" },
  android: { backgroundColor: "#F6F1E9" },
};

export default config;
