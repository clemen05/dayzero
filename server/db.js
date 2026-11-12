// Lee data/dayzero.sqlite con sql.js (SQLite compilado a WebAssembly: no necesita compilar nada en Windows)
// y lo devuelve como un objeto { tabla: [filas] } que usa el motor de cálculo.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const TABLAS = [
  'fuente', 'moneda', 'pais', 'ciudad', 'tipo_cambio', 'zona', 'tipo_vivienda', 'alquiler',
  'ajuste_nuevo_contrato', 'fianza_legal', 'fiscal_tramo', 'fiscal_parametro', 'quellensteuer',
  'prima_seguro_ch', 'tarifa_transporte', 'cesta_producto', 'precio_cesta', 'permiso_trabajo',
  'tramite', 'coste_arranque', 'gasto_hogar', 'trayecto_zona', 'movilidad', 'council_tax',
];

// Algunos textos del dataset vienen con doble codificación UTF-8 («ChamartÃ­n»): se reparan al leer.
const MOJIBAKE = /[Â-Ã][\u0080-¿]/g;
function reparar(v) {
  if (typeof v !== 'string') return v;
  return v.replace(MOJIBAKE, (m) => {
    try { return Buffer.from(m, 'latin1').toString('utf8'); } catch (e) { return m; }
  });
}

async function cargarDatos(dbPath = process.env.DAYZERO_DB || path.join(__dirname, '..', 'data', 'dayzero.sqlite')) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const datos = {};
  for (const t of TABLAS) {
    const res = db.exec(`SELECT * FROM "${t}"`);
    if (!res.length) { datos[t] = []; continue; }
    const { columns, values } = res[0];
    datos[t] = values.map((row) => Object.fromEntries(columns.map((c, i) => [c, reparar(row[i])])));
  }
  db.close();
  return datos;
}

module.exports = { cargarDatos, TABLAS };
