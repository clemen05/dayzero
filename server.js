// Punto de entrada: npm start  ->  http://localhost:3000
const { cargarDatos } = require('./server/db');
const { crearApp } = require('./server/app');
const { crearStore } = require('./server/store');

const PORT = Number(process.env.PORT) || 3000;

Promise.all([cargarDatos(), (async () => { const s = crearStore(); await s.init(); return s; })()])
  .then(([datos, store]) => {
    const app = crearApp(datos, { store });
    console.log(`  Almacenamiento: ${store.tipo === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'archivo local storage/dayzero-store.json'}`);
    console.log(`  Narración con IA: ${process.env.ANTHROPIC_API_KEY ? 'activada' : 'textos de reserva (sin ANTHROPIC_API_KEY)'}`);
    app.listen(PORT, () => {
      console.log(`\n  DayZero en marcha:  http://localhost:${PORT}`);
      console.log(`  API:                http://localhost:${PORT}/api/ciudades\n`);
    });
  })
  .catch((e) => {
    console.error('No se pudo arrancar DayZero:', e.message);
    process.exit(1);
  });
