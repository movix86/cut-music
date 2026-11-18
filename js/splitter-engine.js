/* ============================================================
   CUT MUSIC 1.0 — cálculo de fragmentos
   Regla de oro: no se pierde ni se solapa ningún segundo.
   ============================================================ */

import { EPS } from './validation.js';

export const MODE = { SEPARATE: 'separate', MERGE: 'merge' };

/**
 * Calcula los cortes de una canción.
 * @param {number} duration duración total en segundos
 * @param {number} chunk duración deseada de cada fragmento
 * @param {'separate'|'merge'} mode qué hacer con el sobrante
 * @returns {{segments: Array<{start:number,dur:number}>, full:number,
 *            remainder:number, lastDuration:number, total:number,
 *            hasRemainder:boolean, mode:string}}
 */
export function computePlan(duration, chunk, mode = MODE.SEPARATE) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('La duración de la canción no es válida.');
  }
  if (!Number.isFinite(chunk) || chunk <= 0) {
    throw new Error('La duración de cada fragmento debe ser mayor que cero.');
  }

  // Si la canción cabe en un solo fragmento, no hay nada que decidir.
  if (chunk >= duration - EPS) {
    return {
      segments: [{ start: 0, dur: duration }],
      full: 0,
      remainder: duration,
      lastDuration: duration,
      total: 1,
      hasRemainder: false,
      mode,
    };
  }

  const full = Math.floor((duration + EPS) / chunk);
  let remainder = duration - full * chunk;
  if (remainder < EPS) remainder = 0;

  const hasRemainder = remainder > Math.max(EPS, chunk * 0.001);

  let segments = [];
  let lastDuration = hasRemainder ? remainder : chunk;

  if (!hasRemainder) {
    for (let i = 0; i < full; i++) segments.push({ start: i * chunk, dur: chunk });
  } else if (mode === MODE.MERGE) {
    // Los fragmentos completos menos el último, y el último absorbe el sobrante.
    for (let i = 0; i < full - 1; i++) segments.push({ start: i * chunk, dur: chunk });
    const start = (full - 1) * chunk;
    const dur = duration - start;
    segments.push({ start, dur });
    lastDuration = dur;
  } else {
    for (let i = 0; i < full; i++) segments.push({ start: i * chunk, dur: chunk });
    segments.push({ start: full * chunk, dur: remainder });
    lastDuration = remainder;
  }

  // Ajuste fino: el último fragmento termina exactamente en la duración total.
  if (segments.length) {
    const last = segments[segments.length - 1];
    last.dur = Math.max(0, duration - last.start);
    lastDuration = last.dur;
  }

  return {
    segments,
    full: segments.length - (hasRemainder && mode !== MODE.MERGE ? 1 : 0),
    remainder,
    lastDuration,
    total: segments.length,
    hasRemainder,
    mode,
  };
}

export function segmentName(base, index, ext, total) {
  const digits = Math.max(3, String(total).length);
  return `${base}_Parte_${String(index + 1).padStart(digits, '0')}.${ext}`;
}
