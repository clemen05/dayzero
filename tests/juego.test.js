// Tests del motor de la semana (node --test)
const test = require('node:test');
const assert = require('node:assert');
const { cargarDatos } = require('../server/db');
const DZ = require('../shared/engine.js');
const J = require('../shared/juego.js');

const estado = (destino, extra = {}) => ({
  origen: destino === 'MAD' ? 'LON' : 'MAD', destino, edad: 28, vivienda: '1_dormitorio',
  trabajo: { modalidad: 'hibrido', dias: 3 }, nacionalidad: 'ue', dineroMudanza: 3000,
  sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: destino === 'MAD' ? 'GBP' : 'EUR' },
  sueldoOfrecido: { importe: 45000, tipo: 'bruto', pagas: 12, moneda: DZ.ciudad(destino).moneda_iso }, ...extra,
});
function jugar(p, salida = 'familia') {
  while (p.fase !== 'fin') {
    if (p.fase === 'sindinero') { J.aplicarSalida(p, J.salidasDisponibles(p).find((s) => s.id === salida && s.disponible) ? salida : 'tarjeta'); continue; }
    J.elegir(p, J.opcionesActuales(p).filter((o) => !o.bloqueada)[0].id); J.continuar(p);
  }
  return p;
}

test.before(async () => { globalThis.DZ_DATA = await cargarDatos(); });

test('HU-14 la semana tiene 7 días: 3 decisiones en los especiales y 2 en el resto', () => {
  const p = J.crearPartida({ estado: estado('LON'), seed: 1 });
  const dec = (d) => p.pasos.filter((x) => x.dia === d && x.tipo !== 'imprevisto').length;
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map(dec), [3, 2, 2, 2, 3, 3, 2]);
});

for (const c of ['MAD', 'LON', 'AMS', 'ZRH']) {
  test(`HU-17 ${c}: todas las opciones tienen precio real y los imprevistos no se repiten`, () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = J.crearPartida({ estado: estado(c), seed, colchon: 2000 });
      const peq = p.pasos.filter((x) => x.tipo === 'imprevisto');
      assert.ok(peq.length >= 2 && peq.length <= 3);
      assert.strictEqual(new Set(peq.map((x) => x.id)).size, peq.length);
      while (p.fase !== 'fin') {
        if (p.fase === 'sindinero') { J.aplicarSalida(p, 'tarjeta'); continue; }
        const ops = J.opcionesActuales(p);
        ops.forEach((o) => assert.ok(!o.coste.sinDato, `${J.pasoActual(p).id}/${o.id} sin precio en ${c}`));
        J.elegir(p, ops[seed % ops.length].id); J.continuar(p);
      }
    }
  });
}

test('HU-13 sin modo elegido se juega en historia', () => {
  assert.strictEqual(J.crearPartida({ estado: estado('AMS'), modo: null }).modo, 'historia');
  assert.strictEqual(J.crearPartida({ estado: estado('AMS'), modo: 'planificador' }).modo, 'planificador');
});

test('HU-15 bienestar inicial 60 u 80 y siempre entre 0 y 100', () => {
  assert.strictEqual(J.crearPartida({ estado: estado('AMS') }).bienestar, 60);
  const p = J.crearPartida({ estado: estado('AMS'), conoceAlguien: true });
  assert.strictEqual(p.bienestar, 80);
  p.bienestar = 99; J.elegir(p, J.opcionesActuales(p).sort((a, b) => b.b - a.b)[0].id); assert.strictEqual(p.bienestar, 100);
  J.continuar(p); p.bienestar = 2; J.elegir(p, 'publico'); assert.strictEqual(p.bienestar, 0);
});

test('HU-16 sin dinero: 4 salidas, penalización y anotación', () => {
  const p = J.crearPartida({ estado: estado('ZRH'), seed: 3, colchon: 100 });
  p.dinero = 1; J.elegir(p, J.opcionesActuales(p)[0].id); J.continuar(p);
  J.elegir(p, 'taxi'); J.continuar(p);
  assert.strictEqual(p.fase, 'sindinero');
  assert.deepStrictEqual(J.salidasDisponibles(p).map((s) => s.id), ['colchon', 'familia', 'tarjeta', 'recortar']);
  const b = p.bienestar; J.aplicarSalida(p, 'recortar');
  assert.strictEqual(p.bienestar, b - 12);
  assert.strictEqual(p.salidas[0].id, 'recortar');
  assert.ok(p.dinero < 0 && p.fase === 'decision');
  const ops = J.opcionesActuales(p);
  assert.ok(ops.filter((o) => !o.bloqueada).length >= 1 && ops.some((o) => o.bloqueada), 'con recorte solo se puede elegir lo más barato');
});

