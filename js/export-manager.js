/* ============================================================
   CUT MUSIC 1.0 — descargas, ZIP y carpeta de destino
   ============================================================ */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** true si Chrome expone el selector de carpetas de la File System Access API. */
export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === 'function';
}

export async function pickDirectory() {
  if (!supportsDirectoryPicker()) {
    throw new Error('Este navegador no permite elegir carpeta. Usa la descarga en ZIP.');
  }
  return window.showDirectoryPicker({ id: 'cutmusic-salida', mode: 'readwrite', startIn: 'music' });
}

/** Comprueba (y pide si hace falta) permiso de escritura. */
export async function ensureWritePermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  if (typeof handle.queryPermission === 'function') {
    const state = await handle.queryPermission(opts);
    if (state === 'granted') return true;
  }
  if (typeof handle.requestPermission === 'function') {
    const state = await handle.requestPermission(opts);
    return state === 'granted';
  }
  return true;
}

async function fileExists(dirHandle, name) {
  try { await dirHandle.getFileHandle(name); return true; } catch (e) { return false; }
}

/** Nombre libre dentro de la carpeta: nunca sobrescribe sin permiso. */
async function freeName(dirHandle, filename) {
  if (!(await fileExists(dirHandle, filename))) return filename;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await fileExists(dirHandle, candidate))) return candidate;
  }
  throw new Error('No hay un nombre libre en la carpeta de destino.');
}

export async function writeFileToDirectory(dirHandle, filename, blob) {
  const target = await freeName(dirHandle, filename);
  const fileHandle = await dirHandle.getFileHandle(target, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return target;
}

export function makeZip(files) {
  if (!window.JSZip) throw new Error('No se ha cargado el generador de ZIP.');
  const zip = new window.JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '_');
}
