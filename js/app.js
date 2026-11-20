/* ============================================================
   CUT MUSIC 1.1.0 — aplicación
   ============================================================ */
import {
  parseChunk, formatTime, formatTimeShort, formatBytes, parseTimestamp, formatTimestamp,
} from './validation.js';
import { computePlan, segmentName, MODE } from './splitter-engine.js';
import { isAudioFile, describeFile, readDuration, readArrayBuffer, bindDropZone, readFileFromInput } from './file-manager.js';
import { AudioWorkerClient } from './worker-manager.js';
import { downloadBlob, makeZip, sanitizeFilename } from './export-manager.js';

const $ = (id) => document.getElementById(id);
const APP_VERSION = '1.1.0';

const FORMATS = [
  { id: 'mp3',  label: 'MP3',  lossy: true,  encoder: 'libmp3lame', mime: 'audio/mpeg' },
  { id: 'wav',  label: 'WAV',  lossy: false, encoder: 'pcm_s16le',  mime: 'audio/wav' },
  { id: 'flac', label: 'FLAC', lossy: false, encoder: 'flac',       mime: 'audio/flac' },
  { id: 'm4a',  label: 'M4A (AAC)', lossy: true, encoder: 'aac',    mime: 'audio/mp4' },
  { id: 'aac',  label: 'AAC',  lossy: true,  encoder: 'aac',        mime: 'audio/aac' },
  { id: 'wma',  label: 'WMA',  lossy: true,  encoder: 'wmav2',      mime: 'audio/x-ms-wma' },
  { id: 'ogg',  label: 'OGG (Vorbis)', lossy: true, encoder: 'libvorbis', mime: 'audio/ogg' },
];

const state = {
  file: null,
  desc: null,
  duration: null,
  cachedBytes: null,
  chunk: 10,
  mode: MODE.SEPARATE,
  plan: null,
  format: 'mp3',
  bitrate: 192,
  sampleRate: 44100,
  results: [],
  busy: false,
  cancelled: false,
  worker: null,
  workerReady: false,
  encoders: null,
  remainderChosen: false,
  // v1.1.0 — corte por intervalo (excluyente con la división por partes)
  intervalMode: false,
  interval: null,
};

const el = {
  dropZone: $('dropZone'), pickBtn: $('pickBtn'), fileInput: $('fileInput'),
  fileInfo: $('fileInfo'), fileName: $('fileName'), fileFormat: $('fileFormat'),
  fileSize: $('fileSize'), fileRate: $('fileRate'), fileDuration: $('fileDuration'),
  fileStatus: $('fileStatus'), clearFileBtn: $('clearFileBtn'),
  chunkInput: $('chunkInput'), chips: $('presetChips'), chunkError: $('chunkError'),
  sumFull: $('sumFull'), sumLast: $('sumLast'), sumTotal: $('sumTotal'),
  remainderInfo: $('remainderInfo'),
  formatSelect: $('formatSelect'), rateSelect: $('rateSelect'),
  bitrateRow: $('bitrateRow'), bitrateSelect: $('bitrateSelect'), formatHint: $('formatHint'),
  partsCard: $('partsCard'), partsBody: $('partsBody'), partsInactive: $('partsInactive'),
  intervalToggle: $('intervalToggle'), intervalFields: $('intervalFields'),
  intervalStart: $('intervalStart'), intervalEnd: $('intervalEnd'),
  intervalError: $('intervalError'), intervalInfo: $('intervalInfo'), intervalHint: $('intervalHint'),
  intervalFullBtn: $('intervalFullBtn'),
  splitBtn: $('splitBtn'), globalError: $('globalError'),
  progressCard: $('progressCard'), progressBar: $('progressBar'), progressPercent: $('progressPercent'),
  progressFragment: $('progressFragment'), progressEta: $('progressEta'), progressPhase: $('progressPhase'),
  progressDetail: $('progressDetail'), cancelBtn: $('cancelBtn'),
  resultsCard: $('resultsCard'), resultsList: $('resultsList'), resultsMeta: $('resultsMeta'),
  zipBtn: $('zipBtn'), restartBtn: $('restartBtn'),
  installBtn: $('installBtn'),
  remainderModal: $('remainderModal'), remainderText: $('remainderText'),
  separateDesc: $('separateDesc'), mergeDesc: $('mergeDesc'),
  modeSeparate: $('modeSeparate'), modeMerge: $('modeMerge'),
};

