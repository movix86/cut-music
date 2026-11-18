/* ============================================================
   CUT MUSIC 1.0 — entrada de archivos y metadatos
   ============================================================ */

import { formatBytes, fileExtension, baseName } from './validation.js';

const AUDIO_EXT = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'mp4', 'webm'];

export function isAudioFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('audio/')) return true;
  return AUDIO_EXT.includes(fileExtension(file.name));
}

export function describeFile(file) {
  const ext = fileExtension(file.name) || 'audio';
  return {
    file,
    name: file.name,
    base: baseName(file.name),
    ext,
    size: file.size,
    sizeText: formatBytes(file.size),
  };
}

/** Duración leyendo los metadatos del propio navegador (rápido, sin decodificar). */
export function readDuration(file, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration);
      else finish(null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

export async function readArrayBuffer(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function bindDropZone(zone, onFiles) {
  let depth = 0;

  const handle = (fileList) => {
    const file = Array.from(fileList || []).find(isAudioFile);
    if (file) onFiles(file);
  };

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('dragover');
    handle(e.dataTransfer && e.dataTransfer.files);
  });
  zone.addEventListener('click', () => zone.querySelector('input[type=file]')?.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      zone.querySelector('input[type=file]')?.click();
    }
  });
}

export function readFileFromInput(input) {
  return new Promise((resolve) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      resolve(file || null);
    }, { once: true });
    input.click();
  });
}
