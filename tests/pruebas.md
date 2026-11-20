# Pruebas de Cut Music

## Versión 1.1.0 — corte por intervalo (20/11/2026)

Entorno: Google Chrome. Audios: `tests/fixtures/cancion230.mp3` (230 s),
`cancion235.mp3` (235,05 s), `cancion5.mp3` (5 s).

Procedimiento: cargar la canción, activar/desactivar el interruptor del panel 4, fijar
los tiempos, pulsar el botón principal y medir la duración real del archivo resultante
con `HTMLAudioElement.duration`.

| # | Caso | Resultado |
|---|---|---|
| 1 | Regresión: 230 s ÷ 10 s | 23 archivos `cancion230_Parte_001…023.mp3` ✅ |
| 2 | Activar corte por intervalo | `chunkInput.disabled = true`, panel 2 con clase `cm-inactive` y distintivo «inactivo» ✅ |
| 3 | Desactivar corte por intervalo | panel 2 habilitado de nuevo ✅ |
| 4 | Exclusividad | en modo intervalo solo se ejecuta el intervalo; el panel 2 no participa ✅ |
| 5 | 35 → 80 s | 1 archivo `cancion230_Intervalo.mp3`, 45,000 s ✅ |
| 6 | 60 → 120 s | 1 archivo, 60,000 s ✅ |
| 7 | 2,5 → 7,5 s | 1 archivo, 5,000 s ✅ |
| 8 | Validaciones | inicio≥fin, fin>duración, negativos, texto inválido y vacío → botón deshabilitado y mensaje claro ✅ |
| 9 | Formatos | intervalo en WAV (861 KB) y FLAC (2.237 KB) además de MP3 ✅ |
| 10 | Integridad | SHA-256 de `cancion230.mp3` idéntico antes y después ✅ |
| 11 | ZIP | `cancion230_intervalo.zip` (intervalo) y `cancion230_partes.zip` (partes) ✅ |

### Mensajes de validación comprobados

- «El tiempo final debe ser superior al tiempo inicial.»
- «El tiempo final no puede superar la duración de la canción (00:03:50.000).»
- «Tiempo de inicio: Formato no válido. Usa HH:MM:SS.mmm (ejemplo: 00:00:35.000).»
- «Tiempo de inicio: El tiempo no puede estar vacío.»

### Notas

- Los tiempos se normalizan al salir del campo (`blur`) al formato `HH:MM:SS.mmm`.
- El intervalo usa el mismo worker y la misma recodificación que la versión 1.0.
- La división por partes conserva los lotes de 25 fragmentos y el diálogo de sobrante.

---

## Versión 1.0.0 (18/11/2026)

Resultados históricos conservados en `backups/v1.0/tests/pruebas.md`:

- 230 s ÷ 10 s → 23; 235 s ÷ 10 s separar → 23×10 + 1×5; unir → 22×10 + 1×15.
- 230 s ÷ 2 s → 115 (lotes de 25 sin errores de memoria).
- 5 s ÷ 10 s → 1; decimales 2,5 s → 2,5 + 2,5.
- MP3 192, WAV, FLAC, ZIP y descargas individuales.

---

## Editor visual del intervalo (1.1.0, 20/11/2026)

Pruebas sobre `cancion230.mp3` en Chrome, con el panel 4 activado.

| # | Caso | Resultado |
|---|---|---|
| 1 | Cargar canción y activar intervalo | forma de onda completa (1400 picos) dibujada en canvas ✅ |
| 2 | Arrastrar marcador inicial | tiempo inicial = 00:00:35.000 y marcador al 15,22 % ✅ |
| 3 | Arrastrar marcador final | tiempo final = 00:01:20.000 y marcador al 34,78 % ✅ |
| 4 | Editar el campo de inicio | marcador inicial se mueve al 15,22 % ✅ |
| 5 | Editar el campo de final | marcador final se mueve al 34,78 % ✅ |
| 6 | 35 → 80 s | resumen: 45 s y 1 archivo ✅ |
| 7 | Play | reproduce desde 35 s, sin salir del intervalo ✅ |
| 8 | Pause | posición congelada (p. ej. 42,591 s durante 1,2 s) ✅ |
| 9 | Play tras Pause | continúa desde 42,591 s (no reinicia) ✅ |
| 10 | Stop | vuelve exactamente a 35,000 s ✅ |
| 11 | Fin del intervalo (35 → 37) | se detiene solo en 37,000 s ✅ |
| 12 | Cambiar el final durante la reproducción | se detiene y pasa al inicio actualizado ✅ |
| 13 | Exportar el intervalo | 1 archivo `cancion230_Intervalo.mp3` de 45,000 s ✅ |
| 14 | Formato del panel 3 | intervalo en WAV de 2 s (345 KB) ✅ |
| 15 | Desactivar el intervalo | panel 2 habilitado y editor oculto ✅ |
| 16 | División por partes | 23 fragmentos de 230 s / 10 s ✅ |
| 17 | ZIP y descargas | `cancion230_partes.zip` y descarga individual ✅ |
| 18 | Archivo original | SHA-256 sin cambios ✅ |

### Incidencia corregida

`formatTimestamp` podía generar `00:01:20.000` como `00:01:19.1000` por redondeo de
coma flotante (1000 ms). Se redondea primero a milisegundos enteros y se deriva
hora/minuto/segundo de ahí; verificado en 79,9999 s → `00:01:20.000`.

### Marcadores

- No se cruzan: el inicio se limita a `fin − 0,01 s` y el final a `inicio + 0,01 s`.
- La selección se dibuja en naranja sobre la onda y el resto en gris azulado.
- El lienzo se redimensiona con `ResizeObserver` (sin deformar la escala temporal).