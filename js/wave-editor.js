/* ============================================================
   CUT MUSIC 1.1.0 — forma de onda y lienzo del editor
   Solo dibujo: no toca FFmpeg ni la exportación.
   ============================================================ */

const COLORS = {
  bg: '#0b0f17',
  idle: '#3d4a63',
  idleDim: '#2a3345',
  selected: '#ff7a1a',
  selectedSoft: 'rgba(255, 122, 26, 0.12)',
  head: '#ffe9a8',
  text: '#8e9ab0',
};

/** Decodifica el audio una sola vez y devuelve picos normalizados. */
export async function buildPeaks(file, buckets = 1400) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio API no disponible en este navegador.');
  const ctx = new Ctx();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const channels = [];
    const maxCh = Math.min(2, buffer.numberOfChannels);
    for (let c = 0; c < maxCh; c++) channels.push(buffer.getChannelData(c));

    const total = buffer.length;
    const peaks = new Float32Array(buckets);
    const span = total / buckets;
    let globalMax = 0;

    for (let b = 0; b < buckets; b++) {
      const from = Math.floor(b * span);
      const to = Math.min(total, Math.floor((b + 1) * span));
      const stride = Math.max(1, Math.floor((to - from) / 160));
      let max = 0;
      for (let i = from; i < to; i += stride) {
        let v = Math.abs(channels[0][i]);
        if (channels[1]) v = Math.max(v, Math.abs(channels[1][i]));
        if (v > max) max = v;
      }
      peaks[b] = max;
      if (max > globalMax) globalMax = max;
    }

    if (globalMax > 0) {
      for (let i = 0; i < buckets; i++) peaks[i] = peaks[i] / globalMax;
    }
    return { peaks, duration: buffer.duration };
  } finally {
    try { await ctx.close(); } catch (e) { /* noop */ }
  }
}

export class WaveView {
  constructor(wrap, canvas) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.peaks = null;
    this.duration = 0;
    this.start = 0;
    this.end = 0;
    this.head = -1;
    this._raf = 0;
    this.resize();
  }

  setData(peaks, duration) {
    this.peaks = peaks;
    this.duration = duration || 0;
    this.draw();
  }

  clear() {
    this.peaks = null;
    this.duration = 0;
    this.head = -1;
    this.draw();
  }

  setSelection(start, end) {
    this.start = start;
    this.end = end;
    this.draw();
  }

  setHead(seconds) {
    this.head = seconds;
    this._scheduleDraw();
  }

  _scheduleDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw();
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, this.wrap.clientWidth);
    const h = Math.max(1, this.wrap.clientHeight);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.draw();
  }

  draw() {
    const { ctx, width: w, height: h } = this;
    if (!ctx || !w || !h) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (!this.peaks || !this.duration) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Forma de onda no disponible', w / 2, h / 2);
      return;
    }

    const mid = h / 2;
    const amp = h * 0.42;
    const peaks = this.peaks;
    const n = peaks.length;
    const startX = (this.start / this.duration) * w;
    const endX = (this.end / this.duration) * w;

    // Zona seleccionada (fondo)
    if (endX > startX) {
      ctx.fillStyle = COLORS.selectedSoft;
      ctx.fillRect(startX, 0, endX - startX, h);
    }

    // Barras
    for (let x = 0; x < w; x++) {
      const peak = peaks[Math.min(n - 1, Math.floor((x / w) * n))] || 0;
      const half = Math.max(0.6, peak * amp);
      const inSel = x >= startX && x <= endX;
      ctx.fillStyle = inSel ? COLORS.selected : (x < startX || x > endX ? COLORS.idleDim : COLORS.idle);
      ctx.fillRect(x, mid - half, 1, half * 2);
    }

    // Líneas de los marcadores
    ctx.fillStyle = COLORS.selected;
    ctx.fillRect(Math.round(startX), 0, 2, h);
    ctx.fillRect(Math.max(0, Math.round(endX) - 2), 0, 2, h);

    // Cursor de reproducción
    if (this.head >= 0) {
      const hx = Math.max(0, Math.min(w, (this.head / this.duration) * w));
      ctx.fillStyle = COLORS.head;
      ctx.fillRect(Math.round(hx), 0, 1.5, h);
      ctx.beginPath();
      ctx.arc(hx, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
