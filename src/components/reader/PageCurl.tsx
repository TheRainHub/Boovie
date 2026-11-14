"use client";

import type { RefObject } from "react";
import { polygon, type CurlFrame } from "@/lib/reader/curl";
import type { PaperTint } from "@/lib/reader/prefs";

export interface CurlEls {
  boxRef: RefObject<HTMLDivElement | null>;
  flapRef: RefObject<HTMLDivElement | null>;
  shadeRef: RefObject<HTMLDivElement | null>;
}

/**
 * The page's folded part and the shadow of the fold, drawn over the reader while a page turns (see
 * lib/reader/curl.ts). Both live in the fold's own frame (rotated with it), so their shading runs across the fold.
 */
export function CurlFlap({ boxRef, flapRef, shadeRef, paper }: CurlEls & { paper: PaperTint }) {
  // The back of the page: the paper a shade darker (lighter on dark paper), as if seen against the light.
  const back = `color-mix(in srgb, ${paper.bg} 92%, ${paper.dark ? "#ffffff" : "#5f4a36"})`;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      <div ref={boxRef} className="absolute left-0 top-0" style={{ display: "none", transformOrigin: "0 0" }}>
        <div ref={shadeRef} className="absolute" />
        <div ref={flapRef} className="absolute left-0" style={{ backgroundColor: back }} />
      </div>
    </div>
  );
}

/** One frame of a turn: the flat part of the page clipped, the folded part and the shadow placed. */
export function paintCurl(front: HTMLElement, els: CurlEls, f: CurlFrame | null, dark: boolean, W: number, H: number) {
  const box = els.boxRef.current;
  const flap = els.flapRef.current;
  const shade = els.shadeRef.current;
  if (!f) {
    front.style.clipPath = "";
    if (box) box.style.display = "none";
    return;
  }
  front.style.clipPath = polygon(f.front);
  if (!box || !flap || !shade) return;
  box.style.display = "block";
  box.style.transform = `translate(${f.origin.x.toFixed(1)}px, ${f.origin.y.toFixed(1)}px) rotate(${f.angle.toFixed(5)}rad)`;
  const big = Math.ceil(Math.hypot(W, H) * 1.5);
  const reach = Math.max(1, f.reach);

  // The back of the page: shadowed in the fold, a highlight where the paper bends, darker towards its edge.
  flap.style.top = `${-big}px`;
  flap.style.width = `${big}px`;
  flap.style.height = `${2 * big}px`;
  flap.style.clipPath = polygon(f.flap, 0, big);
  flap.style.backgroundImage = `linear-gradient(90deg, ${dark ? "rgba(0,0,0,0.45)" : "rgba(60,40,20,0.22)"} 0px, ${dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.65)"} ${Math.min(24, reach * 0.22).toFixed(1)}px, rgba(255,255,255,0) ${(reach * 0.6).toFixed(1)}px, ${dark ? "rgba(0,0,0,0.3)" : "rgba(40,25,10,0.1)"} ${reach.toFixed(1)}px)`;

  // The shadow the lifted page casts on the one beneath, deepest at the fold.
  const width = Math.min(80, 14 + reach * 0.4);
  shade.style.left = `${-width}px`;
  shade.style.width = `${width}px`;
  shade.style.top = `${-big}px`;
  shade.style.height = `${2 * big}px`;
  shade.style.clipPath = polygon(f.bare, width, big);
  shade.style.backgroundImage = `linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,${dark ? 0.6 : 0.3}) 100%)`;
}