let remainderModal = null;

/* ---------------- errores ---------------- */
function showError(message) {
  el.globalError.textContent = message;
  el.globalError.classList.remove('d-none');
}
function clearError() {
  el.globalError.classList.add('d-none');
  el.globalError.textContent = '';
}

/* ---------------- formatos ---------------- */
function populateFormats() {
  const supported = FORMATS.filter((f) => {
    if (!state.encoders) return true;
    return state.encoders.includes(f.encoder);
  });
  const current = supported.some((f) => f.id === state.format) ? state.format : (supported[0]?.id || 'mp3');
  state.format = current;
  el.formatSelect.innerHTML = supported
    .map((f) => `<option value="${f.id}"${f.id === current ? ' selected' : ''}>${f.label}</option>`)
    .join('');
  updateFormatOptions();
}

function currentFormat() {
  return FORMATS.find((f) => f.id === state.format) || FORMATS[0];
}

function updateFormatOptions() {
  const fmt = currentFormat();
  el.bitrateRow.classList.toggle('d-none', !fmt.lossy);
  if (fmt.id === 'ogg') {
    el.formatHint.textContent = 'OGG usa Vorbis con calidad variable (q5), calidad alta sin elegir bitrate.';
  } else if (fmt.id === 'wav') {
    el.formatHint.textContent = 'WAV sin pérdida (PCM 16 bits). Tamaño grande: 10 s ≈ 1,7 MB a 44,1 kHz estéreo.';
  } else if (fmt.id === 'flac') {
    el.formatHint.textContent = 'FLAC sin pérdida, comprimido. Cortes exactos y calidad idéntica al original.';
  } else if (fmt.id === 'm4a') {
    el.formatHint.textContent = 'M4A con AAC. Buena calidad con archivos pequeños.';
  } else if (fmt.id === 'aac') {
    el.formatHint.textContent = 'AAC en bruto (ADTS), sin contenedor MP4.';
  } else if (fmt.id === 'wma') {
    el.formatHint.textContent = 'WMA (Windows Media Audio). Compatible con reproductores antiguos de Windows.';
  } else {
    el.formatHint.textContent = 'MP3 con LAME. El formato más compatible.';
  }
}

/* ---------------- worker ---------------- */
async function ensureWorker() {
  if (state.worker && state.workerReady) return;
  if (!state.worker) {
    el.fileStatus.textContent = 'Cargando motor…';
    state.worker = new AudioWorkerClient();
  }
  el.fileStatus.textContent = 'Cargando motor (30 MB la primera vez)…';
  const info = await state.worker.init();
  state.encoders = info.encoders;
  window.__CUTDEBUG = info;
  state.workerReady = true;
  populateFormats();
  el.fileStatus.textContent = 'Listo';
  updateSplitButton();
}

/* ---------------- archivo ---------------- */
async function selectFile(file) {
  if (!file) return;
  clearError();
  if (!isAudioFile(file)) {
    showError('Ese archivo no parece de audio. Formatos: MP3, WAV, FLAC, M4A, AAC, OGG, WMA…');
    return;
  }
  if (file.size > 1024 * 1024 * 1024) {
    showError('El archivo supera 1 GB; Chrome puede quedarse sin memoria.');
    return;
  }

  state.file = file;
  state.desc = describeFile(file);
  state.duration = null;
  state.plan = null;
  state.cachedBytes = null;
  state.remainderChosen = false;
  state.results = [];

  el.fileInfo.classList.remove('d-none');
  el.fileName.textContent = file.name;
  el.fileFormat.textContent = state.desc.ext.toUpperCase();
  el.fileSize.textContent = formatBytes(file.size);
  el.fileRate.textContent = '—';
  el.fileDuration.textContent = '—';
  el.fileStatus.textContent = 'Leyendo metadatos…';
  updateSummary();
  updateSplitButton();

  const duration = await readDuration(file);
  state.duration = duration;

  // Muestra de frecuencia/códec con FFmpeg (también sirve si Chrome no conoce el formato).
  try {
    await ensureWorker();
    const bytes = await readArrayBuffer(file);
    if (file.size <= 120 * 1024 * 1024) state.cachedBytes = bytes;
    const info = await state.worker.probe(bytes.buffer, state.desc.ext);
    window.__CUTPROBE = info;
    if (!state.duration && info && info.duration) state.duration = info.duration;
    if (info && info.sampleRate) el.fileRate.textContent = `${info.sampleRate} Hz`;
    if (info && info.channels) el.fileRate.textContent += info.channels === 1 ? ' · mono' : ' · estéreo';
  } catch (error) {
    window.__CUTPROBE_ERR = String(error && error.message || error);
    if (!state.duration) {
      showError('No se pudo leer la duración de este archivo: ' + error.message);
    }
  }

  if (state.duration) {
    el.fileDuration.textContent = formatTime(state.duration, 2);
    el.fileStatus.textContent = 'Listo';
    if (state.intervalMode && !el.intervalEnd.value.trim()) {
      el.intervalEnd.value = formatTimestamp(state.duration);
    }
  } else {
    el.fileDuration.textContent = 'Desconocida';
    el.fileStatus.textContent = 'Formato no reconocido';
  }

  updateSummary();
  updateSplitButton();
}