test('HU-20 esc. 1: dinero > 0 y bienestar >= 50 -> Sobreviviste', () => {
  const p = J.crearPartida({ estado: estado('MAD', { dineroMudanza: 20000 }) }); jugar(p);
  p.bienestar = 70; assert.strictEqual(J.veredicto(p), 'sobreviviste');
});
test('HU-20 esc. 2: bienestar < 50 o salida usada -> Por los pelos', () => {
  const p = J.crearPartida({ estado: estado('MAD', { dineroMudanza: 20000 }) }); jugar(p);
  p.bienestar = 45; assert.strictEqual(J.veredicto(p), 'pelos');
  p.bienestar = 80; p.salidas.push({ id: 'familia' }); assert.strictEqual(J.veredicto(p), 'pelos');
});
test('HU-20 esc. 3: dinero < 0 o bienestar < 20 -> La ciudad pudo contigo', () => {
  const p = J.crearPartida({ estado: estado('MAD') }); jugar(p);
  p.salidas = []; p.dinero = -1; p.bienestar = 90; assert.strictEqual(J.veredicto(p), 'pudo');
  p.dinero = 100; p.bienestar = 19; assert.strictEqual(J.veredicto(p), 'pudo');
});
test('HU-20 esc. 5: si se cumplen dos, se muestra el peor', () => {
  const p = J.crearPartida({ estado: estado('MAD') });
  p.dinero = -50; p.bienestar = 40; p.salidas = [{ id: 'tarjeta' }]; // cumple «pelos» y «pudo»
  assert.strictEqual(J.veredicto(p), 'pudo');
});
test('HU-20 esc. 4: encaje entre 0 y 100', () => {
  for (const c of ['MAD', 'LON', 'AMS', 'ZRH']) {
    const e = estado(c); const p = jugar(J.crearPartida({ estado: e, seed: 9, colchon: 500 }));
    const v = J.encaje(p, DZ.calcular(e)); assert.ok(v >= 0 && v <= 100 && Number.isInteger(v));
  }
});

test('HU-21 sueldo mínimo: con él, el número que duele es 0', () => {
  const e = estado('LON', { sueldoOfrecido: { importe: 30000, tipo: 'bruto', pagas: 12, moneda: 'GBP' } });
  assert.ok(DZ.calcular(e).diferencia < 0);
  const m = DZ.sueldoMinimo(e);
  assert.ok(Math.abs(DZ.calcular({ ...e, sueldoOfrecido: { ...e.sueldoOfrecido, importe: m.importe } }).diferencia) < 0.5);
  const en = estado('LON', { sueldoOfrecido: { importe: 20000, tipo: 'neto', pagas: 12, moneda: 'GBP' } });
  const mn = DZ.sueldoMinimo(en);
  assert.strictEqual(mn.tipo, 'neto');
  assert.ok(Math.abs(DZ.calcular({ ...en, sueldoOfrecido: { ...en.sueldoOfrecido, importe: mn.importe } }).diferencia) < 0.5);
});

test('HU-27 gastos reales: los números sustituyen y los huecos se marcan como estimados', () => {
  const R = DZ.calcular(estado('LON', { gastosOrigen: { alquiler: 750, transporte: null, comida: 300, facturas: '' } }));
  const p = Object.fromEntries(R.coste.origen.partidas.map((x) => [x.id, x.d]));
  assert.strictEqual(p.alquiler.v, 750); assert.ok(p.alquiler.usuario);
  assert.strictEqual(p.comida.v, 300);
  assert.ok(p.transporte.estimado && p.facturas.estimado);
});

test('HU-18 cifras permitidas: solo las del motor', () => {
  const p = J.crearPartida({ estado: estado('LON'), seed: 2 });
  J.elegir(p, J.opcionesActuales(p)[0].id); J.continuar(p); J.elegir(p, 'taxi');
  const c = J.cifrasPermitidas(p);
  assert.ok(c.includes('95') && c.includes(String(Math.round(p.dinero))));
  assert.ok(!c.includes('4321'));
});
