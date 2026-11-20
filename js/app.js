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
import { buildPeaks, WaveView } from './wave-editor.js';
import { t, setLang, applyStatic, getLang } from './i18n.js';

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
  wave: { key: null, peaks: null, duration: 0, loadingKey: null, scrub: null },
  zoomLevel: 0,
  view: { start: 0, span: 0 },
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
  waveBlock: $('waveBlock'), waveWrap: $('waveWrap'), waveCanvas: $('waveCanvas'),
  waveStatus: $('waveStatus'), waveStartLabel: $('waveStartLabel'),
  waveSelectionLabel: $('waveSelectionLabel'), waveEndLabel: $('waveEndLabel'),
  markerStart: $('markerStart'), markerEnd: $('markerEnd'), playhead: $('playhead'),
  playBar: $('playBar'), playBtn: $('playBtn'), pauseBtn: $('pauseBtn'), stopBtn: $('stopBtn'),
  playTime: $('playTime'), playSpan: $('playSpan'),
  langBar: $('langBar'), zoomBar: $('zoomBar'),
  splitBtnLabel: $('splitBtnLabel'),
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
    el.formatHint.textContent = t('formatHint.ogg');
  } else if (fmt.id === 'wav') {
    el.formatHint.textContent = t('formatHint.wav');
  } else if (fmt.id === 'flac') {
    el.formatHint.textContent = t('formatHint.flac');
  } else if (fmt.id === 'm4a') {
    el.formatHint.textContent = t('formatHint.m4a');
  } else if (fmt.id === 'aac') {
    el.formatHint.textContent = t('formatHint.aac');
  } else if (fmt.id === 'wma') {
    el.formatHint.textContent = t('formatHint.wma');
  } else {
    el.formatHint.textContent = t('formatHint.mp3');
  }
}

/* ---------------- worker ---------------- */
async function ensureWorker() {
  if (state.worker && state.workerReady) return;
  if (!state.worker) {
    el.fileStatus.textContent = t('status.engineLoading');
    state.worker = new AudioWorkerClient();
  }
  el.fileStatus.textContent = t('status.engineFirst');
  const info = await state.worker.init();
  state.encoders = info.encoders;
  window.__CUTDEBUG = info;
  state.workerReady = true;
  populateFormats();
  el.fileStatus.textContent = t('status.ready');
  updateSplitButton();
}

/* ---------------- archivo ---------------- */
async function selectFile(file) {
  if (!file) return;
  clearError();
  if (!isAudioFile(file)) {
    showError(t('err.notAudio'));
    return;
  }
  if (file.size > 1024 * 1024 * 1024) {
    showError(t('err.tooBig'));
    return;
  }

  state.file = file;
  state.desc = describeFile(file);
  state.duration = null;
  state.plan = null;
  state.cachedBytes = null;
  state.remainderChosen = false;
  state.results = [];

  // Reinicia el editor visual y la previsualización para el nuevo archivo.
  previewPlaying = false;
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
  if (previewAudio) {
    try { previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.load(); } catch (e) { /* noop */ }
  }
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  state.wave = { key: null, peaks: null, duration: 0, loadingKey: null, scrub: null };
  scrubBuffer = null;
  state.zoomLevel = 0;
  if (waveView) waveView.clear();
  showWaveUI(false);

  el.fileInfo.classList.remove('d-none');
  el.fileName.textContent = file.name;
  el.fileFormat.textContent = state.desc.ext.toUpperCase();
  el.fileSize.textContent = formatBytes(file.size);
  el.fileRate.textContent = '—';
  el.fileDuration.textContent = '—';
  el.fileStatus.textContent = t('status.reading');
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
      showError(t('err.durationRead', { msg: error.message }));
    }
  }

  if (state.duration) {
    el.fileDuration.textContent = formatTime(state.duration, 2);
    el.fileStatus.textContent = t('status.ready');
    if (state.intervalMode && !el.intervalEnd.value.trim()) {
      el.intervalEnd.value = formatTimestamp(state.duration);
    }
  } else {
    el.fileDuration.textContent = t('status.unknownDuration');
    el.fileStatus.textContent = t('status.unknownFormat');
  }

  updateSummary();
  updateSplitButton();
  if (state.intervalMode) { applyView(); ensureWaveform(); } else { scrubState.active = false; stopScrubSource(0.01); }
}