function clearFile() {
  state.file = null;
  state.desc = null;
  state.duration = null;
  state.plan = null;
  state.cachedBytes = null;
  state.results = [];
  state.remainderChosen = false;
  el.fileInfo.classList.add('d-none');
  el.resultsCard.classList.add('d-none');
  el.progressCard.classList.add('d-none');
  updateSummary();
  updateSplitButton();
  clearError();
}

/* ---------------- v1.1.0: corte por intervalo ---------------- */
function setIntervalMode(on) {
  state.intervalMode = Boolean(on);
  el.intervalToggle.checked = state.intervalMode;
  el.intervalFields.classList.toggle('d-none', !state.intervalMode);
  el.intervalHint.classList.toggle('d-none', state.intervalMode);

  // Exclusividad: el panel de partes queda inactivo mientras el intervalo esté activo.
  el.partsCard.classList.toggle('cm-inactive', state.intervalMode);
  el.partsInactive.classList.toggle('d-none', !state.intervalMode);
  el.chunkInput.disabled = state.intervalMode;
  el.chips.querySelectorAll('button').forEach((b) => { b.disabled = state.intervalMode; });

  if (state.intervalMode) {
    if (!el.intervalStart.value.trim()) el.intervalStart.value = formatTimestamp(0);
    if (!el.intervalEnd.value.trim() && state.duration) el.intervalEnd.value = formatTimestamp(state.duration);
    el.intervalStart.focus();
    el.intervalStart.select();
  }

  el.splitBtn.innerHTML = state.intervalMode
    ? '<i class="bi bi-clock-history"></i> CORTAR INTERVALO'
    : '<i class="bi bi-scissors"></i> DIVIDIR CANCIÓN';

  state.remainderChosen = false;
  updateSummary();
  updateSplitButton();
}

function validateInterval() {
  if (!state.file) return { ok: false, error: 'Carga primero una canción.' };
  if (!state.duration) return { ok: false, error: 'No se conoce la duración de la canción.' };

  const start = parseTimestamp(el.intervalStart.value);
  if (!start.ok) return { ok: false, error: 'Tiempo de inicio: ' + start.error };

  const end = parseTimestamp(el.intervalEnd.value);
  if (!end.ok) return { ok: false, error: 'Tiempo de finalización: ' + end.error };

  if (start.value >= end.value) {
    return { ok: false, error: 'El tiempo final debe ser superior al tiempo inicial.' };
  }
  if (end.value > state.duration + 0.001) {
    return {
      ok: false,
      error: `El tiempo final no puede superar la duración de la canción (${formatTimestamp(state.duration)}).`,
    };
  }
  const dur = end.value - start.value;
  if (dur <= 0.0005) {
    return { ok: false, error: 'El intervalo debe tener una duración mayor que cero.' };
  }
  return { ok: true, start: start.value, end: end.value, dur };
}

