# DayZero

Web app que compara tu vida entre **Madrid, Londres, Ámsterdam y Zúrich**: sueldo neto, coste de vida, coste de instalarte y «el número que duele», con la fuente de cada cifra. Cubre las 14 historias del **Sprint 1** del proyecto DAYZ en Jira.

- **Backend:** Node.js + Express. Lee `data/dayzero.sqlite` directamente (con sql.js, no hay que compilar nada) y expone una API REST.
- **Frontend:** HTML, CSS y JavaScript sin frameworks, en `public/`.
- **Motor de cálculo:** `shared/engine.js`, el mismo archivo en el servidor y en el navegador.

## Puesta en marcha (Windows + Visual Studio Code)

1. Instala **Node.js LTS** desde https://nodejs.org (botón verde). Siguiente, siguiente, finalizar.
2. Abre VS Code → `Archivo → Abrir carpeta…` → elige la carpeta `dayzero`.
3. Abre la terminal: `Terminal → Nuevo terminal`.
4. Instala las dependencias (solo la primera vez):
   ```
   npm install
   ```
5. Arranca la web:
   ```
   npm start
   ```
6. Abre **http://localhost:3000** en el navegador.

También puedes pulsar **F5** y elegir **«DayZero: arrancar servidor»**: arranca y abre el navegador solo.

Para programar con recarga automática: `npm run dev` (reinicia el servidor al guardar).

## Estructura

```
dayzero/
├── server.js              Punto de entrada (npm start)
├── server/
│   ├── app.js             Express: rutas de la API y archivos estáticos
│   └── db.js              Lee el SQLite y repara los textos mal codificados
├── shared/
│   └── engine.js          Motor de cálculo (servidor y navegador)
├── public/                La web
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── main.js        Carga los datos de la API y arranca la interfaz
│       ├── i18n.js        Textos en español e inglés (HU-04)
│       └── app.js         Pantallas e interacción
├── data/dayzero.sqlite    Dataset
├── tests/                 Tests del motor, de la API y de aceptación
└── api.http               Peticiones de ejemplo (extensión REST Client)
```

## API

| Método | Ruta | Qué devuelve |
|---|---|---|
| GET | `/api/ciudades` | Las 4 ciudades con país y moneda |
| GET | `/api/datos` | Todas las tablas que usa la web |
| GET | `/api/tipos-cambio` | Último tipo de referencia del BCE |
| GET | `/api/neto?pais=ES&bruto=30000&edad=30` | Neto anual y desglose de impuestos |
| POST | `/api/calcular` | Neto, coste de vida, arranque y número que duele |
| GET | `/api/pisos?ciudad=LON&tipo=estudio` | Tres pisos reales con alquiler y trayecto |
| GET | `/api/fuentes/:id` | Ficha de una fuente (licencia, enlace, atribución) |

## Tests

```
npm test            # 27 tests: motor (incluidos los 12 casos fiscales de HU-06) y API
npx playwright install chromium   # solo la primera vez
npm run e2e         # 44 comprobaciones de los criterios de aceptación de Jira en un navegador real
```

`tests/casos_fiscales.json`: rellenad `ref_oficial` con el resultado de la calculadora oficial de cada país y el test comprobará el margen de ±1 % que pide HU-06.

## Publicarla en internet

Cualquier hosting de Node sirve (Render, Railway, Fly.io, Azure App Service). Comando de arranque: `npm start`. El puerto se toma de la variable `PORT`.

## Regla de datos

Cada cifra sale del motor con su fuente, su fecha y su `origen_dato`. Si un dato no existe, la app muestra «sin dato» y no lo suma; nunca inventa un valor. `web_aproximado`, `portal_privado_aproximado` y `estimado` se marcan como «estimación de fuente secundaria».

## Decisiones tomadas (revisar con el equipo)

- **Nacionalidad y edad** se piden en la pantalla de situación: HU-11 necesita saber si hay visado y Zúrich necesita la edad.
- **Alquiler:** precio de oferta para recién llegados; si no lo hay, contratos vigentes × `ajuste_nuevo_contrato`.
- **Electricidad:** consumo supuesto de 150 kWh/mes (marcado como «supuesto de la app»).
- **Londres:** council tax de banda D con el 25 % de descuento por vivir solo; en habitación no se suma porque SpareRoom ya incluye los gastos.
- **Vuelos:** si falta un sentido se usa el contrario.
- **Sin dato:** agencia, seguro médico neerlandés y tasas de visado de fuera de la UE en Reino Unido y Países Bajos.
- **Impuestos:** persona soltera sin hijos; Suiza tarifa A0N. Es el impuesto anual final, no la retención de nómina.

## Git y Jira

Los commits llevan la clave de Jira (`DAYZ-13`, `DAYZ-14`…). Conectando el repositorio a Jira (GitHub for Jira), cada commit aparece en su historia. Una rama por historia: `feature/DAYZ-14-impuestos`.
