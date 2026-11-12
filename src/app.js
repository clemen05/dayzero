/* DayZero · interfaz (Sprint 1). Vanilla JS, sin dependencias. */
(function () {
  'use strict';
  const DZ = window.DZ; const I18N = window.DZ_I18N; const DATA = window.DZ_DATA;
  const $app = document.getElementById('app');
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  let animarResultado = false;

  // ---------- Utilidades ----------
  const t = (k, vars) => {
    let s = I18N[S.lang][k];
    if (s == null) s = I18N.es[k] != null ? I18N.es[k] : k;
    if (vars && typeof s === 'string') Object.keys(vars).forEach((x) => { s = s.split(`{${x}}`).join(vars[x]); });
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
  const cityVar = (id) => `--city: var(--c-${id})`;
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // ---------- Iconos ----------
  const I = {
    plane: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M7 4 3 8M7 4l4 4M17 20V4m0 16-4-4m4 4 4-4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    room: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 34V18M6 28h36v6M42 34v-8a6 6 0 0 0-6-6H20v8"/><circle cx="13" cy="23" r="3"/></svg>',
    studio: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="10" width="32" height="30" rx="3"/><path d="M8 22h32M20 22v18"/><path d="M27 30h7"/></svg>',
    flat: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 22 24 8l18 14v18H6z"/><path d="M19 40V28h10v12"/></svg>',
    remoto: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 22 24 9l16 13"/><path d="M12 19v20h24V19"/><rect x="18" y="26" width="12" height="8" rx="1"/></svg>',
    oficina: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><rect x="12" y="6" width="24" height="36" rx="2"/><path d="M18 13h4M26 13h4M18 20h4M26 20h4M18 27h4M26 27h4M21 42v-7h6v7"/></svg>',
    hibrido: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M4 26 14 18l10 8"/><path d="M7 24v14h14V24"/><rect x="28" y="10" width="16" height="28" rx="2"/><path d="M33 16h6M33 22h6M33 28h6"/></svg>',
  };
  const VIV_ICON = { habitacion: I.room, estudio: I.studio, '1_dormitorio': I.flat };

  // HU-08: importe en su moneda y, si las ciudades usan monedas distintas, también en la otra
  function dual(v, m, opts = {}) {
    if (v == null) return `<span class="nodata">${esc(t('sin_dato'))}</span>`;
    const count = opts.count ? ` data-count="${v}" data-cur="${m}"` : '';
    const main = `<span class="amt"${count}>${esc(money(v, m, opts.dec || 0))}</span>`;
    if (!dosMonedas()) return main;
    const otra = m === cur(S.origen) ? cur(S.destino) : cur(S.origen);
    return `${main}<span class="amt-alt">${esc(money(DZ.convertir(v, m, otra, FX), otra, opts.dec || 0))}</span>`;
  }
  const flap = (txt, key) => `<span class="flap" data-flap="${esc(txt)}" data-key="${esc(key || txt)}" aria-label="${esc(txt)}">${[...txt].map((c) => `<b>${esc(c)}</b>`).join('')}</span>`;

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

  // ---------- Portada (HU-01) ----------
  const ORDEN = ['inicio', 'sueldo', 'situacion', 'trabajo'];
  const GEO = { MAD: [107, 343], LON: [197, 82], AMS: [322, 62], ZRH: [413, 180] };
  function mapa() {
    const [x1, y1] = GEO[S.origen]; const [x2, y2] = GEO[S.destino];
    const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2; const dx = x2 - x1; const dy = y2 - y1;
    const cx = mx - dy * 0.35; const cy = my + dx * 0.35 - 30;
    const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
    const misma = S.origen === S.destino;
    const grid = [100, 200, 300].map((y) => `<path d="M0 ${y} H500" stroke="#27325a" stroke-width="1" stroke-dasharray="2 6"/>`).join('')
      + [125, 250, 375].map((x) => `<path d="M${x} 0 V400" stroke="#27325a" stroke-width="1" stroke-dasharray="2 6"/>`).join('');
    const nodes = Object.entries(GEO).map(([id, [x, y]]) => {
      const role = id === S.origen ? 'o' : id === S.destino ? 'd' : '';
      const col = `var(--c-${id})`;
      return `<g class="node">
        ${role ? `<circle cx="${x}" cy="${y}" r="20" fill="${col}" opacity=".16"/>` : ''}
        <circle cx="${x}" cy="${y}" r="${role ? 8 : 5}" fill="${role ? col : '#0a0f1f'}" stroke="${col}" stroke-width="2.5"/>
        <text x="${x + 14}" y="${y - 6}">${id}</text>
        <text class="sub" x="${x + 14}" y="${y + 8}">${esc(cname(id))}</text></g>`;
    }).join('');
    return `<div class="map" aria-hidden="true"><svg viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet">
      ${grid}
      ${misma ? '' : `<path class="arc-glow" d="${d}"/><path class="arc" id="arc" d="${d}"/>
      <g fill="#ffc24b"><path transform="translate(-12 -12)" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
      ${REDUCED ? '' : `<animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath href="#arc"/></animateMotion>`}</g>`}
      ${nodes}</svg></div>`;
  }
  function tiles(name) {
    return `<div class="tiles" role="radiogroup">${DATA.ciudad.map((c) => `<label class="tile" style="${cityVar(c.ciudad_id)}">
      <input type="radio" name="${name}" id="${name}-${c.ciudad_id}" data-bind="${name}" value="${c.ciudad_id}" ${S[name] === c.ciudad_id ? 'checked' : ''}>
      <span class="face"><span class="code">${c.ciudad_id}</span><span class="name">${esc(cname(c.ciudad_id))}</span><span class="hola">${esc(t('hola')[c.ciudad_id])} · ${esc(c.moneda_iso)}</span></span></label>`).join('')}</div>`;
  }
  function vInicio() {
    return `<form class="card step" data-paso="inicio" novalidate>
      <div class="hero-start">
        <div class="copy">
          <p class="eyebrow">${flap(t('board').toUpperCase(), 'board')}</p>
          <h1>${esc(t('h_inicio'))}</h1>
          <p class="lead">${esc(t('p_inicio'))}</p>
        </div>
        ${mapa()}
      </div>
      <div class="pick"><span class="lbl">${esc(t('origen'))}</span>${tiles('origen')}</div>
      <div class="swaprow"><button type="button" class="swap" data-act="swap" aria-label="⇄">${I.swap}</button></div>
      <div class="pick"><span class="lbl">${esc(t('destino'))}</span>${tiles('destino')}</div>
      ${err('ciudades')}
      <div class="nav"><span class="hint">${esc(t('lema')[S.destino])}</span><button type="submit" class="primary" data-sig="sueldo">${esc(t('empezar'))} ${I.arrow}</button></div>
    </form>`;
  }

  // ---------- Barra de vuelo ----------
  function ruta() {
    if (!ORDEN.includes(S.paso) || S.paso === 'inicio') {
      if (S.paso === 'inicio') return '';
    }
    const i = ORDEN.indexOf(S.paso);
    const frac = i < 0 ? 1 : (i + 0.5) / ORDEN.length;
    const pct = `${(frac * 100).toFixed(1)}%`;
    return `<div class="route" aria-label="${esc(cname(S.origen))} → ${esc(cname(S.destino))}">
      <div class="ends">
        <div class="end">${flap(S.origen, 'o')}<span class="city">${esc(cname(S.origen))}</span></div>
        <div class="track"><span class="done" style="width:${pct}"></span><span class="plane" style="left:${pct}">${I.plane.replace('<svg', '<svg style="transform:rotate(90deg)"')}</span></div>
        <div class="end">${flap(S.destino, 'd')}<span class="city">${esc(cname(S.destino))}</span></div>
      </div>
      ${i >= 0 ? `<div class="steps">${t('ps').map((s, k) => `<span class="${k === i ? 'on' : ''}">${k + 1} · ${esc(s)}</span>`).join('')}</div>` : ''}
    </div>`;
  }
  const nav = (sig, txt) => `<div class="nav"><button type="button" class="ghost" data-act="atras">${esc(t('atras'))}</button><button type="submit" class="primary" data-sig="${sig}">${esc(txt || t('siguiente'))} ${I.arrow}</button></div>`;
  const head = (h, p) => `<div class="panel-head"><p class="eyebrow">${esc(t('step', { n: ORDEN.indexOf(S.paso) + 1 }))}</p><h1>${esc(h)}</h1><p class="lead">${esc(p)}</p></div>`;

  // ---------- Sueldo (HU-02) con neto en vivo ----------
  function convTexto(key) {
    const s = S[key]; const cityId = key === 'sueldoActual' ? S.origen : S.destino;
    const otra = key === 'sueldoActual' ? S.destino : S.origen;
    const n = num(s.importe);
    if (!(n > 0)) return '';
    return [cityId, otra].filter((c) => cur(c) !== s.moneda)
      .filter((c, i, a) => a.findIndex((x) => cur(x) === cur(c)) === i)
      .map((c) => esc(t('equivale', { c: cname(c), v: money(DZ.convertir(n, s.moneda, cur(c), FX), cur(c)) }))).join(' · ');
  }
  function liveTexto(key) {
    const s = S[key]; const cityId = key === 'sueldoActual' ? S.origen : S.destino;
    const n = num(s.importe);
    if (!(n > 0)) return { idle: true, html: esc(t('live_neto_calc')) };
    const r = DZ.sueldo(cityId, { ...s, importe: n, pagas: Number(s.pagas) }, { edad: num(S.edad) || 30, expat30: S.expat30 }, FX);
    return { idle: false, html: esc(t('live_neto', { v: money(r.netoMensual, r.moneda) })) };
  }
  function campoSueldo(key, cityId, label, ek) {
    const s = S[key];
    const monedas = [...new Set([cur(S.origen), cur(S.destino), 'EUR'])];
    const live = liveTexto(key);
    return `<fieldset class="salary" style="${cityVar(cityId)}">
      <div class="who"><legend>${esc(t(label, { c: cname(cityId) }))}</legend><b>${cityId}</b></div>
      <label class="field"><span class="lbl">${esc(t('importe_anual'))}</span>
        <span class="money-in"><input id="${key}-importe" inputmode="decimal" data-bind="${key}.importe" value="${esc(s.importe)}" autocomplete="off" placeholder="45000">
        <select id="${key}-moneda" data-bind="${key}.moneda" aria-label="${esc(t('moneda'))}">${monedas.map((x) => `<option ${x === s.moneda ? 'selected' : ''}>${x}</option>`).join('')}</select></span></label>
      <div class="row">
        <div class="seg" role="radiogroup">${['bruto', 'neto'].map((x) => `<label><input type="radio" name="${key}-tipo" id="${key}-tipo-${x}" data-bind="${key}.tipo" value="${x}" ${s.tipo === x ? 'checked' : ''}><span>${esc(t(x))}</span></label>`).join('')}</div>
        <div class="seg" role="radiogroup">${[12, 14].map((x) => `<label><input type="radio" name="${key}-pagas" id="${key}-pagas-${x}" data-bind="${key}.pagas" value="${x}" ${Number(s.pagas) === x ? 'checked' : ''}><span>${esc(t('pagas_' + x))}</span></label>`).join('')}</div>
      </div>
      <p class="live ${live.idle ? 'idle' : ''}" data-live="${key}">${live.html}</p>
      <p class="hint" data-conv="${key}">${convTexto(key)}</p>${err(ek)}</fieldset>`;
  }
  function vSueldo() {
    const nlMin = DATA.fiscal_parametro.find((p) => p.clave === 'regimen_expat_salario_minimo' && p.anio === 2026);
    return `<form class="card step" data-paso="sueldo" novalidate>${head(t('h_sueldo'), t('p_sueldo'))}
      <div class="salaries">${campoSueldo('sueldoActual', S.origen, 'sueldo_actual', 'sa')}${campoSueldo('sueldoOfrecido', S.destino, 'sueldo_ofrecido', 'so')}</div>
      ${S.destino === 'AMS' || S.origen === 'AMS' ? `<label class="toggle"><input type="checkbox" id="expat30" data-bind="expat30" ${S.expat30 ? 'checked' : ''}><span class="sw"></span><span>${esc(t('expat30'))}<small>${esc(t('expat30_ayuda', { v: money(nlMin.valor, 'EUR') }))}</small></span></label>` : ''}
      ${nav('situacion')}</form>`;
  }

  // ---------- Situación (HU-03) ----------
  function vSituacion() {
    const mo = cur(S.origen);
    const nac = ['ue', 'ue_settled', 'gb', 'no_ue'];
    const chips = (key, vals) => `<div class="chips"><span>${esc(t('rapido'))}</span>${vals.map((v) => `<button type="button" class="chip" data-chip="${key}" data-v="${v}">${esc(money(v, mo))}</button>`).join('')}</div>`;
    return `<form class="card step" data-paso="situacion" novalidate>${head(t('h_situacion'), t('p_situacion'))}
      <div class="grid2">
        <label class="field"><span>${esc(t('dinero_mudanza'))} (${mo})</span><input id="dineroMudanza" inputmode="decimal" data-bind="dineroMudanza" value="${esc(S.dineroMudanza)}">${chips('dineroMudanza', [1500, 3000, 6000])}${err('dm')}</label>
        <label class="field"><span>${esc(t('colchon'))} (${mo})</span><input id="colchon" inputmode="decimal" data-bind="colchon" value="${esc(S.colchon)}"><small>${esc(t('colchon_ayuda'))}</small>${err('co')}</label>
      </div>
      <label class="toggle"><input type="checkbox" id="conoceAlguien" data-bind="conoceAlguien" ${S.conoceAlguien ? 'checked' : ''}><span class="sw"></span><span>${esc(t('conoce', { c: cname(S.destino) }))}<small>${esc(t('conoce_ayuda'))}</small></span></label>
      <fieldset><legend>${esc(t('vivienda'))}</legend><div class="opts">${['habitacion', 'estudio', '1_dormitorio'].map((v) => `<label class="opt"><input type="radio" name="vivienda" id="vivienda-${v}" data-bind="vivienda" value="${v}" ${S.vivienda === v ? 'checked' : ''}><span class="face">${VIV_ICON[v]}<b>${esc(t('tipo_viv')[v])}</b></span></label>`).join('')}</div></fieldset>
      <div class="grid2">
        <label class="field"><span>${esc(t('nacionalidad'))}</span><select id="nacionalidad" data-bind="nacionalidad">${nac.map((n) => `<option value="${n}" ${S.nacionalidad === n ? 'selected' : ''}>${esc(t('nac_' + n))}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('edad'))}</span><input id="edad" inputmode="numeric" data-bind="edad" value="${esc(S.edad)}"><small>${esc(t('edad_ayuda'))}</small>${err('ed')}</label>
      </div>
      ${nav('trabajo')}</form>`;
  }

  // ---------- Trabajo (HU-24) ----------
  function vTrabajo() {
    return `<form class="card step" data-paso="trabajo" novalidate>${head(t('h_trabajo'), t('p_trabajo'))}
      <div class="opts">${['remoto', 'oficina', 'hibrido'].map((v) => `<label class="opt"><input type="radio" name="modalidad" id="modalidad-${v}" data-bind="trabajo.modalidad" value="${v}" ${S.trabajo.modalidad === v ? 'checked' : ''}><span class="face">${I[v]}<b>${esc(t(v))}</b></span></label>`).join('')}</div>
      ${S.trabajo.modalidad === 'hibrido' ? `<fieldset><legend>${esc(t('dias_oficina'))}</legend><div class="seg days">${[1, 2, 3, 4].map((d) => `<label><input type="radio" name="dias" id="dias-${d}" data-bind="trabajo.dias" value="${d}" ${String(S.trabajo.dias) === String(d) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>${err('dias')}</fieldset>` : ''}
      ${nav('resultado', t('abordar'))}</form>`;
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

  // ---------- Resultado ----------
  function bloqueNeto(cityId, n) {
    const m = n.moneda;
    const desglose = n.desdeNeto ? `<p class="hint">${esc(t('desde_neto'))}</p>` : `<details><summary>${esc(t('ver_desglose'))}</summary><dl class="kvs">
      <dt>${esc(t('bruto_anual'))}</dt><dd>${esc(money(n.bruto, m))}</dd>
      ${n.partidas.map((p) => `<dt>${esc(t('f_' + p.id))}${p.id === 'qst' && n.tipoQST != null ? ` (${n.tipoQST.toLocaleString(locale())} %)` : ''}</dt><dd>${p.v == null ? esc(t('sin_dato')) : '−' + esc(money(Math.abs(p.v), m))}</dd>`).join('')}
      <dt><strong>${esc(t('neto_anual'))}</strong></dt><dd><strong>${esc(money(n.neto, m))}</strong></dd></dl></details>`;
    return `<div class="col" style="${cityVar(cityId)}"><span class="lbl">${cityId} · ${esc(t('neto_mensual'))}</span><h3>${esc(cname(cityId))}</h3>
      <p class="big"><span>${dual(n.netoMensual, m)}</span> ${info(n.fuentes)}</p>
      <p class="hint">${esc(Number(n.pagas) === 14 ? t('neto_prorrateado') : t('neto_12'))}</p>
      ${Number(n.pagas) === 14 ? `<p class="hint strong">${esc(t('paga_normal', { v: money(n.netoPaga, m) }))}</p>` : ''}
      ${desglose}</div>`;
  }
  function motivo(d) { const k = 'sd_' + (d.nota || 'generico'); return I18N[S.lang][k] ? t(k) : t('sd_generico'); }
  function etiquetaPartida(p, cityId) {
    const d = p.d;
    if (p.id === 'transporte' && d.detalle) {
      if (d.nota === 'remoto') return `<small>${esc(t('tr_remoto'))}</small>`;
      return `<small>${esc(d.detalle.usaAbono ? t('tr_abono', { p: d.detalle.abono, d: d.detalle.dias }) : t('tr_sueltos', { d: d.detalle.dias }))}</small>`;
    }
    if (p.id === 'alquiler') { const conPiso = S.piso && cityId === S.destino; return `<small>${esc(t('tipo_viv')[conPiso ? S.piso.tipo : S.vivienda] || '')}${conPiso ? ' · ' + esc(S.piso.zonaNombre) : ''}</small>`; }
    return '';
  }
  function celda(d, k, max) {
    if (d.sinDato) return `<div class="cell"><div class="top"><span class="nodata">${esc(t('sin_dato'))}</span> ${info([], motivo(d) + ' ' + t('no_incluido_total'))}</div></div>`;
    const eur = DZ.convertir(d.v, d.moneda, 'EUR', FX);
    const w = max > 0 ? Math.max(2, (eur / max) * 100) : 0;
    return `<div class="cell"><div class="top"><span>${dual(d.v, d.moneda)}</span>${info(d.fuentes)}</div>${k ? `<div class="bar" style="--k: var(--k-${k})"><i data-w="${w.toFixed(1)}" style="width:0"></i></div>` : ''}</div>`;
  }
  function barcode(seed) {
    const r = rng(hash(seed)); let out = '';
    for (let i = 0; i < 42; i++) out += `<i style="width:${1 + Math.floor(r() * 3)}px;opacity:${r() > .15 ? 1 : 0}"></i>`;
    return `<div class="barcode" aria-hidden="true">${out}</div>`;
  }
  const KEYS = ['alquiler', 'transporte', 'comida', 'facturas', 'seguro_medico', 'otros'];
  function pila(cityId, neto, coste) {
    const m = coste.moneda;
    const parts = coste.partidas.filter((p) => !p.d.sinDato && p.d.v > 0);
    const gasto = coste.total; const queda = neto - gasto;
    const base = Math.max(neto, gasto);
    const segs = parts.map((p) => `<span class="seg-k" style="background:var(--k-${p.id});flex-grow:${(p.d.v / base).toFixed(4)}" title="${esc(t('p_' + p.id))}: ${esc(money(p.d.v, m))}">${p.d.v / base > .11 ? `<span>${esc(money(p.d.v, m))}</span>` : ''}</span>`).join('');
    const tail = queda >= 0
      ? `<span class="seg-k keep" style="flex-grow:${(queda / base).toFixed(4)}" title="${esc(t('te_sobra'))}"></span>`
      : `<span class="seg-k short" style="flex-grow:${(-queda / base).toFixed(4)}" title="${esc(t('te_falta'))}"></span>`;
    return `<div class="payrow" style="${cityVar(cityId)}">
      <div class="who"><span><b>${cityId}</b> ${esc(cname(cityId))} · <span class="muted">${esc(t('tu_neto'))} ${esc(money(neto, m))}</span></span>
      <span style="color:var(--${queda >= 0 ? 'pos' : 'neg'});font-weight:800">${esc(queda >= 0 ? t('te_sobra') : t('te_falta'))} ${esc(money(Math.abs(queda), m))}</span></div>
      <div class="stack">${segs}${tail}</div></div>`;
  }

  function vResultado() {
    const R = DZ.calcular(estadoCalculo(), FX);
    const mo = R.mo; const md = R.md;
    let frase;
    const signo = R.diferencia == null ? 'nil' : Math.round(R.diferencia) < 0 ? 'neg' : Math.round(R.diferencia) > 0 ? 'pos' : 'nil';
    if (R.diferencia == null) frase = esc(t('duele_sin'));
    else {
      const k = signo === 'neg' ? 'duele_menos' : signo === 'pos' ? 'duele_mas' : 'duele_igual';
      frase = esc(t(k, { d: cname(S.destino), o: cname(S.origen), v: '§' }))
        .replace('§', `<span class="n"><span class="amt" data-count="${Math.abs(R.diferencia)}" data-cur="${mo}">${esc(money(Math.abs(R.diferencia), mo))}</span></span>`);
    }
    const fxNota = dosMonedas() ? `<p class="fx">${esc(t('fx_nota', { f: fecha(FX.fecha), r: [cur(S.origen), cur(S.destino)].filter((x) => x !== 'EUR').map((x) => `${FX[x].toLocaleString(locale(), { maximumFractionDigits: 5 })} ${x}`).join(' · ') }))} ${info([{ fuente_id: 'BCE_FX', periodo: FX.fecha, origen_dato: 'oficial' }])}</p>` : '';

    // Coste de vida: filas alineadas por partida, barras a la misma escala (en euros) dentro de cada fila
    const ids = [...new Set(R.coste.origen.partidas.map((p) => p.id).concat(R.coste.destino.partidas.map((p) => p.id)))];
    const fila = (id) => {
      const po = R.coste.origen.partidas.find((p) => p.id === id); const pd = R.coste.destino.partidas.find((p) => p.id === id);
      const max = Math.max(...[po, pd].filter((p) => p && !p.d.sinDato).map((p) => DZ.convertir(p.d.v, p.d.moneda, 'EUR', FX)), 0);
      const k = KEYS.includes(id) ? id : null;
      return `<tr><th scope="row">${esc(t('p_' + id))}${etiquetaPartida(pd || po, pd ? S.destino : S.origen)}</th>
        <td>${po ? celda(po.d, k, max) : '<span class="muted">—</span>'}</td><td>${pd ? celda(pd.d, k, max) : '<span class="muted">—</span>'}</td></tr>`;
    };
    const legend = KEYS.filter((k) => ids.includes(k)).map((k) => `<span><i style="background:var(--k-${k})"></i>${esc(t('p_' + k))}</span>`).join('')
      + `<span><i style="background:var(--pos)"></i>${esc(t('te_sobra'))}</span><span><i style="background:var(--neg)"></i>${esc(t('te_falta'))}</span>`;

    const arr = R.arranque;
    const mesesN = R.mesesRecuperar == null ? null : Math.ceil(R.mesesRecuperar);
    const meses = mesesN == null ? `<p class="verdict neg">${esc(t('no_recuperas'))}</p>`
      : `<p class="verdict">${esc(R.mesesRecuperar < 1 ? t('recuperas_1') : t('recuperas', { n: mesesN.toLocaleString(locale()) }))}</p>`;
    const dots = mesesN == null ? '' : `<div class="dots" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i class="${i < Math.min(mesesN, 24) ? 'on' : ''}"></i>`).join('')}${mesesN > 24 ? '' : ''}</div><p class="hint">${esc(t('cada_punto', { c: cname(S.destino) }))}${mesesN > 24 ? ' (+' + (mesesN - 24) + ')' : ''}</p>`;
    const ahorros = R.ahorrosLlegan ? t('ahorros_si', { v: money(num(S.dineroMudanza), mo) })
      : t('ahorros_no', { v: money(num(S.dineroMudanza), mo), f: money(DZ.convertir(arr.total - R.dineroMudanzaD, md, mo, FX), mo) });
    const sup = [t('sup_fiscal'), t('sup_alquiler'), t('sup_luz', { k: DZ.SUPUESTOS.consumo_kwh_mes }), t('sup_vuelo')]
      .concat([S.origen, S.destino].includes('LON') ? [S.vivienda === 'habitacion' ? t('sup_lon_hab') : t('sup_council')] : [])
      .concat([S.origen, S.destino].includes('ZRH') ? [t('sup_ch_seguro'), t('sup_nbu')] : []);

    const html = `<section class="result">
      <article class="pass ${signo}">
        <div class="pass-main">
          <div class="pass-top"><span>DayZero · ${esc(t('semana_lbl'))}</span><span>${esc(fecha(new Date().toISOString().slice(0, 10)))}</span></div>
          <div class="pass-route"><span class="code" style="color:var(--c-${S.origen})">${S.origen}</span><span class="line"></span>${I.plane.replace('<svg', '<svg style="transform:rotate(90deg)"')}<span class="line"></span><span class="code" style="color:var(--c-${S.destino})">${S.destino}</span></div>
          ${S.piso ? `<p class="eyebrow" style="color:var(--paper-muted)">${esc(t('con_piso', { z: S.piso.zonaNombre }))}</p>` : ''}
          <h1 class="ouch" id="numero-que-duele">${frase}</h1>
          <div class="pass-fields">
            <div><span class="lbl">${esc(t('asiento'))}</span><span class="v">${esc(t('sin_viv')[S.piso ? S.piso.tipo : S.vivienda])}</span></div>
            <div><span class="lbl">${esc(t('puerta'))}</span><span class="v">${esc(t(S.trabajo.modalidad))}${S.trabajo.modalidad === 'hibrido' ? ` · ${num(S.trabajo.dias)}d` : ''}</span></div>
            <div><span class="lbl">${esc(t('pasajero'))}</span><span class="v">${esc(t('nac_' + S.nacionalidad))}</span></div>
          </div>
          ${fxNota}
        </div>
        <div class="pass-stub">
          <div class="q"><span class="lbl">${esc(t('queda_mes'))} · ${esc(cname(S.origen))}</span><span class="v">${dual(R.queda.origen, mo)}</span></div>
          <div class="q"><span class="lbl">${esc(t('queda_mes'))} · ${esc(cname(S.destino))}</span><span class="v">${dual(R.queda.destino, md)}</span></div>
          ${barcode(S.origen + S.destino + Math.round(R.diferencia || 0))}
          <button type="button" class="primary" data-act="semana" id="btn-semana">${esc(t('vivir_semana'))} ${I.arrow}</button>
          <button type="button" class="ghost" data-act="editar">${esc(t('editar'))}</button>
        </div>
      </article>

      <section class="panel" id="nomina"><div class="panel-head"><h2>${esc(t('h_nomina'))}</h2><p class="hint">${esc(t('p_nomina'))}</p></div>
        <div class="payrows">${pila(S.origen, R.neto.origen.netoMensual, R.coste.origen)}${pila(S.destino, R.neto.destino.netoMensual, R.coste.destino)}</div>
        <div class="legend">${legend}</div></section>

      <section class="panel" id="neto"><h2>${esc(t('h_neto'))}</h2><div class="cols">${bloqueNeto(S.origen, R.neto.origen)}${bloqueNeto(S.destino, R.neto.destino)}</div></section>

      <section class="panel" id="coste"><h2>${esc(t('h_coste'))}</h2>
        <div class="tablewrap"><table class="cost"><thead><tr><th></th><th scope="col" style="${cityVar(S.origen)}"><b>${S.origen}</b> ${esc(cname(S.origen))}</th><th scope="col" style="${cityVar(S.destino)}"><b>${S.destino}</b> ${esc(cname(S.destino))}</th></tr></thead>
        <tbody>${ids.map(fila).join('')}</tbody>
        <tfoot><tr><th scope="row">${esc(t('total'))}</th><td>${dual(R.coste.origen.total, mo)}</td><td>${dual(R.coste.destino.total, md)}</td></tr></tfoot></table></div></section>

      <section class="panel" id="arranque"><h2>${esc(t('h_arranque', { c: cname(S.destino) }))}</h2>
        <div class="receipt-wrap">
          <div class="receipt"><h3>${esc(t('recibo'))}</h3><p class="sub">${S.origen} → ${S.destino} · ${esc(fecha(FX.fecha))}</p>
            <table><tbody>${arr.lineas.map((l) => `<tr><th scope="row">${esc(t('a_' + l.id))}${l.etiqueta && l.id !== 'sin_permiso' ? `<small>${esc(l.etiqueta)}</small>` : ''}</th><td>${l.dLocal.sinDato ? `<span class="nodata">${esc(t('sin_dato'))}</span> ${info([], motivo(l.dLocal) + ' ' + t('no_incluido_total'))}` : `${dual(l.dLocal.v, l.dLocal.moneda)} ${info(l.dLocal.fuentes)}`}</td></tr>`).join('')}</tbody>
            <tfoot><tr><th scope="row">${esc(t('total'))}</th><td>${dual(arr.total, md)}</td></tr></tfoot></table></div>
          <div class="payback">${meses}${dots}
            <p class="savings"><span class="dot" style="background:var(--${R.ahorrosLlegan ? 'pos' : 'neg'})"></span><span>${esc(ahorros)}</span></p></div>
        </div></section>

      <details class="more"><summary>${esc(t('ver_fuentes'))}</summary>
        <h3>${esc(t('h_supuestos'))}</h3><ul class="sup">${sup.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <h3 id="atribuciones">${esc(t('h_fuentes'))}</h3><ul class="attr">__ATTR__</ul></details>
    </section>`;
    const attr = [...usadas].map((id) => DZ.fuente(id)).filter(Boolean)
      .map((f) => `<li>${f.texto_atribucion && !/^Ver /.test(f.texto_atribucion) ? esc(f.texto_atribucion) : esc(`${f.nombre} · ${f.organismo}`)} <span class="muted">(${esc(f.licencia)})</span></li>`).join('');
    return html.replace('__ATTR__', attr);
  }

  // ---------- Semana (HU-03, HU-25, HU-24 esc. 2) ----------
  function edificio(zonaId, rango, centro) {
    const r = rng(hash(zonaId)); let s = '';
    const W = 300; const H = 150; let x = 0;
    while (x < W) {
      const w = 26 + Math.floor(r() * 34);
      const h = 40 + Math.floor(r() * (40 + rango * 50));
      const fill = centro ? '#24305e' : '#1d2850';
      s += `<rect x="${x}" y="${H - h}" width="${w - 3}" height="${h}" fill="${fill}"/>`;
      for (let wy = H - h + 8; wy < H - 8; wy += 12) {
        for (let wx = x + 5; wx < x + w - 9; wx += 9) {
          if (r() > .55) s += `<rect x="${wx}" y="${wy}" width="4" height="6" fill="${r() > .3 ? '#ffc24b' : '#6b93ff'}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
        }
      }
      x += w;
    }
    const moon = `<circle cx="${40 + Math.floor(r() * 220)}" cy="26" r="9" fill="#f7f2e6" opacity=".85"/>`;
    return `<svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${moon}${s}</svg>`;
  }
  function vSemana() {
    const md = cur(S.destino); const mo = cur(S.origen);
    const op = DZ.opcionesPiso(S.destino, S.vivienda);
    const bien = S.conoceAlguien ? 80 : 60;
    const dinero = num(S.dineroMudanza);
    const remoto = S.trabajo.modalidad === 'remoto';
    const tv = t('tipo_viv');
    const cards = op.pisos.map((p, i) => {
      const elegido = S.piso && S.piso.zona === p.zona.zona_id;
      const ocultar = S.modoHistoria && !elegido;
      const tray = remoto ? esc(t('descubres_remoto')) : ocultar ? `<span class="muted">${esc(t('trayecto_oculto'))}</span>` : `<b>${esc(t('min', { n: p.trayecto.v }))}</b> ${info(p.trayecto.fuentes)}`;
      return `<article class="flat ${elegido ? 'chosen' : ''}">
        <div class="sky">${edificio(p.zona.zona_id, i / 2, p.zona.centro_o_afueras === 'centro')}</div>
        <div class="body">
          <p class="tag">${esc(t('zona_' + p.zona.centro_o_afueras))}</p>
          <h3>${esc(p.zona.nombre)}</h3><p class="hint">${esc(tv[p.tipo] || p.tipo)}</p>
          <p class="rent"><span>${dual(p.alquiler.v, md)}</span> ${info(p.alquiler.fuentes)}</p>
          <p class="commute"><span class="lbl">${esc(t('trayecto'))}</span> ${tray}</p>
          ${elegido ? `<p class="pill">${esc(t('elegido'))}</p>` : `<button type="button" class="primary" data-act="elegir" data-zona="${p.zona.zona_id}">${esc(t('elegir'))}</button>`}
        </div></article>`;
    }).join('');
    const elegido = S.piso ? op.pisos.find((p) => p.zona.zona_id === S.piso.zona) : null;
    const maxMin = 60;
    return `<section class="week">
      <div class="hud" role="status">
        <div class="day"><span class="lbl">${esc(t('dia'))}</span><b>1</b></div>
        <div><span class="lbl">${esc(t('dinero'))}</span><span class="v" id="hud-dinero">${esc(money(dinero, mo))}</span></div>
        <div><span class="lbl">${esc(t('colchon_aparte'))}</span><span class="v" id="hud-colchon">${esc(money(num(S.colchon), mo))}</span></div>
        <div><span class="lbl">${esc(t('bienestar'))}</span><span class="v" id="hud-bienestar">${bien}</span><span class="meter" aria-hidden="true"><i style="width:${bien}%"></i></span></div>
      </div>
      <div class="card">
        <div class="panel-head"><p class="eyebrow">${esc(t('semana_lbl'))} · ${S.destino}</p><h1>${esc(t('h_semana'))}</h1><p class="lead">${esc(t('p_semana', { c: cname(S.destino) }))}</p></div>
        <fieldset><legend>${esc(t('modo'))}</legend><div class="seg wide">
          <label><input type="radio" name="modo" id="modo-historia" data-bind="modoHistoria" value="1" ${S.modoHistoria ? 'checked' : ''}><span>${esc(t('modo_historia'))}</span></label>
          <label><input type="radio" name="modo" id="modo-plan" data-bind="modoHistoria" value="0" ${!S.modoHistoria ? 'checked' : ''}><span>${esc(t('modo_plan'))}</span></label></div></fieldset>
        ${op.sustituido ? `<p class="hint">${esc(t('sustituido', { t: tv[S.vivienda].toLowerCase(), u: (tv[op.tipo] || op.tipo).toLowerCase() }))}</p>` : ''}
        <div class="flats">${cards}</div>
        ${elegido ? `<div class="reveal" role="status"><p class="big-line">${esc(remoto ? t('descubres_remoto') : t('descubres', { z: elegido.zona.nombre, n: elegido.trayecto.v }))}</p>
          ${remoto ? '' : `<div class="commute-bar" aria-hidden="true"><i style="--w:${Math.min(100, (elegido.trayecto.v / maxMin) * 100).toFixed(0)}%"></i></div>`}
          <div class="nav" style="justify-content:flex-start"><button type="button" class="primary" data-act="informe">${esc(t('ver_informe'))} ${I.arrow}</button></div><p class="hint">${esc(t('continua'))}</p></div>` : ''}
      </div></section>`;
  }

  // ---------- Animaciones ----------
  const flapPrev = {};
  function animarFlaps() {
    document.querySelectorAll('.flap[data-flap]').forEach((el) => {
      const txt = el.dataset.flap; const key = el.dataset.key;
      if (flapPrev[key] === txt || REDUCED) { flapPrev[key] = txt; return; }
      flapPrev[key] = txt;
      const cells = [...el.children]; const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      cells.forEach((b, i) => {
        let n = 0; const final = txt[i]; const total = 6 + i * 2;
        const tick = () => { n++; b.textContent = n >= total ? final : A[Math.floor(Math.random() * A.length)]; if (n < total) setTimeout(tick, 45); };
        tick();
      });
    });
  }
  function animarNumeros() {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const v = Number(el.dataset.count); const m = el.dataset.cur;
      if (REDUCED || !animarResultado) return;
      const t0 = performance.now(); const dur = 1100;
      const step = (now) => { const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3); el.textContent = money(v * e, m); if (k < 1) requestAnimationFrame(step); };
      el.textContent = money(0, m); requestAnimationFrame(step);
    });
    document.querySelectorAll('.bar i[data-w]').forEach((el) => {
      if (REDUCED || !animarResultado) { el.style.width = el.dataset.w + '%'; return; }
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = el.dataset.w + '%'; }));
    });
    animarResultado = false;
  }

  // ---------- Render ----------
  function render() {
    refs = []; usadas.clear();
    document.documentElement.lang = S.lang;
    document.getElementById('lang').textContent = S.lang === 'es' ? 'EN' : 'ES';
    document.getElementById('lang').setAttribute('aria-label', t('lang_switch'));
    document.getElementById('tag').textContent = t('app_tag');
    document.getElementById('foot-fx').textContent = `BCE ${fecha(FX.fecha)} · 1 € = ${FX.GBP} GBP · ${FX.CHF} CHF`;
    document.querySelector('#sheet .sheet-title').textContent = t('info_de');
    document.querySelector('#sheet .sheet-close').textContent = t('cerrar');
    const vistas = { inicio: vInicio, sueldo: vSueldo, situacion: vSituacion, trabajo: vTrabajo, resultado: vResultado, semana: vSemana };
    const foco = document.activeElement && document.activeElement.id;
    $app.innerHTML = ruta() + vistas[S.paso]();
    if (foco) { const el = document.getElementById(foco); if (el) el.focus({ preventScroll: true }); }
    animarFlaps(); animarNumeros();
  }
  function ir(paso) { S.errores = {}; S.paso = paso; if (paso === 'resultado') animarResultado = true; render(); window.scrollTo(0, 0); }

  function setPath(path, value) {
    const ks = path.split('.'); let o = S;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }

  // ---------- Eventos ----------
  $app.addEventListener('input', (e) => {
    const el = e.target; const b = el.dataset.bind; if (!b) return;
    if (['origen', 'destino', 'vivienda'].includes(b)) S.piso = null;
    if (el.type === 'checkbox') setPath(b, el.checked);
    else if (b === 'modoHistoria') setPath(b, el.value === '1');
    else if (/pagas$/.test(b)) setPath(b, Number(el.value));
    else setPath(b, el.value);
    if (el.tagName === 'INPUT' && el.type === 'text') {
      // Texto: no se rehace el formulario (no se pierde el cursor); se actualizan neto y conversión en vivo
      const key = b.split('.')[0];
      const conv = $app.querySelector(`[data-conv="${key}"]`); if (conv) conv.innerHTML = convTexto(key);
      const live = $app.querySelector(`[data-live="${key}"]`);
      if (live) { const l = liveTexto(key); live.innerHTML = l.html; live.classList.toggle('idle', l.idle); }
      return;
    }
    if (b === 'origen' || b === 'destino') { S.sueldoActual.moneda = cur(S.origen); S.sueldoOfrecido.moneda = cur(S.destino); }
    render();
  });

  $app.addEventListener('submit', (e) => {
    e.preventDefault();
    const paso = e.target.dataset.paso; const sig = e.target.querySelector('[data-sig]').dataset.sig;
    if (!validar(paso)) { render(); const first = $app.querySelector('.err'); if (first) first.scrollIntoView({ block: 'center' }); return; }
    ir(sig);
  });

  $app.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ref) return abrirInfo(Number(b.dataset.ref));
    if (b.dataset.chip) { S[b.dataset.chip] = b.dataset.v; render(); return; }
    const a = b.dataset.act;
    if (a === 'atras') { const i = ORDEN.indexOf(S.paso); ir(ORDEN[Math.max(0, i - 1)]); }
    if (a === 'swap') { [S.origen, S.destino] = [S.destino, S.origen]; [S.sueldoActual.moneda, S.sueldoOfrecido.moneda] = [cur(S.origen), cur(S.destino)]; S.piso = null; render(); }
    if (a === 'semana') ir('semana');
    if (a === 'editar') ir('sueldo');
    if (a === 'informe') ir('resultado');
    if (a === 'elegir') {
      const op = DZ.opcionesPiso(S.destino, S.vivienda);
      const p = op.pisos.find((x) => x.zona.zona_id === b.dataset.zona);
      S.piso = { zona: p.zona.zona_id, zonaNombre: p.zona.nombre, alquiler: p.alquiler, trayecto: p.trayecto.v, tipo: p.tipo };
      render();
      const rv = $app.querySelector('.reveal'); if (rv) rv.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    }
  });

  document.getElementById('lang').addEventListener('click', () => {
    S.lang = S.lang === 'es' ? 'en' : 'es'; store.set('dz-lang', S.lang); render();
  });
  const sheet = document.getElementById('sheet');
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close')) sheet.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });

  render();
})();