function clearFile() {
  stopPreview();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  if (previewAudio) {
    try { previewAudio.removeAttribute('src'); previewAudio.load(); } catch (e) { /* noop */ }
  }
  state.wave = { key: null, peaks: null, duration: 0, loadingKey: null, scrub: null };
  scrubBuffer = null;
  state.zoomLevel = 0;
  if (waveView) waveView.clear();
  showWaveUI(false);
  el.playhead.classList.remove('visible');
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
  } else {
    stopPreview();
    showWaveUI(false);
    el.playhead.classList.remove('visible');
  }

  const splitIcon = el.splitBtn.querySelector('i');
  if (splitIcon) splitIcon.className = state.intervalMode ? 'bi bi-clock-history' : 'bi bi-scissors';
  if (el.splitBtnLabel) el.splitBtnLabel.textContent = t(state.intervalMode ? 'btn.cut' : 'btn.split');

  state.remainderChosen = false;
  updateSummary();
  updateSplitButton();

  if (state.intervalMode) { applyView(); ensureWaveform(); } else { scrubState.active = false; stopScrubSource(0.01); }
}

function validateInterval() {
  if (!state.file) return { ok: false, key: 'val.needFile', vars: {}, field: 'start' };
  if (!state.duration) return { ok: false, key: 'val.noDuration', vars: {}, field: 'start' };

  const start = parseTimestamp(el.intervalStart.value);
  if (!start.ok) {
    return { ok: false, key: 'val.prefixStart', vars: { msg: t(start.error) }, field: 'start' };
  }

  const end = parseTimestamp(el.intervalEnd.value);
  if (!end.ok) {
    return { ok: false, key: 'val.prefixEnd', vars: { msg: t(end.error) }, field: 'end' };
  }

  if (start.value >= end.value) {
    return { ok: false, key: 'val.startBeforeEnd', vars: {}, field: 'end' };
  }
  if (end.value > state.duration + 0.001) {
    return {
      ok: false,
      key: 'val.endBeyond',
      vars: { dur: formatTimestamp(state.duration) },
      field: 'end',
    };
  }
  const dur = end.value - start.value;
  if (dur <= 0.0005) {
    return { ok: false, key: 'val.zero', vars: {}, field: 'end' };
  }
  return { ok: true, start: start.value, end: end.value, dur, key: null, vars: {}, field: null };
}

function intervalErrorText(v) {
  return v && v.key ? t(v.key, v.vars) : '';
}

function updateIntervalUI() {
  if (!state.intervalMode) {
    el.intervalError.classList.add('d-none');
    updatePlayButtons();
    return;
  }
  const v = validateInterval();
  const startInvalid = !v.ok && v.field === 'start';
  const endInvalid = !v.ok && v.field === 'end';
  el.intervalStart.classList.toggle('is-invalid', startInvalid);
  el.intervalEnd.classList.toggle('is-invalid', endInvalid);
  el.intervalError.classList.toggle('d-none', v.ok);

  if (!v.ok) {
    el.intervalError.textContent = intervalErrorText(v);
    el.intervalInfo.textContent = t('interval.info.invalid');
    state.interval = null;
    updatePlayButtons();
    return;
  }
  state.interval = v;
  el.intervalInfo.textContent = t('interval.info.valid', {
    dur: formatTime(v.dur, 2),
    start: formatTimestamp(v.start),
    end: formatTimestamp(v.end),
  });
  positionMarkers(v);
  updateWaveLabels(v);
  updatePlayButtons();
}

/* ---------------- v1.1.0: forma de onda y reproducción ---------------- */
const MIN_SELECTION = 0.01;
let waveView = null;
let previewAudio = null;
let previewUrl = null;
let previewPlaying = false;
let previewRaf = 0;

/* ---------------- zoom de la onda (7 niveles) ---------------- */
function zoomSpan(level) {
  const dur = state.duration || 1;
  return dur * Math.pow(2, -level);
}