function updateIntervalUI() {
  if (!state.intervalMode) {
    el.intervalError.classList.add('d-none');
    return;
  }
  const v = validateInterval();
  const startInvalid = !v.ok && /inicio/i.test(v.error || '');
  const endInvalid = !v.ok && /finalizaci/i.test(v.error || '');
  el.intervalStart.classList.toggle('is-invalid', startInvalid);
  el.intervalEnd.classList.toggle('is-invalid', endInvalid);
  el.intervalError.classList.toggle('d-none', v.ok);

  if (!v.ok) {
    el.intervalError.textContent = v.error;
    el.intervalInfo.textContent = 'Se generará un único archivo con el intervalo indicado.';
    state.interval = null;
    return;
  }
  state.interval = v;
  el.intervalInfo.textContent =
    `Se generará 1 archivo de ${formatTime(v.dur, 2)} (${formatTimestamp(v.start)} → ${formatTimestamp(v.end)}).`;
}

/* ---------------- resumen ---------------- */
function updateSummary() {
  if (state.intervalMode) {
    updateIntervalUI();
    el.chunkInput.classList.remove('is-invalid');
    el.chunkError.classList.add('d-none');
    el.sumFull.textContent = '—';
    el.sumLast.textContent = '—';
    el.sumTotal.textContent = '1';
    el.remainderInfo.classList.add('d-none');
    state.plan = state.interval
      ? { segments: [{ start: state.interval.start, dur: state.interval.dur }], total: 1, lastDuration: state.interval.dur, hasRemainder: false }
      : null;
    return;
  }

  const chunk = parseChunk(el.chunkInput.value);
  el.chunkInput.classList.toggle('is-invalid', !chunk.ok);
  el.chunkError.classList.toggle('d-none', chunk.ok);
  if (!chunk.ok) el.chunkError.textContent = chunk.error;

  if (!chunk.ok || !state.duration) {
    el.sumFull.textContent = '—';
    el.sumLast.textContent = '—';
    el.sumTotal.textContent = '—';
    el.remainderInfo.classList.add('d-none');
    state.plan = null;
    return;
  }

  state.chunk = chunk.value;
  const plan = computePlan(state.duration, state.chunk, state.remainderChosen ? state.mode : MODE.SEPARATE);
  state.plan = plan;

  if (plan.total === 1 && plan.hasRemainder === false) {
    el.sumFull.textContent = '0';
    el.sumLast.textContent = formatTime(plan.lastDuration, 2);
    el.sumTotal.textContent = '1';
    el.remainderInfo.classList.remove('d-none');
    el.remainderInfo.textContent = 'La canción es más corta que el fragmento: se exportará entera como un único archivo.';
    return;
  }

  const fullCount = plan.hasRemainder
    ? (state.remainderChosen && state.mode === MODE.MERGE ? plan.segments.length - 1 : plan.segments.length - 1)
    : plan.segments.length;

  el.sumFull.textContent = String(fullCount);
  el.sumLast.textContent = formatTime(plan.lastDuration, 2);
  el.sumTotal.textContent = String(plan.total);

  if (plan.hasRemainder && !(state.remainderChosen && state.mode === MODE.MERGE)) {
    el.remainderInfo.classList.remove('d-none');
    el.remainderInfo.textContent = `Sobran ${formatTime(plan.remainder, 2)}: el último fragmento durará ${formatTime(plan.lastDuration, 2)}.`;
  } else if (plan.hasRemainder && state.remainderChosen && state.mode === MODE.MERGE) {
    el.remainderInfo.classList.remove('d-none');
    el.remainderInfo.textContent = `Sobrante unido al último fragmento: durará ${formatTime(plan.lastDuration, 2)}.`;
  } else {
    el.remainderInfo.classList.add('d-none');
  }
}

function updateSplitButton() {
  let ready;
  if (state.intervalMode) {
    ready = Boolean(state.file && state.duration && state.workerReady && !state.busy && validateInterval().ok);
  } else {
    const chunk = parseChunk(el.chunkInput.value);
    ready = Boolean(state.file && state.duration && chunk.ok && state.workerReady && !state.busy);
  }
  el.splitBtn.disabled = !ready;
  if (!state.workerReady && state.file) {
    el.splitBtn.title = 'Cargando el motor de audio…';
  } else if (!state.file) {
    el.splitBtn.title = 'Elige primero una canción';
  } else if (state.intervalMode && !validateInterval().ok) {
    el.splitBtn.title = 'Revisa los tiempos del intervalo';
  } else {
    el.splitBtn.title = '';
  }
}

