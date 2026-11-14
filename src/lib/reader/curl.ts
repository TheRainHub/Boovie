/**
 * The geometry of a page being turned like paper. The page (the screen, `W` × `H`) is held at its left edge, the
 * spine; one of its right corners `C` has been lifted and brought to `P`. The page folds along the line halfway
 * between them (the perpendicular bisector of C–P): what lies on C's side of that line is lifted and lies,
 * mirrored, over the rest — its back showing — and the page underneath shows where it was.
 *
 * Coordinates of the fold's own frame ("local"): x runs across the fold, from it towards P; y along it.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface CurlFrame {
  /** Screen polygon of the page still lying flat (the spine's side of the fold). */
  front: Pt[];
  /** The fold's middle on the screen, and the angle of its frame (radians). */
  origin: Pt;
  angle: number;
  /** Local polygon of the page's back, folded over (x ≥ 0). */
  flap: Pt[];
  /** Local polygon of the page underneath, uncovered (x ≤ 0). */
  bare: Pt[];
  /** How far the folded part reaches from the fold. */
  reach: number;
}

/** The part of a polygon where `side` ≥ 0 (Sutherland–Hodgman against one line). */
function clip(poly: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = side(a);
    const fb = side(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function curlFrame(W: number, H: number, C: Pt, P: Pt): CurlFrame | null {
  const dx = P.x - C.x;
  const dy = P.y - C.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  const n = { x: dx / len, y: dy / len };
  const t = { x: -n.y, y: n.x };
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
  const toLocal = (X: Pt): Pt => ({ x: (X.x - M.x) * n.x + (X.y - M.y) * n.y, y: (X.x - M.x) * t.x + (X.y - M.y) * t.y });
  const toScreen = (L: Pt): Pt => ({ x: M.x + L.x * n.x + L.y * t.x, y: M.y + L.x * n.y + L.y * t.y });
  const page = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }].map(toLocal);
  const front = clip(page, (p) => p.x).map(toScreen);
  const bare = clip(page, (p) => -p.x);
  const flap = bare.map((p) => ({ x: -p.x, y: p.y })).reverse();
  const reach = flap.reduce((m, p) => Math.max(m, p.x), 0);
  return { front, origin: M, angle: Math.atan2(n.y, n.x), flap, bare, reach };
}

/**
 * Where a lifted corner can go: the page is held at the spine, so the corner stays within the page's width of the
 * spine's end on its side, and within the page's diagonal of the other end — paper doesn't stretch.
 */
export function constrain(P: Pt, C: Pt, W: number, H: number): Pt {
  let p = P;
  const near = { x: 0, y: C.y };
  const far = { x: 0, y: H - C.y };
  const d1 = Math.hypot(p.x - near.x, p.y - near.y);
  if (d1 > W) p = { x: near.x + ((p.x - near.x) * W) / d1, y: near.y + ((p.y - near.y) * W) / d1 };
  const diag = Math.hypot(W, H);
  const d2 = Math.hypot(p.x - far.x, p.y - far.y);
  if (d2 > diag) p = { x: far.x + ((p.x - far.x) * diag) / d2, y: far.y + ((p.y - far.y) * diag) / d2 };
  return p;
}

export const polygon = (pts: Pt[], dx = 0, dy = 0) =>
  pts.length < 3 ? "polygon(0 0, 0 0, 0 0)" : `polygon(${pts.map((p) => `${(p.x + dx).toFixed(1)}px ${(p.y + dy).toFixed(1)}px`).join(", ")})`;