function computeView() {
  const dur = state.duration || 1;
  const span = Math.min(Math.max(zoomSpan(state.zoomLevel), 0.02), dur * 8);
  let start;
  if (span >= dur) {
    start = (dur - span) / 2;
  } else {
    const mid = state.interval ? (state.interval.start + state.interval.end) / 2 : dur / 2;
    start = Math.max(0, Math.min(dur - span, mid - span / 2));
  }
  state.view = { start, span };
  return state.view;
}

function timeToPct(time) {
  const span = state.view.span || (state.duration || 1);
  return ((time - state.view.start) / span) * 100;
}

function placeMarker(node, percent) {
  node.style.left = `${percent}%`;
  node.style.visibility = percent < -0.01 || percent > 100.01 ? 'hidden' : '';
}

function xToTime(clientX) {
  const rect = el.waveWrap.getBoundingClientRect();
  if (!rect.width) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return state.view.start + ratio * state.view.span;
}

function setZoomButtons() {
  if (!el.zoomBar) return;
  el.zoomBar.querySelectorAll('[data-zoom]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.zoom) === state.zoomLevel);
  });
}

function applyView() {
  if (!waveView || !state.duration) return;
  const view = computeView();
  waveView.setView(view.start, view.span);
  if (state.interval) positionMarkers(state.interval);
  if (previewAudio) setHead(previewAudio.currentTime);
  setZoomButtons();
  if (el.waveWrap) el.waveWrap.classList.toggle('cm-zoomed', state.zoomLevel !== 0);
}

function setZoom(level) {
  state.zoomLevel = Math.max(-3, Math.min(3, Number(level) || 0));
  applyView();
}

function ensureVisible(time) {
  if (!state.duration || !state.view.span) return;
  const span = state.view.span;
  if (span >= state.duration) return;
  const margin = span * 0.08;
  if (time < state.view.start + margin) {
    state.view.start = Math.max(0, time - span * 0.15);
  } else if (time > state.view.start + span - margin) {
    state.view.start = Math.min(state.duration - span, time - span * 0.85);
  }
  if (waveView) waveView.setView(state.view.start, span);
  if (state.interval) positionMarkers(state.interval);
  if (previewAudio) setHead(previewAudio.currentTime);
}

function positionMarkers(v) {
  if (!state.duration) return;
  placeMarker(el.markerStart, timeToPct(v.start));
  placeMarker(el.markerEnd, timeToPct(v.end));
  if (waveView) waveView.setSelection(v.start, v.end);
  if (!previewPlaying) setHead(v.start);
}

function updateWaveLabels(v) {
  el.waveStartLabel.textContent = formatTimestamp(v.start);
  el.waveEndLabel.textContent = formatTimestamp(v.end);
  el.waveSelectionLabel.textContent = formatTime(v.dur, 2);
  el.playSpan.textContent = formatTimestamp(v.dur);
}

function setHead(seconds) {
  const pct = timeToPct(seconds);
  el.playhead.classList.add('visible');
  el.playhead.style.left = `${pct}%`;
  el.playhead.style.visibility = pct < -0.01 || pct > 100.01 ? 'hidden' : '';
  el.playTime.textContent = formatTimestamp(seconds);
  if (waveView) waveView.setHead(seconds);
}

function updatePlayButtons() {
  const valid = Boolean(state.intervalMode && state.file && state.interval);
  if (el.playBtn) el.playBtn.disabled = !valid || previewPlaying;
  if (el.pauseBtn) el.pauseBtn.disabled = !valid || !previewPlaying;
  if (el.stopBtn) el.stopBtn.disabled = !valid;
}

function ensurePreviewAudio() {
  if (previewAudio) return previewAudio;
  previewAudio = new Audio();
  previewAudio.preload = 'auto';
  return previewAudio;
}

function setPreviewSource() {
  if (!state.file) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(state.file);
  ensurePreviewAudio().src = previewUrl;
}

function pausePreview() {
  if (!previewAudio || !previewPlaying) return;
  previewAudio.pause();
  previewPlaying = false;
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
  setHead(previewAudio.currentTime);
  updatePlayButtons();
}

