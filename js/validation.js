/* ============================================================
   CUT MUSIC 1.0 — validación y utilidades
   ============================================================ */

export const EPS = 0.001;

export function parseChunk(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return { ok: false, error: 'val.chunkEmpty' };
  if (!/^\d*\.?\d+$/.test(text)) return { ok: false, error: 'val.chunkFormat' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: 'val.chunkInvalid' };
  if (value <= 0) return { ok: false, error: 'val.chunkPositive' };
  if (value < 0.1) return { ok: false, error: 'val.chunkMin' };
  if (value > 86400) return { ok: false, error: 'val.chunkMax' };
  return { ok: true, value };
}

export function formatTime(seconds, decimals = 2) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const sec = rest.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatTimeShort(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
    : m > 0
      ? `${m}m ${String(sec).padStart(2, '0')}s`
      : `${sec}s`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function fileExtension(name) {
  const m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : '';
}

export function baseName(name) {
  return String(name || 'Cancion').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Cancion';
}

/* ---------- v1.1.0: tiempos HH:MM:SS.mmm ---------- */

/** Convierte "00:00:35.000", "1:20", "35" o "2,5" a segundos. */
export function parseTimestamp(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return { ok: false, error: 'val.timeEmpty' };
  if (!/^\d{1,3}(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(text)) {
    return { ok: false, error: 'val.timeFormat' };
  }
  const parts = text.split(':');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2]);
    if (minutes > 59 || seconds >= 60) {
      return { ok: false, error: 'val.timeUnits' };
    }
  } else if (parts.length === 2) {
    minutes = Number(parts[0]);
    seconds = Number(parts[1]);
    if (seconds >= 60) {
      return { ok: false, error: 'val.timeSeconds' };
    }
  } else {
    seconds = Number(parts[0]);
  }
  const value = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isFinite(value)) return { ok: false, error: 'val.timeInvalid' };
  if (value < 0) return { ok: false, error: 'val.timeNegative' };
  return { ok: true, value };
}

/** Segundos -> "HH:MM:SS.mmm" */
export function formatTimestamp(seconds) {
  // Se redondea primero a milisegundos para evitar "…:19.1000" por coma flotante.
  const totalMs = Math.round(Math.max(0, Number(seconds) || 0) * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}