/* ---------------- modal sobrante ---------------- */
function askRemainder(plan) {
  return new Promise((resolve) => {
    const chunk = state.chunk;
    const rem = plan.remainder;
    el.remainderText.textContent =
      `Se ha detectado un fragmento final de ${formatTime(rem, 2)} que no alcanza la duración configurada de ${formatTime(chunk, 2)}. ¿Qué deseas hacer?`;

    const sep = computePlan(state.duration, chunk, MODE.SEPARATE);
    const mer = computePlan(state.duration, chunk, MODE.MERGE);
    el.separateDesc.textContent =
      `${sep.segments.length - 1} fragmentos de ${formatTime(chunk, 2)} + 1 de ${formatTime(rem, 2)} (${sep.total} archivos).`;
    el.mergeDesc.textContent =
      `${mer.segments.length - 1} fragmentos y el último de ${formatTime(mer.lastDuration, 2)} (${mer.total} archivos).`;

    const cleanup = () => {
      el.modeSeparate.removeEventListener('click', onSeparate);
      el.modeMerge.removeEventListener('click', onMerge);
    };
    const onSeparate = () => { cleanup(); finish(MODE.SEPARATE); };
    const onMerge = () => { cleanup(); finish(MODE.MERGE); };
    const finish = (mode) => {
      remainderModal.hide();
      resolve(mode);
    };

    el.modeSeparate.addEventListener('click', onSeparate);
    el.modeMerge.addEventListener('click', onMerge);
    el.remainderModal.addEventListener('hidden.bs.modal', () => {
      cleanup();
      resolve(null);
    }, { once: true });

    remainderModal.show();
  });
}

