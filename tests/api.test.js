// Tests de la API REST (node --test). Levanta el servidor en un puerto libre.
const test = require('node:test');
const assert = require('node:assert');
const { cargarDatos } = require('../server/db');
const { crearApp } = require('../server/app');

let server; let base;
test.before(async () => {
  server = crearApp(await cargarDatos()).listen(0);
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

test('GET /api/ciudades devuelve las 4 ciudades', async () => {
  const r = await get('/api/ciudades');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((c) => c.id).sort(), ['AMS', 'LON', 'MAD', 'ZRH']);
});

test('Los textos mal codificados del SQLite se reparan', async () => {
  const r = await get('/api/datos');
  assert.ok(r.body.zona.some((z) => z.nombre === 'Chamartín'));
});

test('GET /api/neto España 30.000 €', async () => {
  const r = await get('/api/neto?pais=ES&bruto=30000');
  assert.strictEqual(Math.round(r.body.neto), 23452);
});

test('GET /api/neto valida los parámetros', async () => {
  assert.strictEqual((await get('/api/neto?pais=FR&bruto=1')).status, 400);
  assert.strictEqual((await get('/api/neto?pais=ES&bruto=0')).status, 400);
});

test('POST /api/calcular Madrid → Londres', async () => {
  const r = await post('/api/calcular', {
    origen: 'MAD', destino: 'LON', trabajo: { modalidad: 'hibrido', dias: 3 },
    sueldoActual: { importe: 30000, pagas: 14 }, sueldoOfrecido: { importe: 45000 },
  });
  assert.strictEqual(r.status, 200);
  assert.ok(typeof r.body.diferencia === 'number');
  assert.ok(r.body.arranque.lineas.some((l) => l.id === 'visado'));
});

test('POST /api/calcular rechaza la misma ciudad', async () => {
  const r = await post('/api/calcular', { origen: 'MAD', destino: 'MAD', sueldoActual: { importe: 1 }, sueldoOfrecido: { importe: 1 } });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.errores.includes('Elige dos ciudades distintas'));
});

test('GET /api/pisos devuelve 3 pisos', async () => {
  const r = await get('/api/pisos?ciudad=LON&tipo=estudio');
  assert.strictEqual(r.body.pisos.length, 3);
});

test('La web se sirve en /', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /<title>DayZero<\/title>/);
});
