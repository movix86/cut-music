/* ============================================================
   CUT MUSIC 1.0 — worker de audio (FFmpeg.wasm)
   Todo el procesamiento ocurre aquí, fuera del hilo de la interfaz.
   ============================================================ */
import createFFmpegCore from '../vendor/ffmpeg/ffmpeg-core.js';

let core = null;
let outLogs = [];
let errLogs = [];
let cancelled = false;

const FORMATS = {
  mp3:  { ext: 'mp3',  encoder: 'libmp3lame', args: (o) => ['-c:a', 'libmp3lame', '-b:a', `${o.bitrate}k`] },
  wav:  { ext: 'wav',  encoder: 'pcm_s16le',  args: () => ['-c:a', 'pcm_s16le'] },
  flac: { ext: 'flac', encoder: 'flac',       args: () => ['-c:a', 'flac', '-compression_level', '5'] },
  m4a:  { ext: 'm4a',  encoder: 'aac',        args: (o) => ['-c:a', 'aac', '-b:a', `${o.bitrate}k`, '-movflags', '+faststart'] },
  aac:  { ext: 'aac',  encoder: 'aac',        args: (o) => ['-c:a', 'aac', '-b:a', `${o.bitrate}k`, '-f', 'adts'] },
  wma:  { ext: 'wma',  encoder: 'wmav2',      args: (o) => ['-c:a', 'wmav2', '-b:a', `${o.bitrate}k`] },
  ogg:  { ext: 'ogg',  encoder: 'libvorbis',  args: () => ['-c:a', 'libvorbis', '-q:a', '5'] },
};

const RATES = [22050, 32000, 44100, 48000];
const BITRATES = [128, 160, 192, 224, 256, 320];

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

async function ensureCore() {
  if (core) return core;
  core = await createFFmpegCore({
    locateFile: (name) => new URL(`../vendor/ffmpeg/${name}`, import.meta.url).href,
  });
  // El core entrega stdout/stderr por logger; es importante separarlos:
  // ffprobe escribe el JSON en stdout y los mensajes de progreso en stderr.
  core.setLogger((entry) => {
    if (!entry) return;
    const message = typeof entry === 'string' ? entry : entry.message;
    if (typeof message !== 'string') return;
    if (typeof entry === 'object' && entry.type === 'stderr') errLogs.push(message);
    else outLogs.push(message);
  });
  return core;
}

function exec(args) {
  outLogs = [];
  errLogs = [];
  let code = 0;
  try {
    if (typeof core.reset === 'function') core.reset();
    code = core.exec(...args);
  } catch (error) {
    errLogs.push(String(error && error.message ? error.message : error));
    code = -1;
  }
  return { code, out: outLogs.join('\n'), err: errLogs.join('\n') };
}

function parseEncoders(output) {
  const found = new Set();
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Z.]{6}\s+([a-z0-9_]+)\s/i);
    if (m) found.add(m[1].toLowerCase());
  }
  return [...found];
}

function parseMediaInfo(output) {
  const info = { duration: 0, sampleRate: 0, channels: 0, codec: '' };
  const dur = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (dur) info.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
  const audio = output.match(/Audio:\s*([a-z0-9_]+)/i);
  if (audio) info.codec = audio[1].toLowerCase();
  const rate = output.match(/(\d{4,6})\s*Hz/);
  if (rate) info.sampleRate = Number(rate[1]);
  const ch = output.match(/\b(mono|stereo)\b|(\d+)\s*channels/i);
  if (ch) info.channels = ch[1] ? (ch[1].toLowerCase() === 'mono' ? 1 : 2) : Number(ch[2]);
  return info;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}

function buildArgs(format, options, inputName, outputName, start, dur) {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`Formato no soportado: ${format}`);
  const rate = RATES.includes(Number(options.sampleRate)) ? Number(options.sampleRate) : 44100;
  const bitrate = BITRATES.includes(Number(options.bitrate)) ? Number(options.bitrate) : 192;
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', Number(start).toFixed(6),
    '-t', Number(dur).toFixed(6),
    '-i', inputName,
    '-vn', '-map', '0:a:0',
    ...spec.args({ bitrate }),
    '-ar', String(rate),
    outputName,
  ];
}

