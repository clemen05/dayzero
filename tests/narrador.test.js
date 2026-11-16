// Tests del narrador (HU-18 / HU-19)
const test = require('node:test');
const assert = require('node:assert');
const { validar, textoReserva, RESERVA, cifrasValidas } = require('../server/narrador');

test('HU-18 esc. 2: una cifra que no viene del motor invalida el texto', () => {
  assert.strictEqual(validar('En Londres pagas 4321 libras.', { ciudad: 'Londres', permitidas: ['95'] }), 'cifra_inventada');
  assert.strictEqual(validar('En Londres pagas 95 libras.', { ciudad: 'Londres', permitidas: ['95'] }), null);
  assert.ok(cifrasValidas('Te quedan 1.234 €', ['1234']));
});
test('HU-18 esc. 1: más de 120 palabras o sin la ciudad, se descarta', () => {
  assert.strictEqual(validar(Array(121).fill('palabra').join(' ') + ' Londres', { ciudad: 'Londres', permitidas: [] }), 'largo');
  assert.strictEqual(validar('Un día cualquiera.', { ciudad: 'Londres', permitidas: [] }), 'sin_ciudad');
});
test('Los textos de reserva cumplen las reglas en los dos idiomas', () => {
  const anterior = 'pedir pagar la fianza en dos plazos con tu casero de siempre';
  for (const lang of ['es', 'en']) {
    for (let d = 1; d <= 7; d++) {
      const t = textoReserva({ dia: d, lang, ciudad: 'Ámsterdam', anterior });
      assert.ok(t.split(/\s+/).length <= 120, `${lang} día ${d} demasiado largo`);
      assert.ok(t.includes('Ámsterdam') && t.includes(anterior));
      assert.ok(!/\d/.test(RESERVA[lang][d]), `${lang} día ${d} tiene cifras`);
    }
  }
});
test('HU-19: sin clave de IA se usa el texto de reserva sin error', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { narrar } = require('../server/narrador');
  const r = await narrar({ dia: 2, lang: 'es', ciudad: 'Zúrich', anterior: 'un taxi', permitidas: [] });
  assert.strictEqual(r.fuente, 'reserva'); assert.ok(r.texto.includes('Zúrich'));
});
