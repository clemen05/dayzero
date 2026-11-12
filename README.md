# DayZero · Sprint 1

Web que compara tu vida entre Madrid, Londres, Ámsterdam y Zúrich: sueldo neto, coste de vida, coste de arranque y «el número que duele», con la fuente de cada cifra. Cubre las 14 historias del sprint DZ Sprint 1 (DAYZ-9 a DAYZ-20, DAYZ-32 y DAYZ-33).

## Estructura

| Ruta | Qué es |
|---|---|
| `data/dayzero.sqlite` | Dataset original (solo lectura) |
| `tools/export_data.py` | Exporta el SQLite a `src/data.js` y repara textos mal codificados (p. ej. «ChamartÃ­n») |
| `src/engine.js` | Motor de cálculo puro: impuestos de los 4 países (HU-06), precios (HU-05), moneda (HU-08), transporte (HU-24), coste de vida (HU-10), arranque (HU-11), número que duele (HU-12), pisos (HU-25) |
| `src/i18n.js` | Todos los textos en español e inglés (HU-04) |
| `src/app.js` | Interfaz: asistente de 4 pasos, resultados, semana día 1, botón «i» de fuentes (HU-07) |
| `src/index.html` | Plantilla y estilos |
| `tools/build.py` | Junta todo en `dist/index.html` (un único archivo, funciona sin servidor) |
| `tests/engine.test.js` | 19 pruebas del motor, incluidos los 12 casos fiscales de HU-06 |
| `tests/casos_fiscales.json` | Casos de HU-06: rellenar `ref_oficial` con la calculadora oficial de cada país |
| `tests/e2e.js` | 44 comprobaciones en navegador de los criterios de aceptación de Jira |

## Abrirlo en Visual Studio Code

1. `Archivo → Abrir carpeta…` y elige la carpeta `dayzero`. Acepta instalar las extensiones recomendadas.
2. `Ctrl+Shift+B` → build: genera `dist/index.html`.
3. `Ctrl+Shift+P → Tasks: Run Task → DayZero: abrir la app` para verla en el navegador, o `F5 → App en Edge (depurar)` para depurarla con puntos de interrupción.
4. `Ctrl+Shift+P → Tasks: Run Test Task` ejecuta los tests del motor.

Requisitos: Python 3 (para el build) y Node.js 18 o superior (para los tests). La app en sí no necesita nada: `dist/index.html` se abre con doble clic.

## Comandos (terminal)

```bash
npm run data    # SQLite -> src/data.js (cuando cambie el dataset)
npm run build   # -> dist/index.html
npm test        # motor (19 pruebas, incluidos los 12 casos de HU-06)
npm install     # solo la primera vez, para los tests de aceptación
npx playwright install chromium
npm run e2e     # 44 comprobaciones de los criterios de aceptación de Jira
```

## Git y Jira

Los mensajes de commit llevan la clave de Jira (`DAYZ-13`, `DAYZ-14`…). Si conectáis el repositorio a Jira (GitHub for Jira o Bitbucket), cada commit aparece en su historia. Para trabajar: una rama por historia, `feature/DAYZ-14-impuestos`, y pull request a `main`.

## Regla de datos

Cada cifra sale del motor con su fuente, su fecha y su `origen_dato`. Si un dato no existe, la app muestra «sin dato» y no lo suma; nunca inventa un valor. `web_aproximado`, `portal_privado_aproximado` y `estimado` se marcan como «estimación de fuente secundaria».

## Decisiones tomadas (revisar con el equipo)

- **Nacionalidad y edad**: se añadieron a la pantalla de situación (HU-03) porque HU-11 necesita saber si hay visado y Zúrich necesita la edad (pensión BVG y seguro médico).
- **Alquiler**: precio de oferta para recién llegados; si no hay, contratos vigentes × `ajuste_nuevo_contrato`.
- **Electricidad**: el dataset da €/kWh; se supone un consumo de 150 kWh/mes (marcado como «supuesto de la app»).
- **Londres**: council tax banda D (mediana de los 33 distritos) con el 25 % de descuento por vivir solo; en habitación no se suma porque el precio de SpareRoom incluye gastos.
- **Vuelos**: si falta un sentido (p. ej. Londres→Madrid) se usa el contrario.
- **Sin dato**: agencia, seguro médico neerlandés y tasas de visado de fuera de la UE en Reino Unido y Países Bajos.
- **Impuestos**: persona soltera sin hijos; Suiza tarifa A0N. Es el impuesto anual final, no la retención de nómina.
