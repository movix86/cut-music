# CUT MUSIC 1.0

Aplicación web (PWA) para dividir canciones en fragmentos de duración configurable.
**Todo el procesamiento ocurre en tu equipo**: ningún audio se sube a ningún servidor.

- HTML5 + CSS3 + JavaScript moderno
- Bootstrap 5 y Bootstrap Icons (locales, sin CDN)
- FFmpeg.wasm (`@ffmpeg/core` 0.12.10, FFmpeg 5.1.4) ejecutándose en un Web Worker
- PWA: `manifest.json` + `service-worker.js` + iconos PNG

---

## 1. Ejecutar en local

Hace falta servirse por HTTP en `localhost` (Chrome exige origen seguro para PWA y service worker).
**No abras `index.html` con `file://`**: la PWA y el worker no funcionarán.

Opciones:

1. **Node.js** (ya instalado en este equipo):
   ```bat
   servir.bat
   ```
   o
   ```
   node tools/servidor.mjs 8130
   ```
   y abre <http://127.0.0.1:8130/>.

2. **Python**:
   ```
   python -m http.server 8130
   ```
   y abre <http://127.0.0.1:8130/>.

3. Cualquier alojamiento estático con HTTPS (Netlify, GitHub Pages, nginx…).

## 2. Instalar en Chrome

1. Abre la URL en Google Chrome.
2. Pulsa el icono de **instalar** de la barra de direcciones, o menú ⋮ → *Guardar y compartir* → **Instalar Cut Music**.
   También aparece el botón **Instalar Cut Music** en la cabecera de la app cuando Chrome lo permite.
3. Se abre en ventana propia, sin barra de navegador.

### Acceso directo en el escritorio

- Desde el menú Inicio: busca **Cut Music** → clic derecho → *Más* → **Abrir ubicación del archivo**, y arrastra el acceso al escritorio.
- O en Chrome: `chrome://apps` → clic derecho en **Cut Music** → **Crear acceso directo en el escritorio**.

## 3. Uso

1. Arrastra la canción al panel **1 · Canción** (o pulsa el botón **+**).
2. En **2 · Partes** escribe la duración en segundos (acepta decimales) o pulsa 2/5/10/15/30/60.
3. Si el último fragmento queda más corto, la app pregunta:
   - **Separar el sobrante**: 23 × 10 s + 1 × 5 s.
   - **Unir al último**: 22 × 10 s + 1 × 15 s.
4. Elige **formato** (MP3, WAV, FLAC, M4A, AAC, WMA, OGG), frecuencia y bitrate. Los formatos que la compilación de FFmpeg no soporte se ocultan automáticamente.
5. Opcional: **Elegir carpeta** (File System Access API). Si no, descarga individual o ZIP al terminar.
6. Pulsa **DIVIDIR CANCIÓN**, sigue el progreso y cancela si hace falta.

Nombres: `Cancion_Parte_001.mp3`, `Cancion_Parte_002.mp3`…

## 4. Estructura

```
CutMusic/
├── index.html
├── manifest.json
├── service-worker.js
├── servir.bat                 lanzador local (Node)
├── README.md
├── css/styles.css
├── js/
│   ├── app.js                 interfaz y orquestación
│   ├── validation.js          validaciones y formato de datos
│   ├── file-manager.js        arrastrar/soltar y metadatos
│   ├── worker-manager.js      puente con el worker
│   ├── splitter-engine.js     cálculo de cortes y sobrante
│   └── export-manager.js      descargas, ZIP y carpetas
├── workers/audio-worker.js    FFmpeg.wasm (procesamiento real)
├── vendor/
│   ├── ffmpeg/                ffmpeg-core.js + ffmpeg-core.wasm (30,7 MB)
│   ├── bootstrap/
│   ├── bootstrap-icons/
│   └── jszip/
├── assets/icons/              iconos 192/512/apple
├── tools/servidor.mjs         servidor estático solo para desarrollo
└── tests/fixtures/            audios de prueba generados
```

## 5. Cómo procesa

