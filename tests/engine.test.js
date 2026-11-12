// Tests del motor: node --test tests/
// HU-06: 3 casos por país (12 en total). `ref_oficial` se rellena con el resultado de la
// calculadora oficial de cada país; mientras esté a null, el test comprueba el valor de regresión.
const test = require('node:test');
const assert = require('node:assert');
require('../src/data.js');
const DZ = require('../src/engine.js');

const casos = require('./casos_fiscales.json');

for (const c of casos) {
  test(`HU-06 ${c.pais} ${c.bruto}`, () => {
    const r = DZ.netoAnual(c.pais, c.bruto, { edad: 30 });
    const ref = c.ref_oficial ?? c.regresion;
    const margen = Math.abs(r.neto - ref) / ref;
    assert.ok(margen <= 0.01, `neto ${Math.round(r.neto)} frente a ${ref} (${(margen * 100).toFixed(2)} %)`);
  });
}

test('HU-06 España 30.000 €: cálculo a mano de la cuota', () => {
  // SS 6,5 % = 1.950; base liquidable 26.050; estatal 2.463,00; Madrid 2.135,02
  const r = DZ.netoAnual('ES', 30000);
  assert.strictEqual(Math.round(r.neto), 23452);
});

test('HU-06 Reino Unido 100.000 £: Income Tax y NI conocidos', () => {
  const r = DZ.netoAnual('GB', 100000);
  assert.strictEqual(Math.round(r.partidas[0].v), 27432);
  assert.ok(Math.abs(r.partidas[1].v - 4010) < 5);
});

test('HU-08 sin conversión entre ciudades en euros', () => {
  assert.strictEqual(DZ.convertir(100, 'EUR', 'EUR'), 100);
  const fx = DZ.tipos();
  assert.ok(Math.abs(DZ.convertir(100, 'EUR', 'GBP') - 100 * fx.GBP) < 1e-9);
});

test('HU-05 Ámsterdam usa el alquiler de Ámsterdam con su fecha', () => {
  const a = DZ.alquiler('AMS-00', '1_dormitorio');
  assert.strictEqual(a.moneda, 'EUR');
  assert.ok(a.v > 0);
  assert.ok(a.fuentes[0].periodo);
});

test('HU-05 dato que falta = sin dato, nunca un valor inventado', () => {
  const s = DZ.seguroMedico('AMS');
  assert.strictEqual(s.v, null);
  assert.ok(s.sinDato);
});

test('HU-24 híbrido 3 días usa 3 días de trayecto; remoto no tiene trayecto', () => {
  const h = DZ.transporte('MAD', { modalidad: 'hibrido', dias: 3 }, 30);
  assert.strictEqual(h.detalle.dias, 3);
  const r = DZ.transporte('MAD', { modalidad: 'remoto' }, 30);
  assert.strictEqual(r.v, 0);
});

test('HU-11 Madrid→Londres incluye visado y no se recupera si queda 0 o menos', () => {
  const base = {
    origen: 'MAD', destino: 'LON', edad: 30, vivienda: '1_dormitorio', nacionalidad: 'ue', dineroMudanza: 3000,
    trabajo: { modalidad: 'hibrido', dias: 3 },
    sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: 'EUR' },
    sueldoOfrecido: { importe: 20000, tipo: 'bruto', pagas: 12, moneda: 'GBP' },
  };
  const R = DZ.calcular(base);
  assert.ok(R.arranque.lineas.some((l) => l.id === 'visado' && l.dLocal.v === 819));
  assert.ok(R.queda.destino <= 0);
  assert.strictEqual(R.recupera, false);
});