async function handleInit(id) {
  await ensureCore();
  const version = exec(['-hide_banner', '-version']);
  const enc = exec(['-hide_banner', '-encoders']);
  const encoders = parseEncoders(enc.out || enc.err);
  post({
    type: 'ready',
    id,
    encoders,
    version: (version.out.match(/ffmpeg version (\S+)/) || version.err.match(/ffmpeg version (\S+)/) || [])[1] || 'desconocida',
    debug: { code: enc.code, encoders: encoders.length },
  });
}

async function handleProbe(id, payload) {
  await ensureCore();
  const ext = payload.ext || 'bin';
  const name = `probe.${ext}`;
  core.FS.writeFile(name, new Uint8Array(payload.buffer));

  let info = { duration: 0, sampleRate: 0, channels: 0, codec: '' };

  try {
    if (typeof core.ffprobe === 'function') {
      if (typeof core.reset === 'function') core.reset();
      outLogs = [];
      errLogs = [];
      core.ffprobe(
        '-v', 'error',
        '-show_entries', 'format=duration:stream=sample_rate,channels,codec_name',
        '-select_streams', 'a:0',
        '-of', 'json',
        name
      );
      const json = extractJson(outLogs.join('\n'));
      if (json) {
        const stream = (json.streams && json.streams[0]) || {};
        const format = json.format || {};
        info.duration = Number(format.duration) || 0;
        info.sampleRate = Number(stream.sample_rate) || 0;
        info.channels = Number(stream.channels) || 0;
        info.codec = String(stream.codec_name || '').toLowerCase();
      }
    }

    if (!info.duration) {
      const r = exec(['-hide_banner', '-i', name]);
      const parsed = parseMediaInfo(`${r.err}\n${r.out}`);
      info = {
        duration: info.duration || parsed.duration,
        sampleRate: info.sampleRate || parsed.sampleRate,
        channels: info.channels || parsed.channels,
        codec: info.codec || parsed.codec,
      };
    }
  } catch (e) {
    // se devuelve lo que se haya podido leer
  }

  try { core.FS.unlink(name); } catch (e) { /* noop */ }
  post({ type: 'probe', id, info });
}

async function handleSplit(id, payload) {
  await ensureCore();
  cancelled = false;

  const format = payload.format;
  const spec = FORMATS[format];
  if (!spec) throw new Error(`Formato no soportado: ${format}`);

  const inputName = `entrada.${payload.ext || 'bin'}`;
  const total = payload.segments.length;
  const started = Date.now();
  core.FS.writeFile(inputName, new Uint8Array(payload.buffer));

  try {
    for (let i = 0; i < total; i++) {
      if (cancelled) {
        post({ type: 'cancelled', id });
        return;
      }
      const seg = payload.segments[i];
      const outName = `parte_${String(i).padStart(4, '0')}.${spec.ext}`;
      const args = buildArgs(format, payload.options || {}, inputName, outName, seg.start, seg.dur);
      const r = exec(args);

      if (r.code !== 0) {
        post({
          type: 'segmentError',
          id,
          index: i,
          message: (r.err || r.out || 'FFmpeg devolvió un error').slice(0, 500),
        });
        try { core.FS.unlink(outName); } catch (e) { /* noop */ }
        continue;
      }

      let data;
      try {
        data = core.FS.readFile(outName);
      } catch (e) {
        post({ type: 'segmentError', id, index: i, message: 'No se pudo leer el fragmento.' });
        continue;
      }
      try { core.FS.unlink(outName); } catch (e) { /* noop */ }

      post({
        type: 'segment',
        id,
        index: i,
        dur: seg.dur,
        name: payload.names ? payload.names[i] : `${i + 1}.${spec.ext}`,
        data: data.buffer,
      }, [data.buffer]);

      post({
        type: 'progress',
        id,
        done: i + 1,
        total,
        index: i,
        elapsedMs: Date.now() - started,
      });
    }

    if (cancelled) {
      post({ type: 'cancelled', id });
      return;
    }
    post({ type: 'done', id, total });
  } finally {
    try { core.FS.unlink(inputName); } catch (e) { /* noop */ }
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    switch (msg.type) {
      case 'init':
        await handleInit(msg.id);
        break;
      case 'probe':
        await handleProbe(msg.id, msg.payload);
        break;
      case 'split':
        await handleSplit(msg.id, msg.payload);
        break;
      case 'cancel':
        cancelled = true;
        break;
      default:
        post({ type: 'error', id: msg.id, message: `Mensaje desconocido: ${msg.type}` });
    }
  } catch (error) {
    post({
      type: 'error',
      id: msg.id,
      message: String(error && error.message ? error.message : error),
    });
  }
};
