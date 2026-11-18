/* ============================================================
   CUT MUSIC 1.0 — validación y utilidades
   ============================================================ */

export const EPS = 0.001;

export function parseChunk(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return { ok: false, error: 'Indica la duración de cada fragmento.' };
  if (!/^\d*\.?\d+$/.test(text)) return { ok: false, error: 'Usa solo números (por ejemplo 10 o 2.5).' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: 'Duración no válida.' };
  if (value <= 0) return { ok: false, error: 'La duración debe ser mayor que cero.' };
  if (value < 0.1) return { ok: false, error: 'El mínimo es 0,1 segundos.' };
  if (value > 86400) return { ok: false, error: 'El máximo es 86400 segundos (24 h).' };
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