function stopPreview() {
  previewPlaying = false;
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
  if (previewAudio) {
    previewAudio.pause();
    const v = validateInterval();
    const start = v.ok ? v.start : 0;
    try { previewAudio.currentTime = start; } catch (e) { /* noop */ }
    setHead(start);
  }
  updatePlayButtons();
}

async function playInterval() {
  const v = validateInterval();
  if (!v.ok) return;
  if (!previewUrl) setPreviewSource();
  const audio = ensurePreviewAudio();

  if (!previewPlaying && (audio.currentTime < v.start - 0.02 || audio.currentTime >= v.end - 0.02)) {
    audio.currentTime = v.start;
  }
  try {
    await audio.play();
  } catch (error) {
    showError(t('err.playback', { msg: error.message }));
    return;
  }
  previewPlaying = true;
  updatePlayButtons();
  tickPreview();
}

function tickPreview() {
  if (!previewPlaying) return;
  const v = validateInterval();
  if (!v.ok) { stopPreview(); return; }

  const audio = previewAudio;
  const t = audio.currentTime;
  if (t >= v.end - 0.02) {
    audio.pause();
    try { audio.currentTime = v.end; } catch (e) { /* noop */ }
    previewPlaying = false;
    setHead(v.end);
    updatePlayButtons();
    return;
  }
  setHead(t);
  previewRaf = requestAnimationFrame(tickPreview);
}

/* ---------------- Live scrubbing al mover los marcadores ---------------- */
let scratchCtx = null;
let scrubBuffer = null;
let scrubFallbackPlaying = false;
const scrubState = { active: false, which: null, source: null, gain: null, lastAt: 0 };

async function ensureScratchCtx() {
  if (!scratchCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    scratchCtx = new Ctx();
  }
  if (scratchCtx.state === 'suspended') {
    try { await scratchCtx.resume(); } catch (e) { /* noop */ }
  }
  return scratchCtx;
}

function ensureScrubBuffer() {
  if (scrubBuffer) return scrubBuffer;
  const source = state.wave && state.wave.scrub;
  if (!source || !source.data || !scratchCtx) return null;
  const buffer = scratchCtx.createBuffer(1, source.data.length, source.sampleRate);
  buffer.copyToChannel(source.data, 0);
  scrubBuffer = buffer;
  // Se libera la copia Float32Array: el AudioBuffer ya contiene el PCM.
  state.wave.scrub = { duration: source.duration };
  return scrubBuffer;
}

function stopScrubSource(fade = 0.02) {
  if (!scrubState.source || !scratchCtx) return;
  const { source, gain } = scrubState;
  try {
    const now = scratchCtx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value || 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    source.stop(now + fade + 0.01);
  } catch (e) { /* noop */ }
  scrubState.source = null;
  scrubState.gain = null;
}

function playScrubAt(time) {
  if (!scrubState.active) return;
  const now = performance.now();
  if (now - scrubState.lastAt < 70) return;
  scrubState.lastAt = now;
  if (state.wave.scrub && !scratchCtx) return;

  if (scratchCtx && state.wave.scrub) {
    const buffer = ensureScrubBuffer();
    if (buffer) {
      stopScrubSource(0.012);
      const source = scratchCtx.createBufferSource();
      source.buffer = buffer;
      const gain = scratchCtx.createGain();
      const at = scratchCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(1, at + 0.008);
      source.connect(gain).connect(scratchCtx.destination);
      const offset = Math.min(Math.max(0, time), Math.max(0, buffer.duration - 0.03));
      source.start(at, offset);
      source.stop(at + 0.45);
      scrubState.source = source;
      scrubState.gain = gain;
      return;
    }
  }

  // Respaldo sin búfer (canciones largas): búsqueda en el elemento <audio>.
  if (!previewUrl) setPreviewSource();
  const audio = ensurePreviewAudio();
  try {
    audio.currentTime = Math.max(0, time);
    if (!scrubFallbackPlaying) {
      scrubFallbackPlaying = true;
      audio.play().catch(() => {});
    }
  } catch (e) { /* noop */ }
}

async function startScrub(which) {
  if (!state.intervalMode || !state.file) return;
  if (previewPlaying) pausePreview();
  scrubState.active = true;
  scrubState.which = which;
  scrubState.lastAt = 0;
  await ensureScratchCtx();
}