- El worker escribe el archivo en el sistema de archivos virtual de FFmpeg.
- Cada fragmento se corta con `-ss`/`-t` y **se recodifica** (no se copian paquetes comprimidos), para que los cortes sean precisos al milisegundo.
- Se procesa en **lotes de 25 fragmentos con un motor nuevo por lote**: FFmpeg.wasm degrada su memoria tras ~50 codificaciones seguidas y esto evita el error `memory access out of bounds`.
- Al terminar, los `Blob` se ofrecen para descarga individual, ZIP o escritura directa en la carpeta elegida.
- Los archivos existentes **no se sobrescriben**: se añade ` (1)`, ` (2)`…

## 6. Privacidad

- No hay red: la app no envía audio a ningún sitio. El service worker solo guarda en caché los recursos de la propia app (incluido el núcleo de FFmpeg, que es estático).
- No se usa ningún servicio de conversión externo.
- El archivo original **solo se lee**; nunca se modifica.

## 7. Limitaciones conocidas

1. **File System Access API** solo existe en navegadores Chromium y exige un gesto del usuario; la carpeta se pide con el botón y Chrome no expone la ruta completa, solo el nombre.
2. **Memoria**: recomiendo canciones de hasta ~1 GB; la app avisa por encima. Archivos muy largos y fragmentos de 2 s generan muchos lotes (más lento).
3. **Metadatos**: al recodificar se pierden etiquetas ID3/carátulas del original. El audio no se pierde; la duración total se conserva.
4. **WMA/formatos raros como entrada**: la duración puede no ser legible por el navegador; se obtiene con ffprobe y, si aun así falla, la app avisa.
5. **OGG**: se ofrece si la compilación incluye el codificador Vorbis (en esta compilación sí). Si no estuviera, el formato se oculta.
6. **Cancelar**: se detiene entre fragmentos (un fragmento en curso no se puede abortar dentro de FFmpeg.wasm).
7. **Licencias**: el núcleo `@ffmpeg/core` incluye componentes GPL/LGPL; si redistribuyes la app, revisa las licencias de FFmpeg y de los códecs incluidos.
8. **Instalación PWA**: requiere HTTPS o localhost. Abrir con `file://` no permite instalar ni usar el service worker.

## 8. Pruebas realizadas (Chrome, 18/11/2026)

| # | Caso | Resultado |
|---|---|---|
| 1 | 230 s ÷ 10 s | ✅ 23 fragmentos |
| 2 | 235 s ÷ 10 s, separar | ✅ 23 × 10 s + 1 × 5 s (suma 235,00 s) |
| 3 | 235 s ÷ 10 s, unir | ✅ 22 × 10 s + 1 × 15 s (suma 235,00 s) |
| 4 | 230 s ÷ 2 s | ✅ 115 × 2 s (suma 230,00 s) |
| 5 | Canción 5 s ÷ 10 s | ✅ 1 fragmento de 5 s |
| 6 | MP3 192 kbps | ✅ |
| 7 | WAV y FLAC | ✅ (WAV 861 KB / FLAC 264 KB para 5 s) |
| 8 | Original intacto | ✅ solo se lee; tamaño y fecha sin cambios |
| 9 | Sin pérdida de audio | ✅ sumas exactas en los 4 casos |
| 10 | Decimales (2,5 s) | ✅ 2,5 + 2,5 = 5,00 s |
| 11 | ZIP | ✅ `cancion230_partes.zip` generado |
| 12 | File System Access | ⚠️ API detectada; el selector requiere gesto manual |
| 13 | Instalación PWA | ⚠️ manifest 200, SW activo, iconos 200; instalación manual en Chrome |
| 14 | Ventana independiente | ⚠️ depende de la instalación (checklist manual) |
| 15 | Interfaz responde | ✅ procesamiento en worker; UI actualizada durante el corte |
| 16 | Archivos largos | ✅ 115 fragmentos con lotes; límite documentado |

Detalle en [tests/pruebas.md](tests/pruebas.md).
