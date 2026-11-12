// Punto de entrada: npm start  ->  http://localhost:3000
const { cargarDatos } = require('./server/db');
const { crearApp } = require('./server/app');

const PORT = Number(process.env.PORT) || 3000;

cargarDatos()
  .then((datos) => {
    const app = crearApp(datos);
    app.listen(PORT, () => {
      console.log(`\n  DayZero en marcha:  http://localhost:${PORT}`);
      console.log(`  API:                http://localhost:${PORT}/api/ciudades\n`);
    });
  })
  .catch((e) => {
    console.error('No se pudo abrir data/dayzero.sqlite:', e.message);
    process.exit(1);
  });
