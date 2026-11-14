/// <reference lib="webworker" />
/**
 * Makes the sounds for reading off the page's thread (see ambientSynth.ts), so sliders and page turns stay smooth
 * while a sound is being made. One request at a time: { id } in, { id, L, R } out (the samples are transferred).
 */
import { renderAmbient, type AmbientId } from "./ambientSynth";

declare const self: DedicatedWorkerGlobalScope;

let queue = Promise.resolve();

self.onmessage = (e: MessageEvent<{ id: AmbientId }>) => {
  const { id } = e.data;
  queue = queue.then(async () => {
    try {
      const [L, R] = await renderAmbient(id, { pause: false });
      self.postMessage({ id, L, R }, [L.buffer, R.buffer]);
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
  });
};
