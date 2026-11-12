/* DayZero · interfaz (Sprint 1). Vanilla JS, sin dependencias. */
(function () {
  'use strict';
  const DZ = window.DZ; const I18N = window.DZ_I18N; const DATA = window.DZ_DATA;
  const $app = document.getElementById('app');

  // ---------- Estado ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const S = {
    lang: store.get('dz-lang') === 'en' ? 'en' : 'es',
    paso: 'inicio',
    origen: 'MAD', destino: 'LON',
    sueldoActual: { importe: '30000', tipo: 'bruto', pagas: 14, moneda: 'EUR' },
    sueldoOfrecido: { importe: '', tipo: 'bruto', pagas: 12, moneda: 'GBP' },
    expat30: false,
    dineroMudanza: '3000', colchon: '2000', conoceAlguien: false,
    nacionalidad: 'ue', edad: '28', vivienda: '1_dormitorio',
    trabajo: { modalidad: 'hibrido', dias: '3' },
    modoHistoria: true, piso: null, errores: {},
  };
  window.DZ_STATE = S; // útil para depurar y para los tests de interfaz

  // ---------- Utilidades ----------
  const t = (k, vars) => {
    let s = I18N[S.lang][k];
    if (s == null) s = I18N.es[k] != null ? I18N.es[k] : k;
    if (vars) Object.keys(vars).forEach((x) => { s = s.split(`{${x}}`).join(vars[x]); });
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => (S.lang === 'en' ? 'en-GB' : 'es-ES');
  const cname = (id) => { const c = DZ.ciudad(id); return S.lang === 'en' ? c.nombre_en : c.nombre_es; };
  const cur = (id) => DZ.ciudad(id).moneda_iso;
  const num = (x) => { const n = Number(String(x).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const money = (v, m, dec = 0) => (v == null || Number.isNaN(v) ? '—' : new Intl.NumberFormat(locale(), { style: 'currency', currency: m, currencyDisplay: 'narrowSymbol', maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v));
  const fecha = (iso) => { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—'; const [y, mo, d] = iso.split('-'); return `${d}/${mo}/${y}`; };
  const FX = DZ.tipos();
  const dosMonedas = () => cur(S.origen) !== cur(S.destino);

  // HU-08: importe en su moneda y, si las ciudades usan monedas distintas, también en la otra
  function dual(v, m, opts = {}) {
    if (v == null) return `<span class="nodata">${esc(t('sin_dato'))}</span>`;
    const main = `<span class="amt">${esc(money(v, m, opts.dec || 0))}</span>`;
    if (!dosMonedas()) return main;
    const otra = m === cur(S.origen) ? cur(S.destino) : cur(S.origen);
    return `${main}<span class="amt-alt">${esc(money(DZ.convertir(v, m, otra, FX), otra, opts.dec || 0))}</span>`;
  }

  // ---------- HU-07: registro de fuentes para el botón «i» ----------
  let refs = []; const usadas = new Set();
  function info(fuentes, extra) {
    if ((!fuentes || !fuentes.length) && !extra) return '';
    const id = refs.length; refs.push({ fuentes: fuentes || [], extra });
    (fuentes || []).forEach((f) => usadas.add(f.fuente_id));
    return `<button type="button" class="info" data-ref="${id}" aria-label="${esc(t('info_de'))}">i</button>`;
  }
  function badge(f) {
    if (f.origen_dato === 'supuesto') return `<span class="badge sup">${esc(t('supuesto'))}</span>`;
    if (DZ.esSecundaria(f)) return `<span class="badge sec">${esc(t('secundaria'))}</span>`;
    return `<span class="badge ofi">${esc(t('oficial'))}</span>`;
  }
  function abrirInfo(id) {
    const r = refs[id]; if (!r) return;
    const items = r.fuentes.map((f) => {
      const fu = DZ.fuente(f.fuente_id);
      const nombre = fu ? `${fu.nombre} · ${fu.organismo}` : t('supuesto');
      const url = f.url && /^https?:/.test(f.url.split(' ')[0]) ? f.url.split(' ;')[0].split(' ')[0] : fu && fu.url;
      return `<li>${badge(f)}<strong>${esc(nombre)}</strong>
        <div class="kv"><span>${esc(t('fecha'))}</span><span>${esc(fecha(f.periodo ? String(f.periodo) : '—'))}</span></div>
        ${f.metodo ? `<p class="met">${esc(f.metodo)}</p>` : ''}
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(t('enlace'))} ↗</a>` : ''}</li>`;
    }).join('');
    const sheet = document.getElementById('sheet');
    sheet.querySelector('.sheet-body').innerHTML = `${r.extra ? `<p class="sd">${esc(r.extra)}</p>` : ''}<ul class="srcs">${items}</ul>`;
    sheet.hidden = false;
    sheet.querySelector('.sheet-close').focus();
  }

  // ---------- Validación ----------
  function validar(paso) {
    const e = {};
    if (paso === 'inicio' && S.origen === S.destino) e.ciudades = t('err_mismas');
    if (paso === 'sueldo') {
      if (!(num(S.sueldoActual.importe) > 0)) e.sa = t('err_sueldo');
      if (!(num(S.sueldoOfrecido.importe) > 0)) e.so = t('err_sueldo');
    }
    if (paso === 'situacion') {
      if (!(num(S.dineroMudanza) >= 0)) e.dm = t('err_dinero');
      if (!(num(S.colchon) >= 0)) e.co = t('err_dinero');
      const ed = num(S.edad); if (!(ed >= 18 && ed <= 70)) e.ed = t('err_edad');
    }
    if (paso === 'trabajo' && S.trabajo.modalidad === 'hibrido') {
      const d = num(S.trabajo.dias); if (!(d >= 1 && d <= 4)) e.dias = t('err_dias');
    }
    S.errores = e; return !Object.keys(e).length;
  }
  const err = (k) => (S.errores[k] ? `<p class="err" role="alert">${esc(S.errores[k])}</p>` : '');

  // ---------- Pantallas ----------
  const ORDEN = ['inicio', 'sueldo', 'situacion', 'trabajo'];
  function opcionesCiudad(sel) {
    return DATA.ciudad.map((c) => `<option value="${c.ciudad_id}" ${c.ciudad_id === sel ? 'selected' : ''}>${esc(S.lang === 'en' ? c.nombre_en : c.nombre_es)}</option>`).join('');
  }
  function ruta() {
    if (S.paso === 'inicio') return '';
    return `<div class="route" aria-label="${esc(cname(S.origen))} → ${esc(cname(S.destino))}">
      <span class="code">${S.origen}</span><span class="city">${esc(cname(S.origen))}</span>
      <span class="arrow" aria-hidden="true"></span>
      <span class="code">${S.destino}</span><span class="city">${esc(cname(S.destino))}</span></div>`;
  }
  function pasoLabel() { const i = ORDEN.indexOf(S.paso); return i < 0 ? '' : `<p class="eyebrow">${esc(t('step', { n: i + 1 }))}</p>`; }
  const nav = (sig, txt) => `<div class="nav">${S.paso !== 'inicio' ? `<button type="button" class="ghost" data-act="atras">${esc(t('atras'))}</button>` : '<span></span>'}<button type="submit" class="primary" data-sig="${sig}">${esc(txt || t('siguiente'))}</button></div>`;

  function vInicio() {
    return `<form class="card step" data-paso="inicio" novalidate>
      ${pasoLabel()}<h1>${esc(t('h_inicio'))}</h1><p class="lead">${esc(t('p_inicio'))}</p>
      <div class="pair">
        <label class="field"><span>${esc(t('origen'))}</span><select id="origen" data-bind="origen">${opcionesCiudad(S.origen)}</select></label>
        <button type="button" class="swap" data-act="swap" aria-label="⇄">⇄</button>
        <label class="field"><span>${esc(t('destino'))}</span><select id="destino" data-bind="destino">${opcionesCiudad(S.destino)}</select></label>
      </div>${err('ciudades')}
      ${nav('sueldo', t('empezar'))}</form>`;
  }

  function campoSueldo(key, cityId, label, ek) {
    const s = S[key]; const m = cityId;
    const otra = key === 'sueldoActual' ? S.destino : S.origen;
    const n = num(s.importe);
    // HU-02 esc. 1: el sueldo se muestra en la moneda de cada ciudad
    const conv = n > 0 ? [cityId, otra].filter((c) => cur(c) !== s.moneda)
      .filter((c, i, a) => a.findIndex((x) => cur(x) === cur(c)) === i)
      .map((c) => esc(t('equivale', { c: cname(c), v: money(DZ.convertir(n, s.moneda, cur(c), FX), cur(c)) }))).join(' · ') : '';
    const monedas = [...new Set([cur(S.origen), cur(S.destino), 'EUR'])];
    return `<fieldset class="salary"><legend>${esc(t(label, { c: cname(m) }))}</legend>
      <div class="row">
        <label class="field grow"><span>${esc(t('importe_anual'))}</span><input id="${key}-importe" inputmode="decimal" data-bind="${key}.importe" value="${esc(s.importe)}" autocomplete="off"></label>
        <label class="field"><span>${esc(t('moneda'))}</span><select id="${key}-moneda" data-bind="${key}.moneda">${monedas.map((x) => `<option ${x === s.moneda ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <div class="seg" role="radiogroup">${['bruto', 'neto'].map((x) => `<label><input type="radio" name="${key}-tipo" id="${key}-tipo-${x}" data-bind="${key}.tipo" value="${x}" ${s.tipo === x ? 'checked' : ''}><span>${esc(t(x))}</span></label>`).join('')}</div>
        <div class="seg" role="radiogroup">${[12, 14].map((x) => `<label><input type="radio" name="${key}-pagas" id="${key}-pagas-${x}" data-bind="${key}.pagas" value="${x}" ${Number(s.pagas) === x ? 'checked' : ''}><span>${esc(t('pagas_' + x))}</span></label>`).join('')}</div>
      </div>
      <p class="hint" data-conv="${key}">${conv}</p>${err(ek)}</fieldset>`;
  }

  function vSueldo() {
    const nlMin = DATA.fiscal_parametro.find((p) => p.clave === 'regimen_expat_salario_minimo' && p.anio === 2026);
    return `<form class="card step" data-paso="sueldo" novalidate>${pasoLabel()}<h1>${esc(t('h_sueldo'))}</h1><p class="lead">${esc(t('p_sueldo'))}</p>
      ${campoSueldo('sueldoActual', S.origen, 'sueldo_actual', 'sa')}
      ${campoSueldo('sueldoOfrecido', S.destino, 'sueldo_ofrecido', 'so')}
      ${S.destino === 'AMS' || S.origen === 'AMS' ? `<label class="check"><input type="checkbox" id="expat30" data-bind="expat30" ${S.expat30 ? 'checked' : ''}><span>${esc(t('expat30'))}<small>${esc(t('expat30_ayuda', { v: money(nlMin.valor, 'EUR') }))}</small></span></label>` : ''}
      ${nav('situacion')}</form>`;
  }

  function vSituacion() {
    const mo = cur(S.origen);
    const nac = ['ue', 'ue_settled', 'gb', 'no_ue'];
    return `<form class="card step" data-paso="situacion" novalidate>${pasoLabel()}<h1>${esc(t('h_situacion'))}</h1><p class="lead">${esc(t('p_situacion'))}</p>
      <div class="grid2">
        <label class="field"><span>${esc(t('dinero_mudanza'))} (${mo})</span><input id="dineroMudanza" inputmode="decimal" data-bind="dineroMudanza" value="${esc(S.dineroMudanza)}">${err('dm')}</label>
        <label class="field"><span>${esc(t('colchon'))} (${mo})</span><input id="colchon" inputmode="decimal" data-bind="colchon" value="${esc(S.colchon)}"><small>${esc(t('colchon_ayuda'))}</small>${err('co')}</label>
      </div>
      <label class="check"><input type="checkbox" id="conoceAlguien" data-bind="conoceAlguien" ${S.conoceAlguien ? 'checked' : ''}><span>${esc(t('conoce', { c: cname(S.destino) }))}<small>${esc(t('conoce_ayuda'))}</small></span></label>
      <div class="grid2">
        <label class="field"><span>${esc(t('nacionalidad'))}</span><select id="nacionalidad" data-bind="nacionalidad">${nac.map((n) => `<option value="${n}" ${S.nacionalidad === n ? 'selected' : ''}>${esc(t('nac_' + n))}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('edad'))}</span><input id="edad" inputmode="numeric" data-bind="edad" value="${esc(S.edad)}"><small>${esc(t('edad_ayuda'))}</small>${err('ed')}</label>
      </div>
      <fieldset class="plain"><legend>${esc(t('vivienda'))}</legend><div class="seg wide">${['habitacion', 'estudio', '1_dormitorio'].map((v) => `<label><input type="radio" name="vivienda" id="vivienda-${v}" data-bind="vivienda" value="${v}" ${S.vivienda === v ? 'checked' : ''}><span>${esc(t('tipo_viv')[v])}</span></label>`).join('')}</div></fieldset>
      ${nav('trabajo')}</form>`;
  }

  function vTrabajo() {
    return `<form class="card step" data-paso="trabajo" novalidate>${pasoLabel()}<h1>${esc(t('h_trabajo'))}</h1><p class="lead">${esc(t('p_trabajo'))}</p>
      <div class="seg wide">${['remoto', 'oficina', 'hibrido'].map((v) => `<label><input type="radio" name="modalidad" id="modalidad-${v}" data-bind="trabajo.modalidad" value="${v}" ${S.trabajo.modalidad === v ? 'checked' : ''}><span>${esc(t(v))}</span></label>`).join('')}</div>
      ${S.trabajo.modalidad === 'hibrido' ? `<fieldset class="plain"><legend>${esc(t('dias_oficina'))}</legend><div class="seg days">${[1, 2, 3, 4].map((d) => `<label><input type="radio" name="dias" id="dias-${d}" data-bind="trabajo.dias" value="${d}" ${String(S.trabajo.dias) === String(d) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>${err('dias')}</fieldset>` : ''}
      ${nav('resultado', t('ver_resultado'))}</form>`;
  }

  function estadoCalculo() {
    return {
      origen: S.origen, destino: S.destino, edad: num(S.edad), expat30: S.expat30,
      vivienda: S.vivienda, trabajo: { modalidad: S.trabajo.modalidad, dias: num(S.trabajo.dias) },
      nacionalidad: S.nacionalidad, dineroMudanza: num(S.dineroMudanza),
      sueldoActual: { ...S.sueldoActual, importe: num(S.sueldoActual.importe), pagas: Number(S.sueldoActual.pagas) },
      sueldoOfrecido: { ...S.sueldoOfrecido, importe: num(S.sueldoOfrecido.importe), pagas: Number(S.sueldoOfrecido.pagas) },
      piso: S.piso,
    };
  }

  function bloqueNeto(cityId, n) {
    const m = n.moneda;
    const desglose = n.desdeNeto ? `<p class="hint">${esc(t('desde_neto'))}</p>` : `<details><summary>${esc(t('ver_desglose'))}</summary><dl class="kvs">
      <dt>${esc(t('bruto_anual'))}</dt><dd>${esc(money(n.bruto, m))}</dd>
      ${n.partidas.map((p) => `<dt>${esc(t('f_' + p.id))}${p.id === 'qst' && n.tipoQST != null ? ` (${n.tipoQST.toLocaleString(locale())} %)` : ''}</dt><dd>${p.v == null ? esc(t('sin_dato')) : '−' + esc(money(Math.abs(p.v), m))}</dd>`).join('')}
      <dt><strong>${esc(t('neto_anual'))}</strong></dt><dd><strong>${esc(money(n.neto, m))}</strong></dd></dl></details>`;
    return `<div class="col"><h3>${esc(cname(cityId))}</h3>
      <p class="big">${dual(n.netoMensual, m)} ${info(n.fuentes)}</p>
      <p class="hint">${esc(Number(n.pagas) === 14 ? t('neto_prorrateado') : t('neto_12'))}</p>
      ${Number(n.pagas) === 14 ? `<p class="hint strong">${esc(t('paga_normal', { v: money(n.netoPaga, m) }))}</p>` : ''}
      ${desglose}</div>`;
  }

  function motivo(d) {
    const k = 'sd_' + (d.nota || 'generico');
    return I18N[S.lang][k] ? t(k) : t('sd_generico');
  }
  function etiquetaPartida(p, cityId) {
    const d = p.d;
    if (p.id === 'transporte' && d.detalle) {
      if (d.nota === 'remoto') return `<small>${esc(t('tr_remoto'))}</small>`;
      return `<small>${esc(d.detalle.usaAbono ? t('tr_abono', { p: d.detalle.abono, d: d.detalle.dias }) : t('tr_sueltos', { d: d.detalle.dias }))}</small>`;
    }
    if (p.id === 'alquiler') { const conPiso = S.piso && cityId === S.destino; return `<small>${esc(t('tipo_viv')[conPiso ? S.piso.tipo : S.vivienda] || '')}${conPiso ? ' · ' + esc(S.piso.zonaNombre) : ''}</small>`; }
    return '';
  }

  function celda(d) {
    if (d.sinDato) return `<span class="nodata">${esc(t('sin_dato'))}</span> ${info([], motivo(d) + ' ' + t('no_incluido_total'))}`;
    return `${dual(d.v, d.moneda)} ${info(d.fuentes)}`;
  }

  function vResultado() {
    const R = DZ.calcular(estadoCalculo(), FX);
    const mo = R.mo; const md = R.md;
    let frase;
    if (R.diferencia == null) frase = t('duele_sin');
    else {
      const v = money(Math.abs(R.diferencia), mo);
      const k = Math.round(R.diferencia) < 0 ? 'duele_menos' : Math.round(R.diferencia) > 0 ? 'duele_mas' : 'duele_igual';
      frase = t(k, { d: cname(S.destino), o: cname(S.origen), v });
    }
    const signo = R.diferencia == null ? 'nil' : R.diferencia < 0 ? 'neg' : 'pos';
    // Coste de vida: filas alineadas por partida
    const ids = [...new Set(R.coste.origen.partidas.map((p) => p.id).concat(R.coste.destino.partidas.map((p) => p.id)))];
    const fila = (id) => {
      const po = R.coste.origen.partidas.find((p) => p.id === id); const pd = R.coste.destino.partidas.find((p) => p.id === id);
      return `<tr><th scope="row">${esc(t('p_' + id))}${etiquetaPartida(pd || po, pd ? S.destino : S.origen)}</th>
        <td>${po ? celda(po.d) : '<span class="muted">—</span>'}</td><td>${pd ? celda(pd.d) : '<span class="muted">—</span>'}</td></tr>`;
    };
    const arr = R.arranque;
    const meses = R.mesesRecuperar == null ? `<p class="verdict neg">${esc(t('no_recuperas'))}</p>`
      : `<p class="verdict">${esc(R.mesesRecuperar < 1 ? t('recuperas_1') : t('recuperas', { n: Math.ceil(R.mesesRecuperar).toLocaleString(locale()) }))}</p>`;
    const ahorros = R.ahorrosLlegan ? t('ahorros_si', { v: money(num(S.dineroMudanza), mo) })
      : t('ahorros_no', { v: money(num(S.dineroMudanza), mo), f: money(DZ.convertir(arr.total - R.dineroMudanzaD, md, mo, FX), mo) });
    const fxNota = dosMonedas() ? `<p class="fx">${esc(t('fx_nota', { f: fecha(FX.fecha), r: [cur(S.origen), cur(S.destino)].filter((x) => x !== 'EUR').map((x) => `${FX[x].toLocaleString(locale(), { maximumFractionDigits: 5 })} ${x}`).join(' · ') }))} ${info([{ fuente_id: 'BCE_FX', periodo: FX.fecha, origen_dato: 'oficial' }])}</p>` : '';
    const sup = [t('sup_fiscal'), t('sup_alquiler'), t('sup_luz', { k: DZ.SUPUESTOS.consumo_kwh_mes }), t('sup_vuelo')]
      .concat([S.origen, S.destino].includes('LON') ? [S.vivienda === 'habitacion' ? t('sup_lon_hab') : t('sup_council')] : [])
      .concat([S.origen, S.destino].includes('ZRH') ? [t('sup_ch_seguro'), t('sup_nbu')] : []);

    const html = `<section class="result">
      <div class="hero ${signo}">
        ${S.piso ? `<p class="eyebrow">${esc(t('con_piso', { z: S.piso.zonaNombre }))}</p>` : ''}
        <h1 class="ouch" id="numero-que-duele">${esc(frase)}</h1>
        <div class="legs">
          <div><span class="lbl">${esc(t('queda_mes'))} · ${esc(cname(S.origen))}</span><span class="v">${dual(R.queda.origen, mo)}</span></div>
          <div><span class="lbl">${esc(t('queda_mes'))} · ${esc(cname(S.destino))}</span><span class="v">${dual(R.queda.destino, md)}</span></div>
        </div>
        <div class="cta-row"><button type="button" class="primary big-btn" data-act="semana" id="btn-semana">${esc(t('vivir_semana'))}</button><button type="button" class="ghost" data-act="editar">${esc(t('editar'))}</button></div>
        ${fxNota}
      </div>

      <section class="panel" id="neto"><h2>${esc(t('h_neto'))}</h2><div class="cols">${bloqueNeto(S.origen, R.neto.origen)}${bloqueNeto(S.destino, R.neto.destino)}</div></section>

      <section class="panel" id="coste"><h2>${esc(t('h_coste'))}</h2>
        <div class="tablewrap"><table class="cost"><thead><tr><th></th><th scope="col">${esc(cname(S.origen))}</th><th scope="col">${esc(cname(S.destino))}</th></tr></thead>
        <tbody>${ids.map(fila).join('')}</tbody>
        <tfoot><tr><th scope="row">${esc(t('total'))}</th><td>${dual(R.coste.origen.total, mo)}</td><td>${dual(R.coste.destino.total, md)}</td></tr></tfoot></table></div></section>

      <section class="panel" id="arranque"><h2>${esc(t('h_arranque', { c: cname(S.destino) }))}</h2>
        <div class="tablewrap"><table class="cost single"><tbody>${arr.lineas.map((l) => `<tr><th scope="row">${esc(t('a_' + l.id))}${l.etiqueta && l.id !== 'sin_permiso' ? `<small>${esc(l.etiqueta)}</small>` : ''}</th><td>${celda(l.dLocal)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">${esc(t('total'))}</th><td>${dual(arr.total, md)}</td></tr></tfoot></table></div>
        ${meses}<p class="hint">${esc(ahorros)}</p></section>

      <section class="panel quiet"><h2>${esc(t('h_supuestos'))}</h2><ul class="sup">${sup.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
      <section class="panel quiet" id="atribuciones"><h2>${esc(t('h_fuentes'))}</h2><ul class="attr">__ATTR__</ul></section>
    </section>`;
    const attr = [...usadas].map((id) => DZ.fuente(id)).filter(Boolean)
      .map((f) => `<li>${f.texto_atribucion && !/^Ver /.test(f.texto_atribucion) ? esc(f.texto_atribucion) : esc(`${f.nombre} · ${f.organismo}`)} <span class="muted">(${esc(f.licencia)})</span></li>`).join('');
    return html.replace('__ATTR__', attr);
  }

  function vSemana() {
    const md = cur(S.destino); const mo = cur(S.origen);
    const op = DZ.opcionesPiso(S.destino, S.vivienda);
    const bien = S.conoceAlguien ? 80 : 60;
    const dinero = num(S.dineroMudanza);
    const remoto = S.trabajo.modalidad === 'remoto';
    const tv = t('tipo_viv');
    const cards = op.pisos.map((p) => {
      const elegido = S.piso && S.piso.zona === p.zona.zona_id;
      const ocultar = S.modoHistoria && !elegido;
      const tray = remoto ? esc(t('descubres_remoto')) : ocultar ? `<span class="muted">${esc(t('trayecto_oculto'))}</span>` : `${esc(t('min', { n: p.trayecto.v }))} ${info(p.trayecto.fuentes)}`;
      return `<article class="flat ${elegido ? 'chosen' : ''}">
        <p class="tag">${esc(t('zona_' + p.zona.centro_o_afueras))}</p>
        <h3>${esc(p.zona.nombre)}</h3><p class="hint">${esc(tv[p.tipo] || p.tipo)}</p>
        <p class="rent">${dual(p.alquiler.v, md)} ${info(p.alquiler.fuentes)}</p>
        <p class="commute"><span class="lbl">${esc(t('trayecto'))}</span> ${tray}</p>
        ${elegido ? `<p class="pill">${esc(t('elegido'))}</p>` : `<button type="button" class="primary" data-act="elegir" data-zona="${p.zona.zona_id}">${esc(t('elegir'))}</button>`}
      </article>`;
    }).join('');
    const elegido = S.piso ? op.pisos.find((p) => p.zona.zona_id === S.piso.zona) : null;
    return `<section class="week">
      <div class="hud" role="status">
        <div><span class="lbl">${esc(t('dinero'))}</span><span class="v" id="hud-dinero">${esc(money(dinero, mo))}</span></div>
        <div><span class="lbl">${esc(t('colchon_aparte'))}</span><span class="v" id="hud-colchon">${esc(money(num(S.colchon), mo))}</span></div>
        <div><span class="lbl">${esc(t('bienestar'))}</span><span class="v" id="hud-bienestar">${bien}</span><span class="meter" aria-hidden="true"><i style="width:${bien}%"></i></span></div>
      </div>
      <div class="card">
        <h1>${esc(t('h_semana'))}</h1><p class="lead">${esc(t('p_semana', { c: cname(S.destino) }))}</p>
        <fieldset class="plain"><legend>${esc(t('modo'))}</legend><div class="seg wide">
          <label><input type="radio" name="modo" id="modo-historia" data-bind="modoHistoria" value="1" ${S.modoHistoria ? 'checked' : ''}><span>${esc(t('modo_historia'))}</span></label>
          <label><input type="radio" name="modo" id="modo-plan" data-bind="modoHistoria" value="0" ${!S.modoHistoria ? 'checked' : ''}><span>${esc(t('modo_plan'))}</span></label></div></fieldset>
        ${op.sustituido ? `<p class="hint">${esc(t('sustituido', { t: tv[S.vivienda].toLowerCase(), u: (tv[op.tipo] || op.tipo).toLowerCase() }))}</p>` : ''}
        <div class="flats">${cards}</div>
        ${elegido ? `<div class="reveal" role="status"><p>${esc(remoto ? t('descubres_remoto') : t('descubres', { z: elegido.zona.nombre, n: elegido.trayecto.v }))}</p>
          <div class="cta-row"><button type="button" class="primary" data-act="informe">${esc(t('ver_informe'))}</button></div><p class="hint">${esc(t('continua'))}</p></div>` : ''}
      </div></section>`;
  }

  // ---------- Render ----------
  function render() {
    refs = []; usadas.clear();
    document.documentElement.lang = S.lang;
    document.getElementById('lang').textContent = t('lang_switch');
    document.getElementById('tag').textContent = t('app_tag');
    document.querySelector('#sheet .sheet-title').textContent = t('info_de');
    document.querySelector('#sheet .sheet-close').textContent = t('cerrar');
    const vistas = { inicio: vInicio, sueldo: vSueldo, situacion: vSituacion, trabajo: vTrabajo, resultado: vResultado, semana: vSemana };
    const foco = document.activeElement && document.activeElement.id;
    $app.innerHTML = ruta() + vistas[S.paso]();
    if (foco) { const el = document.getElementById(foco); if (el) el.focus(); }
  }
  function ir(paso) { S.errores = {}; S.paso = paso; render(); window.scrollTo(0, 0); }

  function setPath(path, value) {
    const ks = path.split('.'); let o = S;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }

  // ---------- Eventos ----------
  $app.addEventListener('input', (e) => {
    const el = e.target; const b = el.dataset.bind; if (!b) return;
    if (el.type === 'checkbox') setPath(b, el.checked);
    else if (b === 'modoHistoria') setPath(b, el.value === '1');
    else if (/pagas$/.test(b)) setPath(b, Number(el.value));
    else setPath(b, el.value);
    if (el.tagName === 'INPUT' && (el.type === 'text' || !el.type || el.inputMode)) {
      // actualiza la conversión sin rehacer el formulario (no se pierde el cursor)
      const key = b.split('.')[0];
      const hint = $app.querySelector(`[data-conv="${key}"]`);
      if (hint) { const tmp = document.createElement('div'); tmp.innerHTML = campoSueldo(key, key === 'sueldoActual' ? S.origen : S.destino, '', ''); hint.innerHTML = tmp.querySelector('[data-conv]').innerHTML; }
      return;
    }
    if (b === 'origen' || b === 'destino') {
      // cada sueldo arranca en la moneda de su ciudad
      S.sueldoActual.moneda = cur(S.origen); S.sueldoOfrecido.moneda = cur(S.destino);
    }
    render();
  });

  $app.addEventListener('submit', (e) => {
    e.preventDefault();
    const paso = e.target.dataset.paso; const sig = e.submitter ? e.submitter.dataset.sig : e.target.querySelector('[data-sig]').dataset.sig;
    if (!validar(paso)) { render(); const first = $app.querySelector('.err'); if (first) first.scrollIntoView({ block: 'center' }); return; }
    ir(sig);
  });

  $app.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ref) return abrirInfo(Number(b.dataset.ref));
    const a = b.dataset.act;
    if (a === 'atras') { const i = ORDEN.indexOf(S.paso); ir(ORDEN[Math.max(0, i - 1)]); }
    if (a === 'swap') { [S.origen, S.destino] = [S.destino, S.origen]; [S.sueldoActual.moneda, S.sueldoOfrecido.moneda] = [cur(S.origen), cur(S.destino)]; render(); }
    if (a === 'semana') ir('semana');
    if (a === 'editar') ir('sueldo');
    if (a === 'informe') ir('resultado');
    if (a === 'elegir') {
      const op = DZ.opcionesPiso(S.destino, S.vivienda);
      const p = op.pisos.find((x) => x.zona.zona_id === b.dataset.zona);
      S.piso = { zona: p.zona.zona_id, zonaNombre: p.zona.nombre, alquiler: p.alquiler, trayecto: p.trayecto.v, tipo: p.tipo };
      render();
    }
  });

  document.getElementById('lang').addEventListener('click', () => {
    S.lang = S.lang === 'es' ? 'en' : 'es'; store.set('dz-lang', S.lang); render();
  });
  const sheet = document.getElementById('sheet');
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close')) sheet.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });

  // si cambian ciudades o vivienda, el piso elegido deja de valer
  $app.addEventListener('input', (e) => { if (['origen', 'destino', 'vivienda'].includes(e.target.dataset.bind)) S.piso = null; }, true);

  render();
})();