function endScrub() {
  if (!scrubState.active) return;
  scrubState.active = false;
  stopScrubSource(0.03);
  if (scrubFallbackPlaying) {
    scrubFallbackPlaying = false;
    if (previewAudio) { try { previewAudio.pause(); } catch (e) { /* noop */ } }
  }
  const v = validateInterval();
  if (v.ok && previewAudio) {
    try {
      previewAudio.currentTime = scrubState.which === 'start' ? v.start : v.end;
      setHead(scrubState.which === 'start' ? v.start : v.end);
    } catch (e) { /* noop */ }
  }
  scrubState.which = null;
}

function applyMarkerDrag(which, seconds) {
  if (!state.intervalMode || !state.duration) return;
  const v = validateInterval();
  const curStart = v.ok ? v.start : 0;
  const curEnd = v.ok ? v.end : state.duration;

  let target;
  if (which === 'start') {
    target = Math.min(Math.max(0, seconds), curEnd - MIN_SELECTION);
    el.intervalStart.value = formatTimestamp(target);
  } else {
    target = Math.max(Math.min(state.duration, seconds), curStart + MIN_SELECTION);
    el.intervalEnd.value = formatTimestamp(target);
  }
  updateIntervalUI();
  updateSplitButton();
  ensureVisible(target);

  if (previewAudio) {
    try { previewAudio.currentTime = target; } catch (e) { /* noop */ }
  }
  setHead(target);
  playScrubAt(target);
}

function bindMarkerDrag(marker, which) {
  marker.addEventListener('pointerdown', (event) => {
    if (!state.intervalMode || !state.duration) return;
    event.preventDefault();
    try { marker.setPointerCapture(event.pointerId); } catch (e) { /* puntero sintetico */ }
    marker.classList.add('dragging');
    startScrub(which);

    let moved = false;
    const move = (e) => {
      moved = true;
      applyMarkerDrag(which, xToTime(e.clientX));
    };
    const up = () => {
      marker.classList.remove('dragging');
      marker.removeEventListener('pointermove', move);
      marker.removeEventListener('pointerup', up);
      marker.removeEventListener('pointercancel', up);
      endScrub();
    };
    marker.addEventListener('pointermove', move);
    marker.addEventListener('pointerup', up);
    marker.addEventListener('pointercancel', up);
    applyMarkerDrag(which, xToTime(event.clientX));
  });
}

function showWaveUI(show) {
  el.waveBlock.classList.toggle('d-none', !show);
  el.playBar.classList.toggle('d-none', !show);
}

async function ensureWaveform() {
  if (!state.file || !state.duration || !state.intervalMode) return;
  const key = `${state.file.name}:${state.file.size}:${state.file.lastModified}`;

  if (state.wave.key === key && state.wave.peaks) {
    waveView.setData(state.wave.peaks, state.wave.duration);
    showWaveUI(true);
    el.waveStatus.textContent = t('wave.ready');
    applyView();
    return;
  }
  if (state.wave.loadingKey === key) return;

  if (state.duration > 900 || state.file.size > 200 * 1024 * 1024) {
    el.waveStatus.textContent = t('wave.tooLong');
    showWaveUI(true);
    return;
  }

  state.wave.loadingKey = key;
  el.waveStatus.textContent = t('wave.loading');
  showWaveUI(true);

  try {
    const { peaks, duration, scrub } = await buildPeaks(state.file, 1400);
    if (!state.file || `${state.file.name}:${state.file.size}:${state.file.lastModified}` !== key) return;
    scrubBuffer = null;
    state.wave = { key, peaks, duration, loadingKey: null, scrub: scrub || null };
    waveView.setData(peaks, duration);
    el.waveStatus.textContent = t('wave.ready');
    applyView();
  } catch (error) {
    state.wave.loadingKey = null;
    el.waveStatus.textContent = t('wave.unavailable');
    el.intervalError.classList.remove('d-none');
    el.intervalError.textContent = t('wave.error', { msg: error.message });
  }
}

