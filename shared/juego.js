/* DayZero · motor de la semana día cero (Sprint 2)
 * Funciones puras sobre el motor de cálculo (DZ). Igual en navegador y en Node.
 *
 * Una partida es un objeto serializable (se guarda en localStorage y en el servidor):
 *   { v, seed, modo, origen, destino, moneda, dia, cursor, fase, dinero, colchon, bienestar,
 *     recorte, deuda, pasos[], historial[], salidas[], piso, ultimo, ... }
 * Todas las cifras de dinero de la partida van en la moneda de la ciudad de destino.
 * Los precios salen siempre del dataset (DZ); los puntos de bienestar son la mecánica del juego.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DZJ = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const getDZ = () => (root.DZ || (typeof require === 'function' ? require('./engine.js') : null));

  // ---------- Estructura de la semana (HU-14) ----------
  const DIAS = [
    { n: 1, id: 'llegada', decisiones: ['piso', 'aeropuerto', 'cena'], especial: true },
    { n: 2, id: 'tramites', decisiones: ['tramite', 'sim'] },
    { n: 3, id: 'trabajo', decisiones: ['ida_trabajo', 'comida_trabajo'] },
    { n: 4, id: 'vivienda', decisiones: ['firmar', 'amueblar'] },
    { n: 5, id: 'imprevisto', decisiones: ['cerrajero', 'cena_consuelo', 'desconectar'], especial: true },
    { n: 6, id: 'finde', decisiones: ['sabado', 'compra', 'domingo'], especial: true },
    { n: 7, id: 'balance', decisiones: ['abono', 'cierre'] },
  ];
  const IMPREVISTO_GORDO = 'I01'; // cerrajero de urgencia, fijo en el día 5 (HU-17)
  const CATALOGO_PEQUENOS = ['I02', 'I03', 'I04', 'I05', 'I06', 'I07'];
  const DIAS_IMPREVISTO = [2, 3, 4, 6, 7];
  const IMPREVISTO_BICI = 'I07'; // «te roban la bici»: solo si eliges ir en bici el día 3
  /* El imprevisto gordo del día 5 depende de la vivienda: en un piso compartido siempre hay
   * alguien dentro para abrirte, así que en vez del cerrajero se te rompe el móvil (I03). */
  const GORDOS = { cerrajero: 'I01', movil_roto: 'I03' };
  function gordoDe(vivienda) { return vivienda === 'habitacion' ? 'movil_roto' : 'cerrajero'; }
  const esGordo = (id) => Object.prototype.hasOwnProperty.call(GORDOS, id);

  // ---------- Azar con semilla (la partida se puede reconstruir igual) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function barajar(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- Utilidades de datos ----------
  function suma(DZ, datos, moneda, factor = 1) {
    if (datos.some((d) => !d || d.sinDato)) return DZ.sinDato(moneda, 'sin_precio');
    const fuentes = []; const vistos = new Set();
    datos.forEach((d) => d.fuentes.forEach((f) => { const k = f.fuente_id + (f.metodo || ''); if (!vistos.has(k)) { vistos.add(k); fuentes.push(f); } }));
    return DZ.dato(datos.reduce((s, d) => s + d.v, 0) * factor, moneda, fuentes);
  }
  const gratis = (DZ, m) => DZ.dato(0, m, []);

  // Billete sencillo urbano y bici compartida por ciudad (tarifa_transporte)
  function billete(DZ, c) {
    if (c === 'MAD') { const d = DZ.tarifaPor('MAD', /10 viajes/); return d.sinDato ? d : { ...d, v: d.v / 10 }; }
    if (c === 'LON') return DZ.tarifaPor('LON', /hora punta/);
    if (c === 'AMS') return DZ.tarifaPor('AMS', /1 hour ticket/);
    return DZ.tarifaPor('ZRH', /Billete sencillo/);
  }
  function bici(DZ, c) {
    if (c === 'MAD') return suma(DZ, [DZ.tarifaPor('MAD', /Contrato básico/)], 'EUR', 2);
    if (c === 'LON') return suma(DZ, [DZ.tarifaPor('LON', /Viaje sencillo, 30 min/)], 'GBP', 2);
    if (c === 'AMS') return DZ.tarifaPor('AMS', /Alquiler hasta 24 h/);
    return suma(DZ, [DZ.tarifaPor('ZRH', /B-Quick/)], 'CHF', 2);
  }
  function abono(DZ, c, edad) {
    if (c === 'MAD') return edad <= 25 ? DZ.tarifaPor('MAD', /Abono Joven/) : DZ.tarifaPor('MAD', /Abono 30 días zona A/);
    if (c === 'LON') return DZ.tarifaPor('LON', /Travelcard mensual zonas 1-2/, (t) => t.condicion === 'adulto');
    if (c === 'AMS') return DZ.tarifaPor('AMS', /GVB Vrij/);
    return DZ.tarifaPor('ZRH', /NetzPass/, (t) => (edad <= 24 ? /joven/.test(t.condicion) : t.condicion === 'adulto'));
  }
  function transportePublicoAeropuerto(DZ, c) {
    if (c === 'MAD') return { d: suma(DZ, [DZ.tarifaPor('MAD', /10 o más estaciones/), DZ.tarifaPor('MAD', /Suplemento aeropuerto/)], 'EUR') };
    return { d: billete(DZ, c), nota: 'tarifa_urbana' };
  }

  // ---------- Opciones de cada decisión ----------
  // Cada opción: { id, coste: Dato (moneda destino), b: puntos de bienestar, efecto?, nota? }
  function opcionesDecision(p, id) {
    const DZ = getDZ(); const c = p.destino; const m = p.moneda;
    const P = (pid) => DZ.precioCesta(pid, c);
    const g = () => gratis(DZ, m);
    switch (id) {
      case 'piso': {
        const op = DZ.opcionesPiso(c, p.vivienda);
        return op.pisos.map((x) => ({
          id: x.zona.zona_id, coste: g(), b: x.zona.centro_o_afueras === 'centro' ? 6 : x.zona.centro_o_afueras === 'mixto' ? 3 : 0,
          piso: { zona: x.zona.zona_id, zonaNombre: x.zona.nombre, centro: x.zona.centro_o_afueras, alquiler: x.alquiler, trayecto: x.trayecto.v, trayectoDato: x.trayecto, tipo: x.tipo },
          efecto: { piso: true },
        }));
      }
      case 'aeropuerto': {
        const pub = transportePublicoAeropuerto(DZ, c);
        return [
          { id: 'taxi', coste: DZ.precioImprevisto('I09', c), b: 6 },
          { id: 'publico', coste: pub.d, b: -4, nota: pub.nota },
        ];
      }
      case 'cena': case 'cena_consuelo':
        return [
          { id: 'restaurante', coste: suma(DZ, [P('P18'), P('P17')], m), b: 6 },
          { id: 'super', coste: suma(DZ, [P('P01'), P('P03'), P('P05'), P('P07'), P('P14')], m), b: 0 },
          { id: 'rapida', coste: P('P19'), b: 2 },
        ].filter((o) => id === 'cena' || o.id !== 'rapida');
      case 'tramite': {
        const lineas = DZ.visadoYTramites(c, p.nacionalidad).filter((l) => l.id === 'tramite' && !l.d.sinDato);
        const coste = lineas.length ? suma(DZ, lineas.map((l) => l.d), m) : g();
        return [
          { id: 'hoy', coste, b: -3, etiqueta: lineas.map((l) => l.etiqueta).join(' + ') },
          { id: 'posponer', coste: g(), b: -8, efecto: { pendiente: 'tramite' } },
        ];
      }
      case 'sim':
        return [{ id: 'sim', coste: P('P22'), b: 4 }, { id: 'roaming', coste: g(), b: -5 }];
      case 'ida_trabajo': {
        if (p.trabajo && p.trabajo.modalidad === 'remoto') {
          return [{ id: 'cafe', coste: P('P16'), b: 3 }, { id: 'casa', coste: g(), b: -1 }];
        }
        const lejos = p.piso && p.piso.trayecto > 30;
        return [
          { id: 'publico', coste: suma(DZ, [billete(DZ, c)], m, 2), b: 0 },
          { id: 'bici', coste: bici(DZ, c), b: lejos ? -2 : 4 },
        ];
      }
      case 'comida_trabajo':
        return [{ id: 'menu', coste: P('P15'), b: 5 }, { id: 'tupper', coste: suma(DZ, [P('P05'), P('P07')], m), b: -1 }];
      case 'firmar': {
        const alq = p.piso ? p.piso.alquiler : DZ.alquiler(`${c}-00`, p.vivienda);
        const f = DZ.fianza(c, alq.v);
        return [
          { id: 'pagar', coste: suma(DZ, [alq, f], m), b: 8 },
          { id: 'plazos', coste: f.sinDato ? f : suma(DZ, [alq, { ...f, v: f.v / 2 }], m), b: -4, efecto: { pendiente: 'fianza' } },
        ];
      }
      case 'amueblar':
        return [{ id: 'kit', coste: DZ.kitCasa(c), b: 6 }, { id: 'apanarte', coste: g(), b: -6 }];
      case 'movil_roto':
        return [
          { id: 'reparar', coste: DZ.precioImprevisto(GORDOS.movil_roto, c), b: -2 },
          { id: 'aguantar', coste: g(), b: -8 },
        ];
      case 'cerrajero':
        return [
          { id: 'urgencia', coste: DZ.precioImprevisto(IMPREVISTO_GORDO, c), b: -2 },
          { id: 'esperar', coste: g(), b: p.conoceAlguien ? -4 : -10 },
        ];
      case 'desconectar':
        return [{ id: 'gimnasio', coste: P('P20'), b: 6 }, { id: 'correr', coste: g(), b: 3 }, { id: 'series', coste: g(), b: -2 }];
      case 'sabado':
        return [{ id: 'cine', coste: P('P21'), b: 5 }, { id: 'cervezas', coste: suma(DZ, [P('P17')], m, 3), b: 10 }, { id: 'casa', coste: g(), b: -6 }];
      case 'compra':
        return [
          { id: 'semanal', coste: suma(DZ, ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'P14'].map(P), m), b: 2 },
          { id: 'rapida', coste: suma(DZ, [P('P19')], m, 3), b: -3 },
        ];
      case 'domingo':
        return [{ id: 'pelo', coste: P('P26'), b: 3 }, { id: 'pasear', coste: g(), b: 5 }, { id: 'llamar', coste: g(), b: 4 }];
      case 'abono':
        return [{ id: 'abono', coste: abono(DZ, c, p.edad), b: 3 }, { id: 'viajes', coste: g(), b: 0 }];
      case 'cierre':
        return [{ id: 'celebrar', coste: suma(DZ, [P('P18'), P('P17')], m), b: 6 }, { id: 'presupuesto', coste: g(), b: 3 }];
      // Imprevistos pequeños (HU-17)
      case 'I02': return [{ id: 'pagar', coste: DZ.precioImprevisto('I02', c), b: -2 }, { id: 'evitar', coste: g(), b: -7 }];
      case 'I03': return [{ id: 'pagar', coste: DZ.precioImprevisto('I03', c), b: 0 }, { id: 'evitar', coste: g(), b: -6 }];
      case 'I04': return [{ id: 'pagar', coste: DZ.precioImprevisto('I04', c), b: 2 }, { id: 'evitar', coste: g(), b: -8 }];
      case 'I05': return [{ id: 'pagar', coste: DZ.precioImprevisto('I05', c), b: -5 }];
      case 'I06': return [{ id: 'pagar', coste: DZ.precioImprevisto('I06', c), b: 2 }, { id: 'evitar', coste: g(), b: -4 }];
      case 'I07': return [{ id: 'pagar', coste: DZ.precioImprevisto('I07', c), b: 3 }, { id: 'evitar', coste: g(), b: -4 }];
      default: return [];
    }
  }

  // ---------- Crear la partida ----------
  /* ctx = { estado (entrada de DZ.calcular), modo: 'historia'|'planificador'|null, seed?, colchon (moneda origen), conoceAlguien } */
  function crearPartida(ctx, fx) {
    const DZ = getDZ(); fx = fx || DZ.tipos();
    const e = ctx.estado;
    const md = DZ.ciudad(e.destino).moneda_iso; const mo = DZ.ciudad(e.origen).moneda_iso;
    const seed = ctx.seed != null ? ctx.seed : Math.floor(Math.random() * 2 ** 31);
    const rnd = mulberry32(seed);
    const gordo = gordoDe(e.vivienda);
    const remoto = e.trabajo && e.trabajo.modalidad === 'remoto';
    // 2 o 3 imprevistos pequeños con precio en la ciudad de destino, en días distintos y sin repetir.
    // Nunca el mismo que el gordo del día 5, y el robo de la bici solo si puedes ir en bici (no en remoto).
    const disponibles = CATALOGO_PEQUENOS.filter((id) => id !== GORDOS[gordo] && !(remoto && id === IMPREVISTO_BICI)
      && !DZ.precioImprevisto(id, e.destino).sinDato);
    const cuantos = Math.min(disponibles.length, rnd() < 0.5 ? 2 : 3);
    const elegidos = barajar(disponibles, rnd).slice(0, cuantos);
    const dias = barajar(DIAS_IMPREVISTO, rnd);
    // La bici se elige el día 3, así que su robo va después (día 4, 6 o 7)
    const usados = new Set();
    const imprevistos = elegidos.slice().sort((a, b) => (b === IMPREVISTO_BICI) - (a === IMPREVISTO_BICI)).map((id) => {
      const dia = dias.find((d) => !usados.has(d) && (id !== IMPREVISTO_BICI || d > 3));
      usados.add(dia); return { id, dia };
    }).sort((a, b) => a.dia - b.dia);
    const pasos = [];
    DIAS.forEach((d) => {
      imprevistos.filter((x) => x.dia === d.n).forEach((x) => pasos.push({ dia: d.n, tipo: 'imprevisto', id: x.id }));
      d.decisiones.map((id) => (id === 'cerrajero' ? gordo : id))
        .forEach((id, i) => pasos.push({ dia: d.n, tipo: esGordo(id) ? 'imprevisto_gordo' : 'decision', id, orden: i }));
    });
    const dinero = DZ.convertir(Number(e.dineroMudanza) || 0, mo, md, fx);
    return {
      v: 1, seed, creada: new Date().toISOString(),
      modo: ctx.modo === 'planificador' ? 'planificador' : 'historia', // HU-13 esc. 2: por defecto, historia
      origen: e.origen, destino: e.destino, moneda: md, monedaOrigen: mo,
      vivienda: e.vivienda, trabajo: e.trabajo, edad: e.edad, nacionalidad: e.nacionalidad, conoceAlguien: !!ctx.conoceAlguien,
      dineroInicial: dinero, dinero, colchonInicial: DZ.convertir(Number(ctx.colchon) || 0, mo, md, fx),
      colchon: DZ.convertir(Number(ctx.colchon) || 0, mo, md, fx),
      bienestar: ctx.conoceAlguien ? 80 : 60, // HU-15 esc. 1
      recorte: false, deuda: 0, pendientes: [], salidaActiva: null,
      gordo, imprevistos, pasos, cursor: 0, fase: 'decision',
      historial: [], salidas: [], piso: null, ultimo: null,
    };
  }

  const pasoActual = (p) => p.pasos[p.cursor] || null;
  const diaActual = (p) => (pasoActual(p) ? pasoActual(p).dia : 7);

  /* Opciones del paso actual. Con «recortar gastos» solo queda disponible la opción más barata (HU-16). */
  function opcionesActuales(p) {
    const paso = pasoActual(p); if (!paso) return [];
    const ops = opcionesDecision(p, paso.id);
    if (p.recorte) {
      const conocidas = ops.filter((o) => !o.coste.sinDato);
      const min = Math.min(...conocidas.map((o) => o.coste.v));
      ops.forEach((o) => { o.bloqueada = !o.coste.sinDato && o.coste.v > min; });
    }
    return ops;
  }

  /* Elegir una opción: actualiza dinero y bienestar y deja la partida en fase «resultado» (HU-14 esc. 1, HU-13 esc. 3). */
  function elegir(p, opcionId) {
    if (p.fase !== 'decision') throw new Error('No hay ninguna decisión pendiente');
    const paso = pasoActual(p);
    const op = opcionesActuales(p).find((o) => o.id === opcionId);
    if (!op) throw new Error('Opción no válida');
    if (op.bloqueada) throw new Error('Opción bloqueada por el recorte de gastos');
    const coste = op.coste.sinDato ? 0 : op.coste.v;
    const antes = { dinero: p.dinero, bienestar: p.bienestar };
    p.dinero -= coste;
    p.bienestar = clamp(p.bienestar + op.b, 0, 100); // HU-15 esc. 2
    if (op.efecto && op.efecto.piso) p.piso = op.piso;
    if (op.efecto && op.efecto.pendiente) p.pendientes.push(op.efecto.pendiente);
    if (paso.id === 'ida_trabajo' && op.id !== 'bici') sinBici(p);
    const r = {
      dia: paso.dia, paso: paso.id, tipo: paso.tipo, opcion: op.id, coste, costeDato: op.coste,
      db: p.bienestar - antes.bienestar, dinero: p.dinero, bienestar: p.bienestar,
      zona: op.piso ? op.piso.zonaNombre : undefined, nota: op.nota,
    };
    p.historial.push(r);
    p.ultimo = r;
    p.fase = 'resultado';
    return r;
  }

  /* Si no vas en bici, el robo de la bici que estaba por venir se cambia por otro imprevisto
   * que no haya salido ya (o desaparece si no queda ninguno con precio en la ciudad). */
  function sinBici(p) {
    const i = p.pasos.findIndex((x, k) => k > p.cursor && x.tipo === 'imprevisto' && x.id === IMPREVISTO_BICI);
    if (i < 0) return;
    const DZ = getDZ();
    const yaSalen = new Set(p.pasos.map((x) => x.id));
    const otros = CATALOGO_PEQUENOS.filter((id) => id !== IMPREVISTO_BICI && id !== GORDOS[p.gordo || 'cerrajero']
      && !yaSalen.has(id) && !DZ.precioImprevisto(id, p.destino).sinDato);
    const imp = p.imprevistos.find((x) => x.id === IMPREVISTO_BICI);
    if (!otros.length) {
      p.pasos.splice(i, 1);
      p.imprevistos = p.imprevistos.filter((x) => x !== imp);
      return;
    }
    const nuevo = barajar(otros, mulberry32((p.seed ^ 0x5bd1e995) >>> 0))[0];
    p.pasos[i] = { ...p.pasos[i], id: nuevo };
    if (imp) imp.id = nuevo;
  }

  /* Pasar al siguiente paso. Si el dinero baja de 0 aparece «Sin dinero» (HU-16 esc. 1). */
  function continuar(p) {
    if (p.fase !== 'resultado') return p;
    p.cursor += 1;
    if (p.dinero < 0 && !p.recorte && p.salidaActiva) {
      // La salida elegida (familia o tarjeta) sigue cubriendo los gastos el resto de la semana
      const deficit = -p.dinero; const s = p.salidas.find((x) => x.id === p.salidaActiva);
      if (p.salidaActiva === 'tarjeta') p.deuda += deficit;
      p.dinero = 0; if (s) s.importe += deficit;
    }
    if (p.dinero < 0 && !p.recorte) p.fase = 'sindinero';
    else p.fase = p.cursor >= p.pasos.length ? 'fin' : 'decision';
    return p;
  }

  const SALIDAS = ['colchon', 'familia', 'tarjeta', 'recortar'];
  const PENALIZACION = { colchon: -5, familia: -10, tarjeta: -6, recortar: -12 };
  function salidasDisponibles(p) {
    return SALIDAS.map((id) => ({ id, b: PENALIZACION[id], disponible: id !== 'colchon' || p.colchon > 0 }));
  }
  /* Aplicar una salida de «Sin dinero» (HU-16 esc. 2): se aplica la penalización y se anota para el informe. */
  function aplicarSalida(p, id) {
    if (p.fase !== 'sindinero') throw new Error('No estás sin dinero');
    const s = salidasDisponibles(p).find((x) => x.id === id);
    if (!s || !s.disponible) throw new Error('Salida no disponible');
    const deficit = -p.dinero; let importe = 0;
    // Colchón: pasas todo el colchón a tu cuenta. Familia y tarjeta: cubren lo que falta y siguen
    // cubriendo los gastos el resto de la semana. Recortar: el dinero sigue en negativo y solo puedes
    // elegir la opción más barata hasta el día 7.
    if (id === 'colchon') { importe = p.colchon; p.colchon = 0; p.dinero += importe; }
    if (id === 'familia') { importe = deficit; p.dinero = 0; p.salidaActiva = 'familia'; }
    if (id === 'tarjeta') { importe = deficit; p.deuda += deficit; p.dinero = 0; p.salidaActiva = 'tarjeta'; }
    if (id === 'recortar') { p.recorte = true; p.salidaActiva = null; }
    const antes = p.bienestar;
    p.bienestar = clamp(p.bienestar + s.b, 0, 100);
    p.salidas.push({ id, dia: diaActual(p), importe, db: p.bienestar - antes });
    if (p.dinero < 0 && !p.recorte) p.fase = 'sindinero';
    else p.fase = p.cursor >= p.pasos.length ? 'fin' : 'decision';
    return p;
  }

  // ---------- HU-20 · Veredicto y puntuación de encaje ----------
  /* Reglas en orden de gravedad: si se cumplen dos, gana la peor (esc. 5). */
  function veredicto(p) {
    if (p.dinero < 0 || p.bienestar < 20) return 'pudo';
    if (p.bienestar < 50 || p.salidas.length > 0) return 'pelos';
    return 'sobreviviste';
  }
  /* Encaje 0-100: 40 % lo que te queda al mes frente a origen, 30 % bienestar final, 30 % dinero que conservas.
   * Cada salida de «Sin dinero» resta 10 puntos. */
  function encaje(p, calc) {
    let a = 50;
    if (calc && calc.diferencia != null && calc.neto.origen.netoMensual > 0) {
      a = clamp(50 + (calc.diferencia / calc.neto.origen.netoMensual) * 100, 0, 100);
    }
    const b = p.bienestar;
    const c = p.dineroInicial > 0 ? clamp((p.dinero / p.dineroInicial) * 100, 0, 100) : (p.dinero >= 0 ? 50 : 0);
    return Math.round(clamp(0.4 * a + 0.3 * b + 0.3 * c - 10 * p.salidas.length, 0, 100));
  }

  // ---------- HU-21 · Resumen de la semana ----------
  function resumen(p, calc) {
    const gasto = p.historial.reduce((s, h) => s + h.coste, 0);
    const porDia = DIAS.map((d) => ({ dia: d.n, id: d.id, gasto: p.historial.filter((h) => h.dia === d.n).reduce((s, h) => s + h.coste, 0) }));
    const imprevistos = p.historial.filter((h) => h.tipo !== 'decision').reduce((s, h) => s + h.coste, 0);
    const fuentes = new Set();
    p.historial.forEach((h) => (h.costeDato && h.costeDato.fuentes || []).forEach((f) => fuentes.add(f.fuente_id)));
    return {
      veredicto: veredicto(p), encaje: encaje(p, calc), gasto, gastoImprevistos: imprevistos, porDia,
      dineroFinal: p.dinero, bienestarFinal: p.bienestar, salidas: p.salidas, deuda: p.deuda, pendientes: p.pendientes,
      fuentes: [...fuentes],
    };
  }

  /* Cifras que la narración puede mencionar: solo las que salen del motor (HU-18 esc. 2). */
  function cifrasPermitidas(p) {
    const n = new Set([String(diaActual(p)), '7']);
    const add = (v) => { if (v == null || !Number.isFinite(v)) return; n.add(String(Math.round(v))); n.add(String(Math.round(Math.abs(v)))); };
    add(p.dinero); add(p.bienestar); add(p.dineroInicial);
    p.historial.forEach((h) => { add(h.coste); add(h.db); });
    if (p.piso) { add(p.piso.trayecto); add(p.piso.alquiler && p.piso.alquiler.v); }
    return [...n];
  }

  return {
    DIAS, IMPREVISTO_GORDO, IMPREVISTO_BICI, GORDOS, gordoDe, CATALOGO_PEQUENOS, SALIDAS, PENALIZACION,
    crearPartida, pasoActual, diaActual, opcionesActuales, opcionesDecision, elegir, continuar,
    salidasDisponibles, aplicarSalida, veredicto, encaje, resumen, cifrasPermitidas, mulberry32,
  };
});
