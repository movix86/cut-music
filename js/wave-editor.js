/* ============================================================
   CUT MUSIC 1.1.0 — forma de onda, zoom y lienzo del editor
   Solo dibujo: no toca FFmpeg ni la exportación.
   ============================================================ */

const COLORS = {
  bg: '#0b0f17',
  outside: '#2a3345',
  selected: '#ff7a1a',
  selectedSoft: 'rgba(255, 122, 26, 0.13)',
  start: '#4da3ff',
  end: '#ff7a1a',
  head: '#ffe9a8',
  text: '#8e9ab0',
};

const MAX_SCRUB_SECONDS = 600;

/** Decodifica el audio una vez: picos normalizados + buffer mono para el scrubbing. */
export async function buildPeaks(file, buckets = 1400) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio API not available.');
  const ctx = new Ctx();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const channels = [];
    const maxCh = Math.min(2, buffer.numberOfChannels);
    for (let c = 0; c < maxCh; c++) channels.push(buffer.getChannelData(c));

    const total = buffer.length;
    const mono = new Float32Array(total);
    const other = channels[1];
    const main = channels[0];
    for (let i = 0; i < total; i++) {
      mono[i] = other ? (main[i] + other[i]) * 0.5 : main[i];
    }

    const peaks = new Float32Array(buckets);
    const span = total / buckets;
    let globalMax = 0;

    for (let b = 0; b < buckets; b++) {
      const from = Math.floor(b * span);
      const to = Math.min(total, Math.floor((b + 1) * span));
      const stride = Math.max(1, Math.floor((to - from) / 160));
      let max = 0;
      for (let i = from; i < to; i += stride) {
        const v = Math.abs(mono[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
      if (max > globalMax) globalMax = max;
    }

    if (globalMax > 0) {
      for (let i = 0; i < buckets; i++) peaks[i] = peaks[i] / globalMax;
    }

    const duration = buffer.duration;
    const scrub = duration <= MAX_SCRUB_SECONDS
      ? { data: mono, sampleRate: buffer.sampleRate, duration }
      : null;

    return { peaks, duration, scrub };
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
    // Ventana visible (segundos) para el zoom.
    this.viewStart = 0;
    this.viewSpan = 0;
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

  setView(viewStart, viewSpan) {
    this.viewStart = viewStart;
    this.viewSpan = viewSpan > 0 ? viewSpan : (this.duration || 1);
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
      ctx.fillText('—', w / 2, h / 2);
      return;
    }

    const span = this.viewSpan > 0 ? this.viewSpan : this.duration;
    const from = this.viewStart;
    const to = from + span;
    const mid = h / 2;
    const amp = h * 0.42;
    const peaks = this.peaks;
    const n = peaks.length;

    const timeToX = (time) => ((time - from) / span) * w;
    const startX = timeToX(this.start);
    const endX = timeToX(this.end);

    if (endX > startX) {
      ctx.fillStyle = COLORS.selectedSoft;
      ctx.fillRect(Math.max(0, startX), 0, Math.min(w, endX) - Math.max(0, startX), h);
    }

    for (let x = 0; x < w; x++) {
      const time = from + (x / w) * span;
      if (time < 0 || time > this.duration) continue;
      const peak = peaks[Math.min(n - 1, Math.max(0, Math.floor((time / this.duration) * n)))] || 0;
      const half = Math.max(0.6, peak * amp);
      const inSel = time >= this.start && time <= this.end;
      ctx.fillStyle = inSel ? COLORS.selected : COLORS.outside;
      ctx.fillRect(x, mid - half, 1, half * 2);
    }

    // Marcadores: START azul, END naranja.
    if (startX >= 0 && startX <= w) {
      ctx.fillStyle = COLORS.start;
      ctx.fillRect(Math.round(startX), 0, 2, h);
    }
    if (endX >= 0 && endX <= w) {
      ctx.fillStyle = COLORS.end;
      ctx.fillRect(Math.max(0, Math.round(endX) - 2), 0, 2, h);
    }

    // Cursor de reproducción.
    if (this.head >= 0) {
      const hx = timeToX(this.head);
      if (hx >= 0 && hx <= w) {
        ctx.fillStyle = COLORS.head;
        ctx.fillRect(Math.round(hx), 0, 1.5, h);
        ctx.beginPath();
        ctx.arc(hx, 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
