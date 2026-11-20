# CUT MUSIC 1.1.0

Aplicación web (PWA) para trabajar con canciones **en local**: dividirlas en fragmentos de
duración configurable o **extraer un único intervalo** entre dos tiempos.

**Todo el procesamiento ocurre en tu equipo**: ningún audio se sube a ningún servidor.

- HTML5 + CSS3 + JavaScript moderno
- Bootstrap 5 y Bootstrap Icons (locales, sin CDN)
- FFmpeg.wasm (`@ffmpeg/core` 0.12.10, FFmpeg 5.1.4) en un Web Worker
- PWA: `manifest.json` + `service-worker.js` + iconos PNG

> **Estado:** 1.1.0 entregada para revisión. La demo pública de GitHub Pages sigue
> mostrando la 1.0.0 hasta que se apruebe la publicación.

---

## 1. Ejecutar en local

Hace falta servirse por HTTP en `localhost` (Chrome exige origen seguro para PWA y service worker).
**No abras `index.html` con `file://`**: la PWA y el worker no funcionarán.

1. **Node.js**:
   ```bat
   servir.bat
   ```
   o `node tools/servidor.mjs 8130`, y abre <http://127.0.0.1:8130/>.

2. **Python**: `python -m http.server 8130` y abre <http://127.0.0.1:8130/>.

3. Cualquier alojamiento estático con HTTPS.

## 2. Instalar en Chrome

1. Abre la URL en Google Chrome.
2. Icono de **instalar** de la barra de direcciones, o menú ⋮ → *Guardar y compartir* →
   **Instalar Cut Music**.
3. Se abre en ventana propia, sin barra de navegador.

### Acceso directo en el escritorio

`chrome://apps` → clic derecho en **Cut Music** → **Crear acceso directo en el escritorio**.

## 3. Uso

### A) División por partes (modo clásico)

1. Arrastra la canción al panel **1 · Canción** (o pulsa **+**).
2. En **2 · Partes** escribe la duración en segundos (acepta decimales) o pulsa 2/5/10/15/30/60.
3. Si el último fragmento queda más corto, la app pregunta:
   - **Separar el sobrante**: 23 × 10 s + 1 × 5 s.
   - **Unir al último**: 22 × 10 s + 1 × 15 s.
4. Elige formato y calidad en **3 · Formato de exportación**.
5. Pulsa **DIVIDIR CANCIÓN**.
6. Descarga cada fragmento o todos en un ZIP.

Nombres: `Cancion_Parte_001.mp3`, `Cancion_Parte_002.mp3`…

### B) Corte por intervalo (nuevo en 1.1.0)

1. Carga la canción.
2. Activa **ACTIVAR CORTE POR INTERVALO** en el panel **4 · Corte por intervalo**.
3. Introduce **inicio** y **finalización** con formato `HH:MM:SS.mmm`
   (también acepta `MM:SS`, segundos sueltos o decimales con coma: `2,5`).
4. Pulsa **CORTAR INTERVALO**: se genera un único archivo
   `Cancion_Intervalo.<formato>` con la duración `fin − inicio`.

Al activar el intervalo, el panel **2 · Partes** queda desactivado (y viceversa):
los dos métodos nunca se ejecutan a la vez. El botón «Canción completa» rellena el
intervalo con toda la pista.

Validaciones: inicio < final, final ≤ duración, sin negativos, sin intervalos de
duración cero y sin formatos de tiempo inválidos.

## 4. Estructura

```
CutMusic/
├── index.html
├── manifest.json
├── service-worker.js
├── servir.bat                 lanzador local (Node)
├── README.md
├── backups/v1.0/              copia de la versión 1.0
├── css/styles.css
├── js/
│   ├── app.js                 interfaz y orquestación
│   ├── validation.js          validaciones + tiempos HH:MM:SS.mmm
│   ├── file-manager.js        arrastrar/soltar y metadatos
│   ├── worker-manager.js      puente con el worker
│   ├── splitter-engine.js     cálculo de cortes y sobrante
│   └── export-manager.js      descargas y ZIP
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
- Cada corte se hace con `-ss`/`-t` y **recodificación**, para precisión al milisegundo.
- División por partes: **lotes de 25 fragmentos con motor nuevo por lote** (FFmpeg.wasm
  degrada su memoria tras ~50 codificaciones seguidas).
- Corte por intervalo: un único segmento (`duración = fin − inicio`) por el mismo motor.
- Los resultados se ofrecen como descarga individual o ZIP; el original nunca se escribe.

## 6. Privacidad

- No hay red: la app no envía audio a ningún sitio. El service worker solo guarda en caché
  los recursos de la propia app (incluido el núcleo de FFmpeg, que es estático).
- No se usa ningún servicio de conversión externo.
- El archivo original **solo se lee**; nunca se modifica.

## 7. Limitaciones conocidas

1. **Memoria**: recomiendo canciones de hasta ~1 GB; la app avisa por encima.
2. **Metadatos**: al recodificar se pierden etiquetas ID3/carátulas; el audio no se pierde.
3. **WMA/formatos raros de entrada**: la duración se obtiene con ffprobe; si falla, la app avisa.
4. **OGG**: se ofrece si la compilación incluye Vorbis (esta compilación sí).
5. **Cancelar**: se detiene entre fragmentos (uno en curso no se puede abortar dentro de FFmpeg.wasm).
6. **Corte por intervalo**: el final no puede superar la duración real de la canción.
7. **Licencias**: `@ffmpeg/core` incluye componentes GPL/LGPL; revisa licencias si redistribuyes.
8. **Instalación PWA**: requiere HTTPS o localhost; `file://` no permite instalar.

## 8. Pruebas realizadas (Chrome, 20/11/2026)

Versión 1.1.0 — detalle en [tests/pruebas.md](tests/pruebas.md).

| # | Caso | Resultado |
|---|---|---|
| 1 | 230 s ÷ 10 s (regresión) | ✅ 23 fragmentos |
| 2 | Activar intervalo | ✅ panel Partes deshabilitado |
| 3 | Desactivar intervalo | ✅ panel Partes recuperado |
| 4 | Exclusividad | ✅ solo un método por ejecución |
| 5 | 230 s, 35 → 80 s | ✅ 1 archivo de 45,000 s |
| 6 | 230 s, 60 → 120 s | ✅ 1 archivo de 60,000 s |
| 7 | 2,5 → 7,5 s | ✅ 1 archivo de 5,000 s |
| 8 | Validaciones | ✅ inicio≥fin, fin>duración, negativos, vacío, cero |
| 9 | Formatos del intervalo | ✅ MP3, WAV (861 KB), FLAC (2.237 KB) |
| 10 | Original intacto | ✅ SHA-256 sin cambios |
| 11 | ZIP y descargas | ✅ `_partes.zip` / `_intervalo.zip` |
