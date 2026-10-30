/** Chapter mapping between the text and audio editions of the same work (Read ↔ Listen). */

const normalize = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); // i18n-ignore

export function mapChapterIndex(
  from: { title: string; group?: string }[],
  to: { title: string; group?: string }[],
  index: number,
): number {
  if (!to.length) return 0;
  const src = from[index];
  if (src) {
    const key = normalize(`${src.group ?? ""} ${src.title}`);
    const exact = to.findIndex((t) => normalize(`${t.group ?? ""} ${t.title}`) === key);
    if (exact >= 0) return exact;
    const byTitle = to.findIndex((t) => normalize(t.title) === normalize(src.title));
    if (byTitle >= 0) return byTitle;
  }
  if (from.length === to.length) return Math.min(index, to.length - 1);
  return Math.round((index / Math.max(1, from.length - 1)) * (to.length - 1));
}
