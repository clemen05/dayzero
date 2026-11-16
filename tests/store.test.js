// Tests del almacenamiento (archivo JSON y PostgreSQL con pg-mem)
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { storeArchivo, storePostgres } = require('../server/store');

async function probar(store) {
  await store.init();
  const a = await store.crearUsuario({ email: 'a@x.com', pass: 'h' });
  const b = await store.crearUsuario({ email: 'b@x.com', pass: 'h' });
  assert.strictEqual((await store.usuarioPorEmail('a@x.com')).id, a.id);
  await store.vincularProveedor(a.id, 'google', 'sub-1');
  assert.strictEqual((await store.usuarioPorProveedor('google', 'sub-1')).id, a.id);
  await store.guardarPartida(a.id, { resumen: { veredicto: 'pelos' } });
  assert.strictEqual((await store.partidasDe(a.id)).length, 1);
  assert.strictEqual((await store.partidasDe(b.id)).length, 0); // HU-22 esc. 2
  assert.strictEqual((await store.partidasDe(a.id))[0].datos.resumen.veredicto, 'pelos');
  await store.registrarInicio('u:a', '2026-11-16'); await store.registrarInicio('u:a', '2026-11-16'); await store.registrarInicio('u:a', '2026-11-15');
  assert.strictEqual(await store.contarInicios('u:a', '2026-11-16'), 2);
  assert.strictEqual(await store.contarInicios('u:a'), 3);
}

test('Almacén en archivo', async () => { await probar(storeArchivo(path.join(os.tmpdir(), `dz-store-${process.pid}.json`))); });
test('Almacén PostgreSQL', async () => {
  const { newDb } = require('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  await probar(storePostgres(null, new Pool()));
});