/* ---------------- procesamiento ---------------- */
async function startSplit() {
  clearError();
  if (!state.file) { showError('Elige una canción primero.'); return; }
  if (!state.duration) { showError('No se conoce la duración de la canción.'); return; }

  let interval = null;
  let chunk = null;
  if (state.intervalMode) {
    interval = validateInterval();
    updateIntervalUI();
    if (!interval.ok) { showError(interval.error); return; }
  } else {
    chunk = parseChunk(el.chunkInput.value);
    if (!chunk.ok) { showError(chunk.error); return; }
  }

  try {
    // FFmpeg.wasm acumula memoria entre ejecuciones: motor nuevo en cada corte.
    if (state.worker && state.workerUsed) {
      try { state.worker.terminate(); } catch (e) { /* noop */ }
      state.worker = null;
      state.workerReady = false;
      state.workerUsed = false;
    }
    await ensureWorker();
    state.workerUsed = true;
  } catch (error) {
    showError('No se pudo cargar FFmpeg: ' + error.message);
    return;
  }

  let plan;
  let safeNames;
  if (state.intervalMode) {
    state.interval = interval;
    plan = {
      segments: [{ start: interval.start, dur: interval.dur }],
      total: 1,
      full: 0,
      remainder: 0,
      lastDuration: interval.dur,
      hasRemainder: false,
      mode: 'interval',
    };
  } else {
    plan = computePlan(state.duration, chunk.value, MODE.SEPARATE);
    if (plan.hasRemainder) {
      const mode = await askRemainder(plan);
      if (!mode) return;
      state.mode = mode;
      state.remainderChosen = true;
      plan = computePlan(state.duration, chunk.value, mode);
    } else {
      state.mode = MODE.SEPARATE;
      state.remainderChosen = false;
    }
    state.chunk = chunk.value;
  }
  state.plan = plan;
  updateSummary();

  const fmt = currentFormat();
  const names = state.intervalMode
    ? [`${state.desc.base}_Intervalo.${fmt.id}`]
    : plan.segments.map((_, i) => `${state.desc.base}_Parte_${String(i + 1).padStart(Math.max(3, String(plan.total).length), '0')}.${fmt.id}`);
  safeNames = names.map((n) => sanitizeFilename(n));

  state.results = [];
  state.busy = true;
  state.cancelled = false;
  el.splitBtn.disabled = true;
  el.resultsCard.classList.add('d-none');
  el.progressCard.classList.remove('d-none');
  el.progressBar.style.width = '0%';
  el.progressPercent.textContent = '0%';
  el.progressFragment.textContent = `0 / ${plan.total}`;
  el.progressEta.textContent = '—';
  el.progressPhase.textContent = 'Preparando';
  el.progressDetail.textContent = 'Cargando el motor de audio y el archivo…';

  let bytes = state.cachedBytes;
  state.cachedBytes = null; // el buffer se transfiere al worker: no se reutiliza
  if (!bytes || bytes.byteLength === 0) {
    try { bytes = await readArrayBuffer(state.file); }
    catch (error) { showError('No se pudo leer el archivo: ' + error.message); resetBusy(); return; }
  }

  const startedAt = performance.now();

  const finishOk = () => {
    state.busy = false;
    el.progressPhase.textContent = 'Completado';
    el.progressDetail.textContent = 'PROCESAMIENTO COMPLETADO';
    el.progressBar.style.width = '100%';
    el.progressPercent.textContent = '100%';
    showResults();
    updateSplitButton();
    setTimeout(() => el.progressCard.classList.add('d-none'), 700);
  };

  // FFmpeg.wasm degrada la memoria tras ~50 codificaciones seguidas.
  // Se procesa por lotes con un motor nuevo cada lote (memoria limpia).
  const BATCH = 25;
  const total = plan.segments.length;
  const collected = new Array(total);
  let completed = 0;

  const resetWorker = async () => {
    if (state.worker) { try { state.worker.terminate(); } catch (e) { /* noop */ } }
    state.worker = null;
    state.workerReady = false;
    state.workerUsed = false;
    await ensureWorker();
    state.workerUsed = true;
  };

  try {
    for (let offset = 0; offset < total; offset += BATCH) {
      if (state.cancelled) break;

      if (offset > 0) {
        el.progressDetail.textContent = `Preparando motor para los fragmentos ${offset + 1}–${Math.min(offset + BATCH, total)}…`;
        await resetWorker();
      }

      const batch = plan.segments.slice(offset, offset + BATCH);
      const batchNames = safeNames.slice(offset, offset + BATCH);
      const buffer = bytes.slice().buffer; // copia: el original se conserva entre lotes

      const res = await state.worker.split({
        buffer,
        ext: state.desc.ext,
        format: fmt.id,
        options: { bitrate: state.bitrate, sampleRate: state.sampleRate },
        segments: batch.map((s) => ({ start: s.start, dur: s.dur })),
        names: batchNames,
      }, {
        onSegment: (msg) => {
          const idx = offset + msg.index;
          collected[idx] = { name: msg.name, blob: new Blob([msg.data], { type: fmt.mime }), dur: msg.dur };
        },
        onSegmentError: (msg) => {
          collected[offset + msg.index] = { name: batchNames[msg.index] || `parte_${offset + msg.index + 1}`, error: msg.message };
        },
        onProgress: (msg) => {
          completed = offset + msg.done;
          const pct = Math.round((completed / total) * 100);
          el.progressBar.style.width = pct + '%';
          el.progressPercent.textContent = pct + '%';
          el.progressFragment.textContent = `${completed} / ${total}`;
          el.progressPhase.textContent = 'Codificando';
          el.progressDetail.textContent = `Fragmento ${completed} de ${total}`;
          const elapsed = performance.now() - startedAt;
          if (completed > 0) {
            const per = elapsed / completed;
            const rest = per * (total - completed);
            el.progressEta.textContent = rest > 500 ? formatTimeShort(rest / 1000) : '—';
          }
        },
      });

      if (res && res.cancelled) break;
    }

    state.results = collected.filter(Boolean);

    if (state.cancelled) {
      state.results = [];
      state.busy = false;
      el.progressPhase.textContent = 'Cancelado';
      el.progressDetail.textContent = 'Operación cancelada. No se ha generado ningún archivo nuevo.';
      updateSplitButton();
      return;
    }

    const failed = state.results.filter((r) => r.error).length;
    finishOk();
    if (failed) {
      showError(`${failed} fragmento(s) no se pudieron codificar por falta de memoria. Prueba con fragmentos más largos o una canción más corta.`);
    }
  } catch (error) {
    showError('Error durante el procesamiento: ' + error.message);
    resetBusy();
  }
}

function resetBusy() {
  state.busy = false;
  el.progressCard.classList.add('d-none');
  updateSplitButton();
}

