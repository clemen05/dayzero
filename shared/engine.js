/* DayZero · motor de cálculo (Sprint 1)
 * Funciones puras sobre DZ_DATA. Sin DOM: se usa igual en el navegador y en Node (tests).
 *
 * Cada cifra que sale del motor es un "Dato":
 *   { v: número | null, moneda, fuentes: [Ref], nota?, sinDato?: true }
 * Ref = { fuente_id, periodo, origen_dato, metodo, url }
 * Si falta un dato, v = null y sinDato = true: nunca se inventa un valor (HU-05 esc. 2).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DZ = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const D = () => (typeof window !== 'undefined' ? window : globalThis).DZ_DATA;

  // ---------- Supuestos explícitos de la app (se muestran como tales en la interfaz) ----------
  const SUPUESTOS = {
    consumo_kwh_mes: 150, // consumo eléctrico de una persona en un piso pequeño
    semanas_mes: 52 / 12,
    anio_fiscal: 2026,
    anio_prima_ch: 2027, // la mudanza ocurre ya con primas 2027
    franquicia_ch: 300, // franquicia estándar del seguro básico suizo
    nbu_ch: 'max', // NBU: la fuente indica usar el máximo para estimar por arriba
  };

  const SECUNDARIA = new Set(['web_aproximado', 'portal_privado_aproximado', 'estimado', 'supuesto']);

  // ---------- Utilidades ----------
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const ref = (row, extra = {}) => ({
    fuente_id: row.fuente_id,
    periodo: row.periodo || row.fecha_dato || row.fecha || row.vigencia || row.anio || row.anio_fiscal || null,
    origen_dato: row.origen_dato || null,
    metodo: row.metodo || row.nota || null,
    url: row.url_dato || row.url || null,
    ...extra,
  });
  const dato = (v, moneda, fuentes, extra = {}) => ({ v, moneda, fuentes: fuentes.filter(Boolean), ...extra });
  const sinDato = (moneda, motivo) => ({ v: null, moneda, fuentes: [], sinDato: true, nota: motivo });

  function ciudad(id) { return D().ciudad.find((c) => c.ciudad_id === id); }
  function fuente(id) { return D().fuente.find((f) => f.fuente_id === id); }
  function esSecundaria(r) { return SECUNDARIA.has(r.origen_dato); }

  // ---------- HU-08 · Tipos de cambio (BCE) ----------
  function tipos() {
    const rows = D().tipo_cambio;
    const fecha = rows.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
    const out = { fecha, EUR: 1, fuente_id: 'BCE_FX' };
    rows.filter((r) => r.fecha === fecha).forEach((r) => { out[r.moneda_iso] = r.unidades_por_eur; });
    return out;
  }
  function convertir(v, de, a, fx = tipos()) {
    if (v == null) return null;
    if (de === a) return v;
    return (v / fx[de]) * fx[a];
  }
  function convertirDato(d, a, fx = tipos()) {
    if (!d || d.moneda === a) return d;
    return { ...d, v: convertir(d.v, d.moneda, a, fx), moneda: a, convertidoDe: d.moneda };
  }

  // ---------- HU-06 · Impuestos ----------
  function params(pais, anio = SUPUESTOS.anio_fiscal) {
    const p = {};
    D().fiscal_parametro.filter((r) => r.pais_iso2 === pais && r.anio === anio).forEach((r) => { p[r.clave] = r.valor; });
    return p;
  }
  function tramos(pais, concepto, anio = SUPUESTOS.anio_fiscal) {
    return D().fiscal_tramo.filter((r) => r.pais_iso2 === pais && r.concepto === concepto && r.anio === anio)
      .sort((a, b) => a.desde - b.desde);
  }
  function escala(base, ts) {
    let c = 0;
    for (const t of ts) {
      if (base <= t.desde) break;
      const tope = t.hasta == null ? base : Math.min(base, t.hasta);
      c += (tope - t.desde) * t.tipo_pct / 100;
    }
    return c;
  }
  const refsFiscal = (pais) => {
    const seen = new Map();
    D().fiscal_tramo.concat(D().fiscal_parametro).filter((r) => r.pais_iso2 === pais)
      .forEach((r) => { if (!seen.has(r.url)) seen.set(r.url, ref(r, { periodo: String(r.anio) })); });
    return [...seen.values()];
  };

  // España (Comunidad de Madrid), contrato indefinido, sin hijos ni otras circunstancias
  function netoES(bruto) {
    const p = params('ES');
    const tipoSS = p.cotizacion_contingencias_comunes + p.cotizacion_desempleo_indefinido
      + p.cotizacion_formacion_profesional + p.cotizacion_MEI;
    const baseSS = Math.min(Math.max(bruto, p.base_minima_grupos_4_7 * 12), p.base_maxima_cotizacion * 12);
    const ss = baseSS * tipoSS / 100;
    const rnPrevio = bruto - ss;
    let red = 0;
    if (rnPrevio <= p.reduccion_trabajo_umbral_1) red = p.reduccion_trabajo_max;
    else if (rnPrevio <= p.reduccion_trabajo_umbral_2) red = p.reduccion_trabajo_max - 1.75 * (rnPrevio - p.reduccion_trabajo_umbral_1);
    else if (rnPrevio <= p.reduccion_trabajo_umbral_3) red = 2364.34 - 1.14 * (rnPrevio - p.reduccion_trabajo_umbral_2);
    const base = Math.max(0, rnPrevio - p.gastos_deducibles_trabajo - red);
    const est = Math.max(0, escala(base, tramos('ES', 'IRPF_escala_general')) - escala(Math.min(base, p.minimo_personal), tramos('ES', 'IRPF_escala_general')));
    const aut = Math.max(0, escala(base, tramos('ES', 'IRPF_escala_autonomica')) - escala(Math.min(base, p.minimo_personal_autonomico), tramos('ES', 'IRPF_escala_autonomica')));
    const irpf = est + aut;
    return {
      bruto, neto: bruto - ss - irpf,
      partidas: [
        { id: 'ss_es', v: ss },
        { id: 'irpf_estatal', v: est },
        { id: 'irpf_madrid', v: aut },
      ],
    };
  }

  // Reino Unido (Inglaterra), año fiscal 2026-27
  function netoGB(bruto) {
    const p = params('GB');
    let pa = p.personal_allowance;
    if (bruto > p.personal_allowance_umbral_reduccion) pa = Math.max(0, pa - (bruto - p.personal_allowance_umbral_reduccion) / 2);
    const t = tramos('GB', 'Income_Tax_basic')[0];
    const h = tramos('GB', 'Income_Tax_higher')[0];
    const a = tramos('GB', 'Income_Tax_additional')[0];
    // Bandas sobre la renta imponible (bruto - Personal Allowance): básica 37.700 £; adicional desde 125.140 £
    const anchoBasic = t.hasta - t.desde;
    const imponible = Math.max(0, bruto - pa);
    const enBasic = Math.min(imponible, anchoBasic);
    const enHigher = Math.max(0, Math.min(imponible, a.desde) - anchoBasic);
    const enAdd = Math.max(0, imponible - a.desde);
    const tax = enBasic * t.tipo_pct / 100 + enHigher * h.tipo_pct / 100 + enAdd * a.tipo_pct / 100;
    // National Insurance Class 1: umbrales semanales del dataset (242 / 967 £), cálculo anual = semanal × 52
    const ni = tramos('GB', 'NI_Class1_empleado');
    const pt = ni[0].desde * 52; const uel = ni[0].hasta * 52;
    const niTotal = Math.max(0, Math.min(bruto, uel) - pt) * ni[0].tipo_pct / 100 + Math.max(0, bruto - uel) * ni[1].tipo_pct / 100;
    return {
      bruto, neto: bruto - tax - niTotal,
      partidas: [{ id: 'income_tax', v: tax }, { id: 'ni', v: niTotal }],
    };
  }

  // Países Bajos, Box 1 (incluye cotizaciones a la seguridad social nacional)
  function netoNL(bruto, opts = {}) {
    const p = params('NL');
    let imponible = bruto;
    let exento = 0;
    if (opts.expat30 && bruto >= p.regimen_expat_salario_minimo) {
      exento = bruto * p.regimen_expat_pct / 100;
      imponible = bruto - exento;
    }
    const bruta = escala(imponible, tramos('NL', 'Box1_inkomstenbelasting'));
    let ahk = p.algemene_heffingskorting_max;
    if (imponible > p.algemene_heffingskorting_umbral) ahk = Math.max(0, ahk - (imponible - p.algemene_heffingskorting_umbral) * p.algemene_heffingskorting_pct_reduccion / 100);
    const x = imponible;
    let ak;
    if (x <= p.arbeidskorting_t1_hasta) ak = x * p.arbeidskorting_t1_pct / 100;
    else if (x <= p.arbeidskorting_t2_hasta) ak = 996 + (x - p.arbeidskorting_t1_hasta) * p.arbeidskorting_t2_pct / 100;
    else if (x <= p.arbeidskorting_t3_hasta) ak = 5300 + (x - p.arbeidskorting_t2_hasta) * p.arbeidskorting_t3_pct / 100;
    else ak = Math.max(0, 5685 - (x - p.arbeidskorting_t3_hasta) * p.arbeidskorting_t4_pct_reduccion / 100);
    const creditos = Math.min(bruta, ahk + ak);
    const tax = bruta - creditos;
    return {
      bruto, neto: bruto - tax, expat30Aplicado: exento > 0,
      partidas: [
        { id: 'box1', v: bruta },
        { id: 'heffingskortingen', v: -creditos },
      ],
    };
  }

  // Suiza, ciudad de Zúrich: Quellensteuer tarifa A0N (soltero, sin hijos, sin iglesia)
  function netoCH(bruto, opts = {}) {
    const p = params('CH');
    const edad = opts.edad || 30;
    const ahv = bruto * p.cotizacion_AHV_IV_EO_empleado / 100;
    const alv = Math.min(bruto, p.ALV_tope_salarial) * p.cotizacion_ALV_empleado / 100;
    let bvg = 0;
    if (bruto >= p.BVG_umbral_entrada && edad >= 25) {
      const coord = Math.max(p.BVG_salario_coordinado_minimo, Math.min(bruto, p.BVG_limite_superior) - p.BVG_deduccion_coordinacion);
      const k = edad < 35 ? 'BVG_bonificacion_vejez_25-34' : edad < 45 ? 'BVG_bonificacion_vejez_35-44' : edad < 55 ? 'BVG_bonificacion_vejez_45-54' : 'BVG_bonificacion_vejez_55-65';
      bvg = coord * p[k] / 100 / 2; // el empleado paga la mitad (art. 66)
    }
    const nbu = bruto * (SUPUESTOS.nbu_ch === 'max' ? p.NBU_tipo_empleado_max : p.NBU_tipo_empleado_min) / 100;
    const mensual = bruto / 12;
    const q = D().quellensteuer.filter((r) => r.tarifa === 'A0N' && r.anio === SUPUESTOS.anio_fiscal)
      .find((r) => mensual >= r.ingreso_mensual_desde && mensual < r.ingreso_mensual_hasta + 1);
    const tipoQ = q ? q.tipo_pct : null;
    const qst = tipoQ == null ? null : bruto * tipoQ / 100;
    return {
      bruto, neto: qst == null ? null : bruto - ahv - alv - bvg - nbu - qst, tipoQST: tipoQ,
      partidas: [
        { id: 'ahv', v: ahv }, { id: 'alv', v: alv }, { id: 'bvg', v: bvg }, { id: 'nbu', v: nbu }, { id: 'qst', v: qst },
      ],
    };
  }

  const MOTOR = { ES: netoES, GB: netoGB, NL: netoNL, CH: netoCH };
  const FUENTE_FISCAL = { ES: 'MANUAL_OFICIAL', GB: 'MANUAL_OFICIAL', NL: 'MANUAL_OFICIAL', CH: 'ESTV_QST' };

  function netoAnual(pais, bruto, opts = {}) { return MOTOR[pais](bruto, opts); }

  /* HU-02 / HU-09 · sueldo del usuario -> neto en la ciudad
   * s = { importe (anual), tipo: 'bruto'|'neto', pagas: 12|14, moneda } */
  function sueldo(cityId, s, opts = {}, fx = tipos()) {
    const c = ciudad(cityId);
    const importeLocal = convertir(s.importe, s.moneda, c.moneda_iso, fx);
    let r;
    if (s.tipo === 'neto') {
      r = { bruto: null, neto: importeLocal, partidas: [], desdeNeto: true };
    } else {
      r = netoAnual(c.pais_iso2, importeLocal, opts);
    }
    const fuentes = s.tipo === 'neto' ? [] : refsFiscal(c.pais_iso2).slice(0, 3)
      .concat(c.pais_iso2 === 'CH' ? [{ fuente_id: 'ESTV_QST', periodo: '2026', origen_dato: 'oficial', metodo: 'Quellensteuer ZH tarifa A0N' }] : []);
    if (s.moneda !== c.moneda_iso) fuentes.push({ fuente_id: 'BCE_FX', periodo: fx.fecha, origen_dato: 'oficial', metodo: 'Conversión del importe introducido' });
    return {
      ...r,
      moneda: c.moneda_iso,
      pagas: s.pagas,
      netoMensual: r.neto == null ? null : r.neto / 12, // con extras prorrateadas
      netoPaga: r.neto == null ? null : r.neto / s.pagas, // paga normal
      fuentes,
    };
  }

  // ---------- HU-05 · Alquiler ----------
  const MENSUAL = (m) => /mensual/.test(m) && !/m2/.test(m) && !/superficie/.test(m);
  const OFERTA = (r) => /oferta|nuevos|habitacion_compartida/.test(r.mercado);

  function ajuste(cityId) { return D().ajuste_nuevo_contrato.find((a) => a.ciudad_id === cityId); }

  /* Precio de alquiler para quien llega ahora.
   * 1) Dato de oferta / nuevos inquilinos para ese tipo y zona.
   * 2) Si no hay, contratos vigentes × factor oficial de nuevo contrato (ajuste_nuevo_contrato). */
  function alquiler(zonaId, tipo) {
    const filas = D().alquiler.filter((r) => r.zona_id === zonaId && r.tipo_vivienda_id === tipo && MENSUAL(r.metrica));
    const cityId = zonaId.slice(0, 3);
    const moneda = ciudad(cityId).moneda_iso;
    const reciente = (a, b) => String(b.periodo).localeCompare(String(a.periodo));
    const of = filas.filter(OFERTA).sort(reciente);
    if (of.length) return dato(of[0].valor, of[0].moneda_iso, [ref(of[0])], { zona: zonaId, tipo });
    const vivos = filas.filter((r) => !OFERTA(r) && /contratos/.test(r.mercado)).sort(reciente);
    if (vivos.length) {
      const aj = ajuste(cityId);
      const f = aj ? aj.factor : 1;
      return dato(vivos[0].valor * f, vivos[0].moneda_iso, [ref(vivos[0]), aj && ref(aj, { metodo: `Factor nuevo contrato ×${aj.factor}: ${aj.numerador} / ${aj.denominador}` })], { zona: zonaId, tipo, factor: f });
    }
    return sinDato(moneda, 'sin_alquiler');
  }

  // ---------- HU-24 · Transporte ----------
  function tarifa(cityId, test, cond) {
    return D().tarifa_transporte.filter((t) => t.ciudad_id === cityId && test.test(t.producto) && (!cond || cond(t)))
      .sort((a, b) => a.precio - b.precio)[0];
  }
  function transporte(cityId, trabajo, edad = 30) {
    const moneda = ciudad(cityId).moneda_iso;
    if (trabajo.modalidad === 'remoto') {
      return dato(0, moneda, [], { detalle: { dias: 0 }, nota: 'remoto' });
    }
    const dias = trabajo.modalidad === 'oficina' ? 5 : Number(trabajo.dias);
    const joven = edad <= 24;
    let viaje, tope, abono;
    if (cityId === 'MAD') {
      const t10 = tarifa('MAD', /10 viajes/);
      viaje = { ...t10, precio: t10.precio / 10 };
      abono = edad <= 25 ? tarifa('MAD', /Abono Joven/) : tarifa('MAD', /Abono 30 días zona A/);
    } else if (cityId === 'LON') {
      viaje = tarifa('LON', /hora punta/);
      tope = tarifa('LON', /Tope diario/);
      abono = tarifa('LON', /Travelcard mensual zonas 1-2/, (t) => t.condicion === 'adulto');
    } else if (cityId === 'AMS') {
      viaje = tarifa('AMS', /1 hour ticket/);
      tope = tarifa('AMS', /Billete de día/);
      abono = tarifa('AMS', /GVB Vrij/);
    } else {
      viaje = tarifa('ZRH', /Billete sencillo/);
      abono = tarifa('ZRH', /NetzPass/, (t) => (joven ? /joven/.test(t.condicion) : t.condicion === 'adulto'));
    }
    const porDia = Math.min(2 * viaje.precio, tope ? tope.precio : Infinity);
    const sueltos = porDia * dias * SUPUESTOS.semanas_mes;
    const usaAbono = abono.precio <= sueltos;
    const v = usaAbono ? abono.precio : sueltos;
    const usadas = usaAbono ? [abono] : [viaje, tope].filter(Boolean);
    return dato(v, moneda, usadas.map((t) => ref(t)), {
      detalle: { dias, usaAbono, abono: abono.producto, viaje: viaje.producto, porDia, sueltos },
    });
  }

  // ---------- HU-10 · Coste de vida ----------
  function gasto(cityId, categoria) {
    return D().gasto_hogar.find((g) => g.ciudad_id === cityId && g.categoria === categoria && g.por_defecto === 'si');
  }
  function cesta(cityId, pid) { return D().precio_cesta.find((p) => p.ciudad_id === cityId && p.producto_id === pid); }

  function comida(cityId) {
    const a = gasto(cityId, 'alimentacion'); const b = gasto(cityId, 'comer_fuera');
    if (!a || !b) return sinDato(ciudad(cityId).moneda_iso, 'sin_gasto');
    return dato(a.valor_mensual + b.valor_mensual, a.moneda_iso, [ref(a), ref(b)], {
      detalle: { alimentacion: a.valor_mensual, comer_fuera: b.valor_mensual, ambito: a.ambito },
    });
  }

  function councilTaxLondres(soloVives) {
    const d = D().council_tax.filter((r) => r.banda === 'D');
    const vals = d.map((r) => r.importe_anual_gbp).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const fila = d.find((r) => r.importe_anual_gbp === med);
    const factor = soloVives ? 0.75 : 1;
    return { v: med * factor / 12, row: fila, factor };
  }

  function facturas(cityId, tipoVivienda) {
    const c = ciudad(cityId);
    const movil = cesta(cityId, 'P22'); const internet = cesta(cityId, 'P24'); const luz = cesta(cityId, 'P23');
    const lineas = [];
    const fuentes = [];
    const billsIncluidas = cityId === 'LON' && tipoVivienda === 'habitacion';
    if (movil) { lineas.push({ id: 'movil', v: movil.precio }); fuentes.push(ref(movil)); }
    if (!billsIncluidas) {
      if (internet) { lineas.push({ id: 'internet', v: internet.precio }); fuentes.push(ref(internet)); }
      if (luz) {
        lineas.push({ id: 'luz', v: luz.precio * SUPUESTOS.consumo_kwh_mes, kwh: SUPUESTOS.consumo_kwh_mes });
        fuentes.push(ref(luz), { fuente_id: 'APP', origen_dato: 'supuesto', metodo: `Consumo supuesto de ${SUPUESTOS.consumo_kwh_mes} kWh/mes`, periodo: null });
      }
      if (cityId === 'LON') {
        const ct = councilTaxLondres(true);
        lineas.push({ id: 'council_tax', v: ct.v });
        fuentes.push(ref(ct.row, { metodo: 'Banda D, mediana de los 33 distritos, con 25 % de descuento por vivir solo' }));
      }
    }
    return dato(sum(lineas.map((l) => l.v)), c.moneda_iso, fuentes, { lineas, billsIncluidas });
  }

  function seguroMedico(cityId, edad = 30) {
    const c = ciudad(cityId);
    if (c.pais_iso2 === 'CH') {
      const grupo = edad <= 25 ? '19-25' : '26+';
      const filas = D().prima_seguro_ch.filter((p) => p.anio === SUPUESTOS.anio_prima_ch && p.grupo_edad === grupo && p.franquicia_chf === SUPUESTOS.franquicia_ch);
      const vals = filas.map((p) => p.prima_mensual_chf).sort((a, b) => a - b);
      if (!vals.length) return sinDato('CHF', 'sin_prima');
      const med = vals[Math.floor(vals.length / 2)];
      return dato(med, 'CHF', [ref(filas[0], { periodo: String(SUPUESTOS.anio_prima_ch), metodo: `Mediana de ${vals.length} primas del seguro básico, ${grupo} años, franquicia ${SUPUESTOS.franquicia_ch} CHF, Stadt Zürich` })]);
    }
    if (c.pais_iso2 === 'NL') return sinDato('EUR', 'zorgverzekering');
    return null; // ES y GB: sanidad pública cubierta por las cotizaciones
  }

  function otros(cityId) {
    const a = gasto(cityId, 'ocio_cultura'); const b = gasto(cityId, 'ropa_calzado');
    if (!a || !b) return sinDato(ciudad(cityId).moneda_iso, 'sin_gasto');
    return dato(a.valor_mensual + b.valor_mensual, a.moneda_iso, [ref(a), ref(b)]);
  }

  /* HU-27: `reales` = gastos que el usuario ha escrito para esta ciudad, en su moneda
   * ({ alquiler, transporte, comida, facturas }). Un número sustituye al dato de la base de datos;
   * un hueco vacío usa el dato de la base de datos y se marca como «estimado». */
  const DATO_USUARIO = { fuente_id: 'USUARIO', origen_dato: 'usuario', metodo: 'Dato introducido por ti', periodo: null };
  function conReal(id, base, reales, moneda) {
    if (!reales) return base;
    const v = reales[id];
    if (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0) {
      return dato(Number(v), moneda, [DATO_USUARIO], { usuario: true });
    }
    return { ...base, estimado: true };
  }

  function costeVida(cityId, perfil, alquilerElegido, reales) {
    const m = ciudad(cityId).moneda_iso;
    const alq = alquilerElegido || alquiler(`${cityId}-00`, perfil.vivienda);
    const partidas = [
      { id: 'alquiler', d: conReal('alquiler', alq, reales, m) },
      { id: 'transporte', d: conReal('transporte', transporte(cityId, perfil.trabajo, perfil.edad), reales, m) },
      { id: 'comida', d: conReal('comida', comida(cityId), reales, m) },
      { id: 'facturas', d: conReal('facturas', facturas(cityId, perfil.vivienda), reales, m) },
    ];
    const sm = seguroMedico(cityId, perfil.edad);
    if (sm) partidas.push({ id: 'seguro_medico', d: sm });
    partidas.push({ id: 'otros', d: otros(cityId) });
    const conocidas = partidas.filter((p) => !p.d.sinDato);
    return {
      moneda: ciudad(cityId).moneda_iso,
      partidas,
      total: sum(conocidas.map((p) => p.d.v)),
      faltan: partidas.filter((p) => p.d.sinDato).map((p) => p.id),
    };
  }

  // ---------- HU-11 · Coste de arranque ----------
  function rutaArranque(concepto, o, d) {
    const rows = D().coste_arranque.filter((r) => r.concepto === concepto);
    return rows.find((r) => r.ciudad_origen_id === o && r.ciudad_destino_id === d)
      || rows.find((r) => r.ciudad_origen_id === d && r.ciudad_destino_id === o);
  }

  function grupoPermiso(paisDestino, nacionalidad) {
    if (paisDestino === 'GB') {
      if (nacionalidad === 'gb' || nacionalidad === 'ue_settled') return null;
      return nacionalidad === 'ue' ? 'UE_sin_settled_status' : 'no_UE';
    }
    if (nacionalidad === 'ue' || nacionalidad === 'ue_settled') return 'UE';
    return 'no_UE';
  }

  function ultimoNumero(txt, re) {
    if (!txt) return null;
    const m = [...txt.matchAll(re)];
    if (!m.length) return null;
    return Number(m[m.length - 1][1].replace(/\./g, '').replace(',', '.'));
  }

  function visadoYTramites(destId, nacionalidad) {
    const c = ciudad(destId);
    const grupo = grupoPermiso(c.pais_iso2, nacionalidad);
    const lineas = [];
    const tram = D().tramite.filter((t) => t.ciudad_id === destId);
    const pick = (re) => tram.find((t) => re.test(t.tramite));
    if (!grupo) {
      lineas.push({ id: 'sin_permiso', d: dato(0, c.moneda_iso, []), etiqueta: 'sin_permiso' });
      if (c.pais_iso2 === 'GB') { const ni = pick(/National Insurance/); lineas.push({ id: 'tramite', etiqueta: ni.tramite, d: dato(ni.coste, ni.moneda_iso, [ref(ni)]) }); }
      return lineas;
    }
    const permiso = D().permiso_trabajo.find((p) => p.pais_destino === c.pais_iso2 && p.grupo_nacionalidad === grupo);
    if (c.pais_iso2 === 'GB') {
      const fee = ultimoNumero(permiso.nota, /Tasa[^:]*:\s*([\d.]+)\s*£/g);
      lineas.push({ id: 'visado', etiqueta: permiso.tipo_permiso, d: fee != null ? dato(fee, 'GBP', [ref(permiso)]) : sinDato('GBP', 'tasa_visado') });
      const ni = pick(/National Insurance/);
      lineas.push({ id: 'tramite', etiqueta: ni.tramite, d: dato(ni.coste, ni.moneda_iso, [ref(ni)]) });
    } else if (c.pais_iso2 === 'ES') {
      if (grupo === 'UE') { const t = pick(/Certificado de registro/); lineas.push({ id: 'tramite', etiqueta: t.tramite, d: dato(t.coste, t.moneda_iso, [ref(t)]) }); }
      else {
        const t = pick(/790-052/);
        lineas.push({ id: 'visado', etiqueta: permiso.tipo_permiso, d: dato(t.coste, t.moneda_iso, [ref(t), ref(permiso)]) });
      }
    } else if (c.pais_iso2 === 'NL') {
      const t = pick(/BRP/);
      lineas.push({ id: 'tramite', etiqueta: t.tramite, d: dato(t.coste, t.moneda_iso, [ref(t)]) });
      if (grupo === 'no_UE') lineas.push({ id: 'visado', etiqueta: permiso.tipo_permiso, d: sinDato('EUR', 'tasa_visado') });
    } else if (c.pais_iso2 === 'CH') {
      if (grupo === 'UE') {
        const a = pick(/Anmeldung/); const b = pick(/Permiso B/);
        lineas.push({ id: 'tramite', etiqueta: a.tramite, d: dato(a.coste, a.moneda_iso, [ref(a)]) });
        lineas.push({ id: 'visado', etiqueta: b.tramite, d: dato(b.coste, b.moneda_iso, [ref(b)]) });
      } else {
        const fee = ultimoNumero(permiso.nota, /CHF\s*([\d.]+)/g);
        lineas.push({ id: 'visado', etiqueta: permiso.tipo_permiso, d: fee != null ? dato(fee, 'CHF', [ref(permiso)]) : sinDato('CHF', 'tasa_visado') });
      }
    }
    return lineas;
  }

  function fianza(destId, rentaMensual) {
    const c = ciudad(destId);
    const filas = D().fianza_legal.filter((f) => f.pais_iso2 === c.pais_iso2);
    let f;
    if (c.pais_iso2 === 'GB') f = filas.find((x) => (rentaMensual * 12 < 50000 ? /inferior/.test(x.condicion) : /o más/.test(x.condicion)));
    else if (c.pais_iso2 === 'ES') f = filas.find((x) => x.concepto === 'fianza_legal');
    else f = filas[0];
    if (!f || rentaMensual == null) return sinDato(c.moneda_iso, 'sin_fianza');
    const v = f.unidad === 'semanas_renta' ? rentaMensual * 12 / 52 * f.max_valor : rentaMensual * f.max_valor;
    return dato(v, c.moneda_iso, [ref(f, { metodo: `${f.base_legal}: ${f.max_valor} ${f.unidad.replace('_', ' ')} (${f.condicion})` })], { regla: f });
  }

  function costeArranque(origenId, destId, perfil, cvDestino, fx = tipos()) {
    const c = ciudad(destId);
    const m = c.moneda_iso;
    const L = [];
    // Viaje: el más barato entre vuelo y tren (si hay tren en la ruta)
    const vuelo = rutaArranque('vuelo_ida_tarifa_base', origenId, destId);
    const tren = rutaArranque('tren_ida_desde', origenId, destId);
    const opciones = [vuelo, tren].filter(Boolean).map((r) => ({ r, eur: convertir(r.valor, r.moneda_iso, 'EUR', fx) }));
    if (opciones.length) {
      const best = opciones.sort((a, b) => a.eur - b.eur)[0].r;
      L.push({ id: best.concepto === 'tren_ida_desde' ? 'tren' : 'vuelo', d: dato(best.valor, best.moneda_iso, [ref(best)]) });
    } else L.push({ id: 'vuelo', d: sinDato(m, 'sin_vuelo') });
    const maleta = D().coste_arranque.find((r) => r.concepto === 'maleta_facturada_aerolinea' && r.ciudad_destino_id === destId);
    if (maleta && (!opciones.length || L[0].id === 'vuelo')) L.push({ id: 'maleta', d: dato(maleta.valor, maleta.moneda_iso, [ref(maleta)]) });
    const mud = rutaArranque('mudanza_5_cajas_20kg', origenId, destId);
    L.push({ id: 'mudanza', d: mud ? dato(mud.valor, mud.moneda_iso, [ref(mud)]) : sinDato(m, 'sin_mudanza') });
    const alq = cvDestino.partidas.find((p) => p.id === 'alquiler').d;
    L.push({ id: 'fianza', d: fianza(destId, alq.v) });
    L.push({ id: 'primer_mes', d: alq.sinDato ? alq : dato(alq.v, alq.moneda, alq.fuentes) });
    L.push({ id: 'agencia', d: sinDato(m, 'agencia') });
    visadoYTramites(destId, perfil.nacionalidad).forEach((x) => L.push(x));
    const ikea = D().coste_arranque.find((r) => r.concepto === 'kit_ikea_entrada' && r.ciudad_destino_id === destId);
    if (ikea) L.push({ id: 'kit_casa', d: dato(ikea.valor, ikea.moneda_iso, [ref(ikea)]) });
    // Primeros gastos hasta la primera nómina: un mes de comida, transporte y facturas en destino
    const pg = cvDestino.partidas.filter((p) => ['comida', 'transporte', 'facturas'].includes(p.id) && !p.d.sinDato);
    L.push({ id: 'primeros_gastos', d: dato(sum(pg.map((p) => p.d.v)), m, pg.flatMap((p) => p.d.fuentes)) });

    const lineas = L.map((l) => ({ ...l, dLocal: l.d.sinDato ? l.d : convertirDato(l.d, m, fx) }));
    const total = sum(lineas.filter((l) => !l.dLocal.sinDato).map((l) => l.dLocal.v));
    return { moneda: m, lineas, total, faltan: lineas.filter((l) => l.dLocal.sinDato).map((l) => l.id) };
  }

  // ---------- HU-12 · El número que duele + resumen completo ----------
  function calcular(estado, fx = tipos()) {
    const { origen, destino } = estado;
    const opts = { edad: estado.edad, expat30: estado.expat30 };
    const perfil = { vivienda: estado.vivienda, trabajo: estado.trabajo, edad: estado.edad, nacionalidad: estado.nacionalidad };
    const no = sueldo(origen, estado.sueldoActual, opts, fx);
    const nd = sueldo(destino, estado.sueldoOfrecido, opts, fx);
    const cvo = costeVida(origen, perfil, estado.pisoOrigen, estado.gastosOrigen || null);
    const cvd = costeVida(destino, perfil, estado.piso ? estado.piso.alquiler : null);
    const mo = ciudad(origen).moneda_iso; const md = ciudad(destino).moneda_iso;
    const quedaO = no.netoMensual == null ? null : no.netoMensual - cvo.total;
    const quedaD = nd.netoMensual == null ? null : nd.netoMensual - cvd.total;
    const quedaDenO = convertir(quedaD, md, mo, fx);
    const diferencia = quedaO == null || quedaD == null ? null : quedaDenO - quedaO;
    const arr = costeArranque(origen, destino, perfil, cvd, fx);
    const meses = quedaD == null || quedaD <= 0 ? null : arr.total / quedaD;
    const dineroMudanzaD = convertir(estado.dineroMudanza || 0, mo, md, fx);
    return {
      fx, mo, md, neto: { origen: no, destino: nd }, coste: { origen: cvo, destino: cvd },
      queda: { origen: quedaO, destino: quedaD, destinoEnOrigen: quedaDenO },
      diferencia, arranque: arr, mesesRecuperar: meses, recupera: meses != null,
      ahorrosLlegan: dineroMudanzaD >= arr.total, dineroMudanzaD,
    };
  }

  /* HU-21 · Sueldo mínimo en destino con el que el número que duele sería 0.
   * Si el sueldo ofrecido es bruto, se busca el bruto anual por bisección sobre el motor fiscal;
   * si es neto, el neto anual necesario sale directo. Devuelve el importe en la moneda del sueldo ofrecido. */
  function sueldoMinimo(estado, fx = tipos()) {
    const base = calcular(estado, fx);
    if (base.diferencia == null) return null;
    const so = estado.sueldoOfrecido;
    const md = ciudad(estado.destino).moneda_iso;
    const necesarioNetoMensualD = base.neto.destino.netoMensual - convertir(base.diferencia, base.mo, md, fx);
    if (so.tipo === 'neto') {
      return { tipo: 'neto', importe: convertir(necesarioNetoMensualD * 12, md, so.moneda, fx), moneda: so.moneda };
    }
    const dif = (bruto) => calcular({ ...estado, sueldoOfrecido: { ...so, importe: bruto } }, fx).diferencia;
    let lo = 1; let hi = Math.max(so.importe, 1000);
    let guard = 0;
    while (dif(hi) < 0 && guard++ < 40) hi *= 1.5;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (dif(mid) < 0) lo = mid; else hi = mid; }
    return { tipo: 'bruto', importe: hi, moneda: so.moneda };
  }

  // ---------- Sprint 2 · Precios de imprevistos y de la cesta ----------
  function precioImprevisto(id, cityId) {
    const r = (D().precio_imprevisto || []).find((x) => x.imprevisto_id === id && x.ciudad_id === cityId);
    if (!r) return sinDato(ciudad(cityId).moneda_iso, 'sin_imprevisto');
    return dato(r.valor, r.moneda_iso, [ref(r)]);
  }
  function imprevisto(id) { return (D().imprevisto || []).find((x) => x.imprevisto_id === id); }
  function precioCesta(pid, cityId) {
    const r = cesta(cityId, pid);
    if (!r) return sinDato(ciudad(cityId).moneda_iso, 'sin_precio');
    return dato(r.precio, r.moneda_iso, [ref(r)]);
  }
  function tarifaPor(cityId, re, cond) {
    const t = tarifa(cityId, re, cond);
    return t ? dato(t.precio, ciudad(cityId).moneda_iso, [ref(t)], { producto: t.producto }) : sinDato(ciudad(cityId).moneda_iso, 'sin_tarifa');
  }
  function kitCasa(cityId) {
    const r = D().coste_arranque.find((x) => x.concepto === 'kit_ikea_entrada' && x.ciudad_destino_id === cityId);
    return r ? dato(r.valor, r.moneda_iso, [ref(r)]) : sinDato(ciudad(cityId).moneda_iso, 'sin_kit');
  }

  // ---------- HU-25 · Tres pisos reales en la ciudad destino ----------
  function opcionesPiso(destId, tipoPreferido) {
    const zonas = D().zona.filter((z) => z.ciudad_id === destId && z.nivel !== 'ciudad');
    const orden = [tipoPreferido, 'estudio', '1_dormitorio'].filter((x, i, a) => a.indexOf(x) === i);
    for (const tipo of orden) {
      const cands = zonas.map((z) => {
        const a = alquiler(z.zona_id, tipo);
        const t = D().trayecto_zona.find((x) => x.zona_id === z.zona_id);
        return a.sinDato ? null : { zona: z, alquiler: a, trayecto: t ? dato(t.minutos, 'min', [ref(t, { url: (D().movilidad.find((m) => m.movilidad_id === t.movilidad_id) || {}).url })]) : sinDato('min', 'sin_trayecto'), tipo };
      }).filter(Boolean).sort((a, b) => a.alquiler.v - b.alquiler.v);
      if (cands.length >= 3) {
        const picks = [cands[0], cands[Math.floor(cands.length / 2)], cands[cands.length - 1]];
        return { tipo, sustituido: tipo !== tipoPreferido, pisos: picks };
      }
    }
    return { tipo: tipoPreferido, pisos: [] };
  }

  return {
    SUPUESTOS, tipos, convertir, convertirDato, ciudad, fuente, esSecundaria,
    netoAnual, sueldo, alquiler, transporte, comida, facturas, seguroMedico, costeVida,
    costeArranque, fianza, visadoYTramites, calcular, opcionesPiso,
    sueldoMinimo, precioImprevisto, imprevisto, precioCesta, tarifaPor, kitCasa, dato, sinDato,
  };
});
