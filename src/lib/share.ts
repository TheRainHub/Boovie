"use client";

/**
 * A picture to the system's share sheet: the native one in the apps, Web Share where the browser shares files,
 * otherwise a download.
 */
import { isNative } from "./native";

export async function shareImage(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded"> {
  if (isNative()) {
    const [{ cacheNativeCopy }, { Share }] = await Promise.all([import("./storage/nativeFiles"), import("@capacitor/share")]);
    const uri = await cacheNativeCopy(name, blob);
    await Share.share({ title, files: [uri] });
    return "shared";
  }
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

/** Lines of `text` that fit `width`, at most `max` (the last one shortened with «…»). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const cut = lines.slice(0, max);
    let last = cut[max - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    cut[max - 1] = `${last.replace(/[\s,.;:—-]+$/, "")}…`;
    return cut;
  }
  return lines;
}