function handleIntervalFieldInput() {
  if (previewPlaying) stopPreview();
  updateIntervalUI();
  updateSplitButton();
  if (state.interval && previewAudio) {
    try { previewAudio.currentTime = state.interval.start; } catch (e) { /* noop */ }
    setHead(state.interval.start);
  }
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
  if (!chunk.ok) el.chunkError.textContent = t(chunk.error);

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
    el.remainderInfo.textContent = t('note.shortSong');
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
    el.remainderInfo.textContent = t('note.remainder', { t: formatTime(plan.remainder, 2), last: formatTime(plan.lastDuration, 2) });
  } else if (plan.hasRemainder && state.remainderChosen && state.mode === MODE.MERGE) {
    el.remainderInfo.classList.remove('d-none');
    el.remainderInfo.textContent = t('note.merged', { t: formatTime(plan.lastDuration, 2) });
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
    el.splitBtn.title = t('status.engineLoading');
  } else if (!state.file) {
    el.splitBtn.title = t('err.pickFile');
  } else if (state.intervalMode && !validateInterval().ok) {
    el.splitBtn.title = t('val.titleInterval');
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
      t('modal.body', { rem: formatTime(rem, 2), chunk: formatTime(chunk, 2) });

    const sep = computePlan(state.duration, chunk, MODE.SEPARATE);
    const mer = computePlan(state.duration, chunk, MODE.MERGE);
    el.separateDesc.textContent =
      t('modal.separateDesc', { n: sep.segments.length - 1, chunk: formatTime(chunk, 2), rem: formatTime(rem, 2), total: sep.total });
    el.mergeDesc.textContent =
      t('modal.mergeDesc', { n: mer.segments.length - 1, last: formatTime(mer.lastDuration, 2), total: mer.total });

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
  if (!state.file) { showError(t('err.pickFile')); return; }
  if (!state.duration) { showError(t('err.noDuration')); return; }

  let interval = null;
  let chunk = null;
  if (state.intervalMode) {
    interval = validateInterval();
    updateIntervalUI();
    if (!interval.ok) { showError(intervalErrorText(interval)); return; }
  } else {
    chunk = parseChunk(el.chunkInput.value);
    if (!chunk.ok) { showError(t(chunk.error)); return; }
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
    showError(t('err.engine', { msg: error.message }));
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
  el.progressPhase.textContent = t('progress.phase.preparing');
  el.progressDetail.textContent = t('progress.preparing');

  let bytes = state.cachedBytes;
  state.cachedBytes = null; // el buffer se transfiere al worker: no se reutiliza
  if (!bytes || bytes.byteLength === 0) {
    try { bytes = await readArrayBuffer(state.file); }
    catch (error) { showError(t('err.fileRead', { msg: error.message })); resetBusy(); return; }
  }

  const startedAt = performance.now();

  const finishOk = () => {
    state.busy = false;
    el.progressPhase.textContent = t('progress.phase.completed');
    el.progressDetail.textContent = t('progress.completed');
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
        el.progressDetail.textContent = t('progress.engineBatch', { from: offset + 1, to: Math.min(offset + BATCH, total) });
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
          el.progressPhase.textContent = t('progress.phase.encoding');
          el.progressDetail.textContent = t('progress.fragmentOf', { done: completed, total });
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
      el.progressPhase.textContent = t('progress.phase.cancelled');
      el.progressDetail.textContent = t('progress.cancelled');
      updateSplitButton();
      return;
    }

    const failed = state.results.filter((r) => r.error).length;
    finishOk();
    if (failed) {
      showError(t('err.failedFragments', { n: failed }));
    }
  } catch (error) {
    showError(t('err.processing', { msg: error.message }));
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
  el.resultsMeta.textContent = t('results.files', { n: ok.length });
  el.resultsList.innerHTML = ok.map((r) => `
    <div class="cm-result-row">
      <i class="bi bi-file-earmark-music"></i>
      <span class="name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
      <span class="dur">${formatTime(r.dur || 0, 2)}</span>
      <button class="btn btn-sm cm-btn-outline" data-dl="${escapeHtml(r.name)}" title="${escapeHtml(t('btn.downloadFile'))}">
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
    input.addEventListener('input', handleIntervalFieldInput);
    input.addEventListener('blur', () => {
      const parsed = parseTimestamp(input.value);
      if (parsed.ok) input.value = formatTimestamp(parsed.value);
    });
  });
  el.intervalFullBtn.addEventListener('click', () => {
    el.intervalStart.value = formatTimestamp(0);
    el.intervalEnd.value = state.duration ? formatTimestamp(state.duration) : '';
    handleIntervalFieldInput();
  });

  // Arrastrar la onda (fuera de los marcadores) desplaza la vista con zoom.
  el.waveCanvas.addEventListener('pointerdown', (event) => {
    if (!state.intervalMode || !state.duration) return;
    if (state.view.span >= state.duration) return;
    event.preventDefault();
    const startX = event.clientX;
    const startView = state.view.start;
    const width = el.waveWrap.getBoundingClientRect().width || 1;
    el.waveCanvas.style.cursor = 'grabbing';
    const move = (e) => {
      const delta = ((e.clientX - startX) / width) * state.view.span;
      const maxStart = Math.max(0, state.duration - state.view.span);
      state.view.start = Math.min(maxStart, Math.max(0, startView - delta));
      if (waveView) waveView.setView(state.view.start, state.view.span);
      if (state.interval) positionMarkers(state.interval);
      if (previewAudio) setHead(previewAudio.currentTime);
    };
    const up = () => {
      el.waveCanvas.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  el.playBtn.addEventListener('click', playInterval);
  el.pauseBtn.addEventListener('click', pausePreview);
  el.stopBtn.addEventListener('click', stopPreview);
  bindMarkerDrag(el.markerStart, 'start');
  bindMarkerDrag(el.markerEnd, 'end');

  if (el.langBar) {
    el.langBar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-lang]');
      if (!btn) return;
      setLang(btn.dataset.lang);
      refreshLanguageUI();
    });
  }
  if (el.zoomBar) {
    el.zoomBar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-zoom]');
      if (!btn) return;
      setZoom(Number(btn.dataset.zoom));
    });
  }


  el.splitBtn.addEventListener('click', startSplit);
  el.cancelBtn.addEventListener('click', () => {
    state.cancelled = true;
    el.progressPhase.textContent = t('progress.canceling');
    el.progressDetail.textContent = t('progress.cancelingDetail');
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
      showError(t('err.zip', { msg: error.message }));
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

function refreshLanguageUI() {
  applyStatic();
  if (el.langBar) {
    el.langBar.querySelectorAll('[data-lang]').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === getLang());
    });
  }
  if (el.splitBtnLabel) el.splitBtnLabel.textContent = t(state.intervalMode ? 'btn.cut' : 'btn.split');
  updateFormatOptions();
  updateSummary();
  updateSplitButton();
  if (state.file && state.duration) el.fileStatus.textContent = t('status.ready');
  if (state.intervalMode) {
    if (state.wave.peaks) el.waveStatus.textContent = t('wave.ready');
    else if (state.wave.loadingKey) el.waveStatus.textContent = t('wave.loading');
  }
  if (!el.resultsCard.classList.contains('d-none')) {
    el.resultsMeta.textContent = t('results.files', { n: state.results.filter((r) => !r.error).length });
  }
  updatePlayButtons();
}

function boot() {
  setLang('es');
  applyStatic();
  remainderModal = new window.bootstrap.Modal(el.remainderModal, { backdrop: 'static', keyboard: false });
  waveView = new WaveView(el.waveWrap, el.waveCanvas);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { if (waveView) waveView.resize(); }).observe(el.waveWrap);
  }
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

window.__CUTMUSIC__ = { state, selectFile, startSplit, clearFile, previewState: () => ({ playing: previewPlaying, current: previewAudio ? previewAudio.currentTime : null, start: state.interval ? state.interval.start : null, end: state.interval ? state.interval.end : null }), waveInfo: () => ({ zoom: state.zoomLevel, view: { ...state.view }, peaks: state.wave.peaks ? state.wave.peaks.length : 0, scrubSeconds: state.wave.scrub ? (state.wave.scrub.data ? state.wave.scrub.data.length : 0) : 0 }), scrubInfo: () => ({ active: scrubState.active, ctx: scratchCtx ? scratchCtx.state : 'none', buffer: scrubBuffer ? scrubBuffer.duration : 0 }) };
boot();
