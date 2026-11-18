/* ============================================================
   CUT MUSIC 1.0 — puente con el worker de FFmpeg
   ============================================================ */

let seq = 0;

export class AudioWorkerClient {
  constructor() {
    this.worker = new Worker(new URL('../workers/audio-worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.readyInfo = null;

    this.worker.onmessage = (event) => {
      const msg = event.data || {};
      const entry = this.pending.get(msg.id);
      if (!entry) return;

      if (msg.type === 'progress') {
        entry.onProgress?.(msg);
        return;
      }
      if (msg.type === 'segment') {
        entry.onSegment?.(msg);
        return;
      }
      if (msg.type === 'segmentError') {
        entry.onSegmentError?.(msg);
        return;
      }
      if (msg.type === 'cancelled') {
        this.pending.delete(msg.id);
        entry.resolve({ cancelled: true });
        return;
      }
      if (msg.type === 'ready') {
        this.readyInfo = { encoders: msg.encoders || [], version: msg.version, debug: msg.debug };
        this.pending.delete(msg.id);
        entry.resolve(this.readyInfo);
        return;
      }
      if (msg.type === 'probe') {
        this.pending.delete(msg.id);
        entry.resolve(Object.assign({}, msg.info, { raw: msg.raw, fs: msg.fs }));
        return;
      }
      if (msg.type === 'done') {
        this.pending.delete(msg.id);
        entry.resolve({ done: true, total: msg.total });
        return;
      }
      if (msg.type === 'error') {
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.message || 'Error del worker'));
      }
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'El worker de audio falló al cargar.');
      for (const [, entry] of this.pending) entry.reject(error);
      this.pending.clear();
    };
  }

  #call(type, payload, extra = {}, transfer = []) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...extra });
      this.worker.postMessage({ id, type, payload }, transfer);
    });
  }

  init() {
    if (this.readyInfo) return Promise.resolve(this.readyInfo);
    return this.#call('init', {});
  }

  probe(buffer, ext) {
    // Sin transferencia: el clon conserva el buffer cacheado para el corte.
    return this.#call('probe', { buffer, ext });
  }

  split(payload, handlers = {}) {
    return this.#call('split', payload, handlers, [payload.buffer]);
  }

  cancel() {
    this.worker.postMessage({ type: 'cancel' });
  }

  terminate() {
    this.worker.terminate();
  }
}
