import type * as PdfJs from "pdfjs-dist";
import { withBase } from "../basePath";

export type PdfLib = typeof PdfJs;

let lib: Promise<PdfLib> | null = null;

/** Lazily load pdf.js (browser build) with the same-origin worker copied to /public by scripts/copy-pdf-worker.mjs. */
export function loadPdfjs(): Promise<PdfLib> {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = withBase("/pdf.worker.min.mjs");
      return m;
    });
  }
  return lib;
}
