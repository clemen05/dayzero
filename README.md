# DayZero

Web app que compara tu vida entre **Madrid, Londres, Ámsterdam y Zúrich**: sueldo neto, coste de vida, coste de instalarte y «el número que duele», con la fuente de cada cifra. Después se juega **la primera semana en la nueva ciudad**: 7 días, 17 decisiones con precios reales, imprevistos, narración, veredicto e informe, con cuentas para guardar las partidas.

Cubre las 14 historias del **Sprint 1** y las 15 del **Sprint 2** del proyecto DAYZ en Jira.

En producción: **https://dayzero-0ms1.onrender.com**

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

## Sprint 2: la semana día cero

| Historia | Qué hace | Dónde |
|---|---|---|
| HU-13 · DAYZ-21 | Modo historia (precio después) o planificador (precio antes); por defecto, historia | `public/js/app.js` · `vSemanaIntro` |
| HU-14 · DAYZ-22 | 7 días con 2 decisiones (3 en Llegada, Imprevisto gordo y Primer finde) | `shared/juego.js` · `DIAS`, `opcionesDecision` |
| HU-15 · DAYZ-23 | Dinero y bienestar siempre visibles, con el cambio +/– y límites 0-100 | `hud()` |
| HU-16 · DAYZ-24 | «Sin dinero» con 4 salidas (colchón, familia, tarjeta, recortar) | `aplicarSalida` |
| HU-17 · DAYZ-25 | 2-3 imprevistos al azar sin repetir + cerrajero fijo el día 5, con precio de la ciudad | `crearPartida` |
| HU-18 · DAYZ-26 | Narración del día con IA: ≤120 palabras, tu idioma, ciudad y decisión anterior; cifras inventadas → reserva | `server/narrador.js` |
| HU-19 · DAYZ-27 | Si la IA tarda más de 5 s o falla, texto de reserva sin mensaje de error | `server/narrador.js` |
| HU-20 · DAYZ-28 | Veredicto (el peor si se cumplen dos) y encaje de 0 a 100 | `veredicto`, `encaje` |
| HU-21 · DAYZ-29 | Informe: resumen, gasto de la semana, veredicto, fuentes y sueldo mínimo | `vInforme`, `DZ.sueldoMinimo` |
| HU-22 · DAYZ-30 | Cuenta con email; la partida jugada sin cuenta pasa a «Mis partidas» | `server/auth.js` |
| HU-23 · DAYZ-31 | 1 partida sin cuenta y 3 al día con cuenta | `POST /api/partidas/empezar` |
| HU-26 · DAYZ-34 | Entrar con Google o Microsoft (OpenID Connect) | `server/auth.js` |
| HU-27 · DAYZ-35 | Tus gastos reales de origen; los vacíos se marcan como «estimado» | `DZ.costeVida` |
| HU-28 · DAYZ-36 | Habitación compartida con precio y fuente, solo si hay dato | `tiposVivienda()` |
| HU-29 · DAYZ-37 | La partida se guarda sola: «Continuar partida» y «Empezar de cero» | `guardarEstado` |

Los precios de cada decisión salen siempre del dataset (taxi del aeropuerto, menú del día, cine, fianza legal, cerrajero…). Los puntos de bienestar son la mecánica del juego y están en `shared/juego.js`.

## Configuración (variables de entorno)

Todas son opcionales para programar en local. En Render se añaden en **Settings → Environment**. Hay un ejemplo comentado en `.env.example`.

| Variable | Para qué | Sin ella |
|---|---|---|
| `SESSION_SECRET` | Firmar las cookies de sesión | Las sesiones se pierden al reiniciar |
| `DATABASE_URL` | PostgreSQL para cuentas y partidas (Neon, Render Postgres…) | Archivo `storage/dayzero-store.json` (en Render se borra en cada despliegue) |
| `ANTHROPIC_API_KEY` | Narración con IA | Textos de reserva |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | «Continuar con Google» | El botón aparece desactivado |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | «Continuar con Microsoft» | El botón aparece desactivado |

URIs de redirección que hay que registrar en Google y en Microsoft:
`https://dayzero-0ms1.onrender.com/api/auth/google/callback` y `https://dayzero-0ms1.onrender.com/api/auth/microsoft/callback`
(en local, cambia el dominio por `http://localhost:3000`).

## Estructura

```
dayzero/
├── server.js              Punto de entrada (npm start)
├── server/
│   ├── app.js             Express: rutas de la API y archivos estáticos
│   └── db.js              Lee el SQLite y repara los textos mal codificados
│   ├── auth.js            Cuentas, sesiones, Google/Microsoft y límite de partidas
│   ├── narrador.js        Narración con IA y textos de reserva
│   └── store.js           Almacenamiento: PostgreSQL o archivo JSON
├── shared/
│   ├── engine.js          Motor de cálculo (servidor y navegador)
│   └── juego.js           Motor de la semana: días, decisiones, imprevistos, veredicto
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
| POST | `/api/narrar` | Narración de un día (IA o texto de reserva) |
| POST | `/api/partidas/empezar` | Comprueba el límite y registra el inicio de una partida |
| GET / POST | `/api/partidas` | Mis partidas (solo las del usuario con sesión) |
| POST | `/api/auth/registro` · `/api/auth/login` · `/api/auth/logout` | Cuenta con email |
| GET | `/api/auth/yo` | Usuario con sesión y proveedores configurados |
| GET | `/api/auth/google` · `/api/auth/microsoft` | Inicio de sesión con Google o Microsoft |

## Tests

```
npm test            # 49 tests: motores, API, narrador y almacenamiento (también PostgreSQL con pg-mem)
npx playwright install chromium   # solo la primera vez
npm run e2e         # 95 comprobaciones de los criterios de aceptación de Jira en un navegador real
                    # (43 del Sprint 1 y 52 del Sprint 2, con IA y Google simulados)
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