function showResults() {
  const ok = state.results.filter((r) => !r.error);
  el.resultsCard.classList.remove('d-none');
  el.resultsMeta.textContent = `${ok.length} archivo(s)`;
  el.resultsList.innerHTML = ok.map((r) => `
    <div class="cm-result-row">
      <i class="bi bi-file-earmark-music"></i>
      <span class="name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
      <span class="dur">${formatTime(r.dur || 0, 2)}</span>
      <button class="btn btn-sm cm-btn-outline" data-dl="${escapeHtml(r.name)}">
        <i class="bi bi-download"></i>
      </button>
    </div>`).join('');

  el.resultsList.querySelectorAll('[data-dl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = state.results.find((r) => r.name === btn.dataset.dl);
      if (item && item.blob) downloadBlob(item.blob, item.name);
    });
  });

  el.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- eventos ---------------- */
function bindEvents() {
  bindDropZone(el.dropZone, selectFile);
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = '';
    if (file) selectFile(file);
  });
  el.pickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.fileInput.click();
  });
  el.clearFileBtn.addEventListener('click', clearFile);

  el.chunkInput.addEventListener('input', () => {
    state.remainderChosen = false;
    updateSummary();
    updateSplitButton();
  });

  el.chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sec]');
    if (!btn) return;
    el.chunkInput.value = btn.dataset.sec;
    el.chips.querySelectorAll('.cm-chip').forEach((c) => c.classList.toggle('active', c === btn));
    state.remainderChosen = false;
    updateSummary();
    updateSplitButton();
  });

  el.formatSelect.addEventListener('change', () => {
    state.format = el.formatSelect.value;
    updateFormatOptions();
  });
  el.bitrateSelect.addEventListener('change', () => { state.bitrate = Number(el.bitrateSelect.value); });
  el.rateSelect.addEventListener('change', () => { state.sampleRate = Number(el.rateSelect.value); });

  // v1.1.0 — interruptor y tiempos del corte por intervalo
  el.intervalToggle.addEventListener('change', () => setIntervalMode(el.intervalToggle.checked));
  [el.intervalStart, el.intervalEnd].forEach((input) => {
    input.addEventListener('input', () => { updateIntervalUI(); updateSplitButton(); });
    input.addEventListener('blur', () => {
      const parsed = parseTimestamp(input.value);
      if (parsed.ok) input.value = formatTimestamp(parsed.value);
    });
  });
  el.intervalFullBtn.addEventListener('click', () => {
    el.intervalStart.value = formatTimestamp(0);
    el.intervalEnd.value = state.duration ? formatTimestamp(state.duration) : '';
    updateIntervalUI();
    updateSplitButton();
  });


  el.splitBtn.addEventListener('click', startSplit);
  el.cancelBtn.addEventListener('click', () => {
    state.cancelled = true;
    el.progressPhase.textContent = 'Cancelando';
    el.progressDetail.textContent = 'Se detendrá al terminar el fragmento actual…';
    if (state.worker) state.worker.cancel();
  });

  el.zipBtn.addEventListener('click', async () => {
    const ok = state.results.filter((r) => !r.error);
    if (!ok.length) return;
    try {
      el.zipBtn.disabled = true;
      const blob = await makeZip(ok.map((r) => ({ name: r.name, blob: r.blob })));
      downloadBlob(blob, `${state.desc.base}_${state.intervalMode ? 'intervalo' : 'partes'}.zip`);
    } catch (error) {
      showError('No se pudo crear el ZIP: ' + error.message);
    } finally {
      el.zipBtn.disabled = false;
    }
  });

  el.restartBtn.addEventListener('click', () => {
    state.results = [];
    el.resultsCard.classList.add('d-none');
    el.progressCard.classList.add('d-none');
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.busy) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ---------------- PWA ---------------- */
let installPrompt = null;
function bindPwa() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    el.installBtn.classList.remove('d-none');
  });
  el.installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch (e) { /* noop */ }
    installPrompt = null;
    el.installBtn.classList.add('d-none');
  });
  window.addEventListener('appinstalled', () => {
    el.installBtn.classList.add('d-none');
  });
}

/* ---------------- arranque ---------------- */
function boot() {
  remainderModal = new window.bootstrap.Modal(el.remainderModal, { backdrop: 'static', keyboard: false });
  bindEvents();
  bindPwa();
  populateFormats();
  updateSummary();
  updateSplitButton();
  const versionNode = document.querySelector('.cm-version');
  if (versionNode) versionNode.textContent = APP_VERSION;
  el.bitrateSelect.value = String(state.bitrate);
  el.rateSelect.value = String(state.sampleRate);
}

window.__CUTMUSIC__ = { state, selectFile, startSplit, clearFile };
boot();
