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
