# Pruebas de Cut Music 1.0

Entorno: Google Chrome (harness web), 18/11/2026. Audios de prueba generados con FFmpeg
(`tests/fixtures/cancion230.mp3`, `cancion235.mp3`, `cancion5.mp3`).

Procedimiento común: arrastrar/soltar el archivo, fijar la duración de fragmento, elegir
el modo de sobrante si aparece el diálogo, dividir y medir la duración real de cada
archivo resultante con `HTMLAudioElement.duration`.

## Resultados

| # | Entrada | Config | Salida esperada | Salida real | Estado |
|---|---|---|---|---|---|
| 1 | 230,00 s | 10 s | 23 | 23 archivos | ✅ |
| 2 | 235,05 s | 10 s, separar | 23×10 + 1×5 | 24 archivos, suma 235,00 s | ✅ |
| 3 | 235,05 s | 10 s, unir | 22×10 + 1×15 | 23 archivos, suma 235,00 s | ✅ |
| 4 | 230,00 s | 2 s | 115 | 115 archivos (2,00 s cada uno) | ✅ |
| 5 | 5,00 s | 10 s | 1 | 1 archivo de 5,00 s | ✅ |
| 6 | 5,00 s | MP3 192 kbps | MP3 válido | reproducido, 119 KB | ✅ |
| 7 | 5,00 s | WAV | PCM 16 bits | 861 KB, nombre `.wav` | ✅ |
| 8 | 5,00 s | FLAC | FLAC | 264 KB, nombre `.flac` | ✅ |
| 9 | 5,00 s | Decimal 2,5 s | 2 fragmentos | 2,5 + 2,5 = 5,00 s | ✅ |
| 10 | 230 s | ZIP | ZIP descargado | `cancion230_partes.zip` | ✅ |
| 11 | 230 s mp3 | — | original intacto | tamaño y fecha sin cambios | ✅ |

## Comprobaciones adicionales

- `manifest.json` responde 200; `display: standalone`; tema `#ff7a1a`.
- Service worker **activo**; los iconos 192 y 512 responden 200.
- `window.showDirectoryPicker` disponible en Chrome (File System Access API).
- Codificadores disponibles en el núcleo (verificado con `-encoders`):
  `libmp3lame`, `pcm_s16le`, `flac`, `aac`, `wmav2`, `libvorbis`.
- Versión del núcleo: FFmpeg **5.1.4** (`@ffmpeg/core` 0.12.10).

## Incidencias encontradas y corregidas

1. **Captura de salida de FFmpeg**: el núcleo escribe por `setLogger`, no por
   `print/printErr`; se corrigió la captura y se separó stdout/stderr.
2. **ffprobe/JSON contaminado**: los mensajes de progreso se mezclaban con el JSON;
   separando stdout y stderr se obtuvo la duración y el sample rate reales.
3. **Buffer detachado**: al transferir el archivo al worker, un segundo corte sobre el
   mismo archivo fallaba; ahora el buffer cacheado se libera y se relee si hace falta.
4. **Memoria de FFmpeg.wasm**: tras ~50 codificaciones seguidas aparecía
   `memory access out of bounds`. Se procesa en **lotes de 25** con un worker nuevo
   por lote y se copia el buffer para cada lote. Con esto, 115 fragmentos se generan
   sin errores.

## Pruebas manuales pendientes (requieren interacción del usuario)

- Instalar la app desde Chrome y crear el acceso directo del escritorio (los criterios
  técnicos — manifest, service worker, iconos, HTTPS/localhost — están verificados).
- Seleccionar carpeta con el diálogo nativo de Chrome y comprobar la escritura directa.
  El código usa `showDirectoryPicker`, pide permiso `readwrite` y no sobrescribe
  archivos existentes (añade ` (1)`, ` (2)`…).
