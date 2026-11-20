# CUT MUSIC 1.1.0

Aplicación web (PWA) para trabajar con canciones **en local**: dividirlas en fragmentos de
duración configurable o **extraer un único intervalo** con un editor visual.

**Todo el procesamiento ocurre en tu equipo**: ningún audio se sube a ningún servidor.

- HTML5 + CSS3 + JavaScript moderno
- Bootstrap 5 y Bootstrap Icons (locales, sin CDN)
- FFmpeg.wasm (`@ffmpeg/core` 0.12.10, FFmpeg 5.1.4) en un Web Worker
- Web Audio API para la forma de onda y la escucha en tiempo real
- PWA: `manifest.json` + `service-worker.js` + iconos PNG
- Interfaz en **español, inglés, francés y chino**

> **Estado:** 1.1.0 entregada para revisión. GitHub Pages sigue mostrando la 1.0.0 hasta
> que se apruebe la publicación.

---

## 1. Ejecutar en local

Hace falta servirse por HTTP en `localhost` (Chrome exige origen seguro para PWA y service worker).
**No abras `index.html` con `file://`**: la PWA y el worker no funcionarán.

1. **Node.js**: `servir.bat` (o `node tools/servidor.mjs 8130`) y abre
   <http://127.0.0.1:8130/>.
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
5. Pulsa **DIVIDIR CANCIÓN** y descarga cada fragmento o todos en un ZIP.

Nombres: `Cancion_Parte_001.mp3`, `Cancion_Parte_002.mp3`…

### B) Corte por intervalo con editor visual

1. Carga la canción.
2. Activa **ACTIVAR CORTE POR INTERVALO** (el panel Partes queda desactivado).
3. La app dibuja la **forma de onda** y coloca dos marcadores:
   - **INICIO** (azul) y **FIN** (naranja), arrastrables.
   - Los campos `HH:MM:SS.mmm` y los marcadores están sincronizados en ambos sentidos.
4. **Zoom**: siete niveles (−3, −2, −1, 1×, +1, +2, +3). Acerca para precisión; aleja para
   ver más pista. Con zoom activo puedes **arrastrar la onda** para desplazarte.
5. **Escucha en tiempo real (live scrubbing)**: al arrastrar un marcador suena el audio de
   esa posición; al soltarlo, la posición queda fijada.
6. **Play / Pause / Stop**: reproducen solo el intervalo (se detienen solos en FIN).
7. Pulsa **CORTAR INTERVALO**: se genera un único archivo
   `Cancion_Intervalo.<formato>` con la duración `fin − inicio`.

Cambiar los marcadores o los tiempos durante la reproducción detiene el audio y actualiza
los límites para la siguiente escucha.

### C) Idioma

En la cabecera hay cinco banderas: 🇪🇸, 🇬🇧, 🇺🇸, 🇫🇷, 🇨🇳. Las dos inglesas activan el
mismo idioma. El cambio es inmediato, sin recargar, y no pierde la canción ni la selección.
El idioma inicial es siempre español.

## 4. Estructura

```
CutMusic/
├── index.html
├── manifest.json
├── service-worker.js
├── servir.bat                 lanzador local (Node)
├── README.md
├── backups/                   copias de versiones anteriores
├── css/styles.css
├── js/
│   ├── app.js                 interfaz y orquestación
│   ├── i18n.js                diccionarios es · en · fr · zh
│   ├── validation.js          validaciones + tiempos HH:MM:SS.mmm
│   ├── file-manager.js        arrastrar/soltar y metadatos
│   ├── worker-manager.js      puente con el worker
│   ├── splitter-engine.js     cálculo de cortes y sobrante
│   ├── wave-editor.js         picos, canvas y ventana de zoom
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
- División por partes: **lotes de 25 fragmentos con motor nuevo por lote**.
- Corte por intervalo: un único segmento (`duración = fin − inicio`) por el mismo motor.
- La forma de onda se calcula una sola vez por canción (Web Audio) y se guarda como picos;
  el audio mono resultante permite el scrub sin volver a decodificar.
- Los resultados se ofrecen como descarga individual o ZIP; el original nunca se escribe.

## 6. Privacidad

- No hay red: la app no envía audio a ningún sitio. El service worker solo guarda en caché
  los recursos de la propia app (incluido el núcleo de FFmpeg, que es estático).
- No se usa ningún servicio de conversión externo.
- El archivo original **solo se lee**; nunca se modifica.

## 7. Limitaciones conocidas

1. **Memoria**: canciones de hasta ~1 GB; la app avisa por encima. La forma de onda y el
   scrub se generan solo hasta 15 minutos; el scrub mantiene un búfer mono (≈ 1,3 MB por
   minuto a 44,1 kHz).
2. **Metadatos**: al recodificar se pierden etiquetas ID3/carátulas; el audio no se pierde.
3. **WMA/formatos raros de entrada**: la duración se obtiene con ffprobe; si falla, la app avisa.
4. **OGG**: se ofrece si la compilación incluye Vorbis (esta compilación sí).
5. **Cancelar**: se detiene entre fragmentos (uno en curso no se puede abortar dentro de FFmpeg.wasm).
6. **Zoom**: con niveles muy altos los dos marcadores pueden quedar fuera de la vista; arrastra
   la onda para desplazarte. La selección y los cortes no cambian con el zoom.
7. **Licencias**: `@ffmpeg/core` incluye componentes GPL/LGPL; revisa licencias si redistribuyes.
8. **Instalación PWA**: requiere HTTPS o localhost; `file://` no permite instalar.

## 8. Pruebas realizadas (Chrome, 20/11/2026)

Detalle en [tests/pruebas.md](tests/pruebas.md).

| # | Caso | Resultado |
|---|---|---|
| 1 | Forma de onda al cargar | ✅ 1400 picos dibujados |
| 2 | Zoom +1/+2/+3 | ✅ ventana 115 s → 57,5 s → 28,75 s |
| 3 | Zoom −1/−2/−3 | ✅ ventana 460 s / 920 s / 1840 s |
| 4 | Marcadores en zoom | ✅ tiempos correctos y arrastre funcional |
| 5 | START azul / END naranja | ✅ etiquetas y líneas diferenciadas |
| 6 | Live scrubbing START | ✅ AudioContext activo y posición 40 → 45 s |
| 7 | Live scrubbing END | ✅ mismas comprobaciones |
| 8–10 | Play/Pause/Stop | ✅ reanuda y vuelve al inicio |
| 11 | Español inicial | ✅ |
| 12 | Inglés (GB y US) | ✅ ambos botones activan EN |
| 13 | Francés | ✅ |
| 14 | Chino | ✅ caracteres correctos |
| 15 | Cambio en caliente | ✅ conserva canción, selección y zoom |
| 16 | Exportación tras zoom/scrub | ✅ 35,000 s (45→80) |
| 17 | Regresión división por partes | ✅ 23 fragmentos |
| 18 | ZIP | ✅ `cancion230_partes.zip` |
| 19 | Original intacto | ✅ SHA-256 sin cambios |
