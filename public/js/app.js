/* DayZero · interfaz (Sprints 1 y 2). Vanilla JS, sin dependencias. */
(function () {
  'use strict';
  const DZ = window.DZ; const DZJ = window.DZJ; const I18N = window.DZ_I18N; const DATA = window.DZ_DATA;
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
    // Sprint 2
    gastosOrigen: { alquiler: '', transporte: '', comida: '', facturas: '' }, // HU-27
    modo: null, partida: null, narr: {}, // HU-13, HU-14, HU-18
    usuario: null, sso: { google: false, microsoft: false }, pendiente: null, guardadas: [], // HU-22, HU-26
    cuentaTab: 'registro', cuentaMsg: null, limiteMsg: null, misPartidas: null,
    pasoGuardado: null, confirmarBorrado: false, toast: null, // HU-29
  };
  const DEFAULTS = JSON.parse(JSON.stringify(S));
  window.DZ_STATE = S; // útil para depurar y para los tests de interfaz

  // ---------- HU-29: guardar el estado para no perder la partida ----------
  const CLAVE = 'dz-estado';
  const TRANSITORIO = ['errores', 'toast', 'confirmarBorrado', 'misPartidas', 'cuentaMsg', 'usuario', 'sso'];
  function guardarEstado() {
    try {
      const copia = { ...S }; TRANSITORIO.forEach((k) => delete copia[k]);
      if (copia.paso === 'inicio' && S.pasoGuardado) copia.paso = S.pasoGuardado;
      localStorage.setItem(CLAVE, JSON.stringify(copia));
      sessionStorage.setItem('dz-vivo', '1');
    } catch (e) { /* sin almacenamiento: la app sigue funcionando */ }
  }
  function restaurarEstado() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { g = null; }
    if (!g || typeof g !== 'object') return;
    let vivo = false; try { vivo = sessionStorage.getItem('dz-vivo') === '1'; } catch (e) { vivo = false; }
    const lang = S.lang;
    Object.assign(S, g, { lang, errores: {}, toast: null, confirmarBorrado: false, pasoGuardado: null });
    // Recarga en la misma pestaña: sigues donde estabas. Pestaña nueva: «Continuar partida» en la portada.
    if (!vivo && S.paso !== 'inicio') { S.pasoGuardado = S.paso; S.paso = 'inicio'; }
  }
  function borrarTodo() {
    try { localStorage.removeItem(CLAVE); sessionStorage.removeItem('dz-vivo'); } catch (e) { /* nada */ }
    const keep = { lang: S.lang, usuario: S.usuario, sso: S.sso };
    Object.keys(S).forEach((k) => delete S[k]);
    Object.assign(S, JSON.parse(JSON.stringify(DEFAULTS)), keep);
  }
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
  I.book = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 10h12a4 4 0 0 1 4 4v26a3 3 0 0 0-3-3H8zM40 10H28a4 4 0 0 0-4 4v26a3 3 0 0 1 3-3h13z"/></svg>';
  I.list = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 12h22M18 24h22M18 36h22"/><circle cx="9" cy="12" r="2.5"/><circle cx="9" cy="24" r="2.5"/><circle cx="9" cy="36" r="2.5"/></svg>';
  I.google = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z"/></svg>';
  I.microsoft = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M1 1h10.5v10.5H1z"/><path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z"/><path fill="#00A4EF" d="M1 12.5h10.5V23H1z"/><path fill="#FFB900" d="M12.5 12.5H23V23H12.5z"/></svg>';
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
    if (f.origen_dato === 'usuario') return `<span class="badge sup">${esc(t('tu_dato'))}</span>`;
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

  const GASTOS = ['alquiler', 'transporte', 'comida', 'facturas'];
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
      GASTOS.forEach((k) => { const v = String(S.gastosOrigen[k] == null ? '' : S.gastosOrigen[k]).trim(); if (v !== '' && !(num(v) >= 0)) e['g_' + k] = t('err_cantidad'); });
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
    const banner = S.pasoGuardado ? `<div class="resume" role="status">
        <div><p class="eyebrow">${esc(t('continuar_partida'))}</p><p>${esc(t('continuar_p', { o: cname(S.origen), d: cname(S.destino) }))}</p></div>
        ${S.confirmarBorrado ? `<div class="confirm"><p>${esc(t('borrar_seguro'))}</p><div class="cta-row"><button type="button" class="danger" data-act="borrar-si" id="btn-borrar-si">${esc(t('si_borrar'))}</button><button type="button" class="ghost" data-act="borrar-no">${esc(t('cancelar'))}</button></div></div>`
    : `<div class="cta-row"><button type="button" class="primary" data-act="continuar-partida" id="btn-continuar-partida">${esc(t('continuar_partida'))} ${I.arrow}</button><button type="button" class="ghost" data-act="borrar" id="btn-empezar-cero">${esc(t('empezar_cero'))}</button></div>`}
      </div>` : '';
    return `${banner}<form class="card step" data-paso="inicio" novalidate>
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
    if (['cuenta', 'mis'].includes(S.paso)) return '';
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
      <fieldset><legend>${esc(t('vivienda'))}</legend><div class="opts">${tiposVivienda().map(({ v, d }) => `<label class="opt"><input type="radio" name="vivienda" id="vivienda-${v}" data-bind="vivienda" value="${v}" ${S.vivienda === v ? 'checked' : ''}><span class="face">${VIV_ICON[v]}<b>${esc(v === 'habitacion' ? t('hab_compartida') : t('tipo_viv')[v])}</b><span class="opt-price">${esc(t('viv_precio', { v: money(d.v, d.moneda), c: cname(S.destino) }))} ${info(d.fuentes)}</span></span></label>`).join('')}</div></fieldset>
      <fieldset class="gastos"><legend>${esc(t('h_gastos', { c: cname(S.origen) }))}</legend><p class="hint">${esc(t('p_gastos'))}</p>
        <div class="grid4">${GASTOS.map((k) => `<label class="field"><span>${esc(t('g_' + k))} (${mo}/${S.lang === 'en' ? 'month' : 'mes'})</span><input id="gasto-${k}" inputmode="decimal" data-bind="gastosOrigen.${k}" value="${esc(S.gastosOrigen[k])}" placeholder="${esc(estimadoOrigen(k))}">${err('g_' + k)}</label>`).join('')}</div></fieldset>
      <div class="grid2">
        <label class="field"><span>${esc(t('nacionalidad'))}</span><select id="nacionalidad" data-bind="nacionalidad">${nac.map((n) => `<option value="${n}" ${S.nacionalidad === n ? 'selected' : ''}>${esc(t('nac_' + n))}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('edad'))}</span><input id="edad" inputmode="numeric" data-bind="edad" value="${esc(S.edad)}"><small>${esc(t('edad_ayuda'))}</small>${err('ed')}</label>
      </div>
      ${nav('trabajo')}</form>`;
  }

  // HU-28: «Habitación compartida» solo aparece si la ciudad de destino tiene ese precio
  function tiposVivienda() {
    return ['habitacion', 'estudio', '1_dormitorio'].map((v) => ({ v, d: DZ.alquiler(`${S.destino}-00`, v) })).filter((x) => !x.d.sinDato);
  }
  function estimadoOrigen(k) {
    const cv = DZ.costeVida(S.origen, { vivienda: S.vivienda, trabajo: { modalidad: S.trabajo.modalidad, dias: num(S.trabajo.dias) || 3 }, edad: num(S.edad) || 30 });
    const p = cv.partidas.find((x) => x.id === k);
    return p && !p.d.sinDato ? String(Math.round(p.d.v)) : '';
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
      gastosOrigen: Object.fromEntries(GASTOS.map((k) => { const v = String(S.gastosOrigen[k] == null ? '' : S.gastosOrigen[k]).trim(); return [k, v === '' ? null : num(v)]; })),
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
    const marca = d.usuario ? `<span class="tag-u">${esc(t('tu_dato'))}</span>` : d.estimado ? `<span class="tag-e">${esc(t('estimado'))}</span>` : '';
    return `<div class="cell"><div class="top"><span>${dual(d.v, d.moneda)}${marca}</span>${info(d.fuentes)}</div>${k ? `<div class="bar" style="--k: var(--k-${k})"><i data-w="${w.toFixed(1)}" style="width:0"></i></div>` : ''}</div>`;
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
  // ---------- Sprint 2 · La semana día cero ----------
  const P = () => S.partida;
  const md = () => cur(S.destino);
  function etiquetaOpcion(pasoId, opId, h) {
    if (pasoId === 'piso') return t('o_piso', { z: (h && h.zona) || opId });
    if (/^I0/.test(pasoId)) return (t(opId === 'pagar' ? 'imp_pagar' : 'imp_evitar') || {})[pasoId] || opId;
    return t(`o_${pasoId}_${opId}`);
  }
  function nombreImprevisto(id) {
    const r = DZ.imprevisto(id); return r ? (S.lang === 'en' ? r.nombre_en : r.nombre_es) : id;
  }
  function deltaChip(n) {
    if (!n) return '<span class="delta zero">±0</span>';
    return `<span class="delta ${n > 0 ? 'pos' : 'neg'}">${n > 0 ? '+' : '−'}${Math.abs(n)}</span>`;
  }
  function dineroDual(v) { return dual(v, md()); }

  // HUD con los dos indicadores (HU-15)
  function hud(p, delta) {
    const dia = p ? DZJ.diaActual(p) : 1;
    const dinero = p ? p.dinero : DZ.convertir(num(S.dineroMudanza), cur(S.origen), md(), FX);
    const colchon = p ? p.colchon : DZ.convertir(num(S.colchon), cur(S.origen), md(), FX);
    const bien = p ? p.bienestar : (S.conoceAlguien ? 80 : 60);
    const dD = delta && p && p.ultimo ? -p.ultimo.coste : 0; const dB = delta && p && p.ultimo ? p.ultimo.db : 0;
    return `<div class="hud" role="status">
      <div class="day"><span class="lbl">${esc(t('dia'))}</span><b>${p && p.fase === 'fin' ? 7 : dia}</b></div>
      <div class="${p && p.dinero < 0 ? 'neg-box' : ''}"><span class="lbl">${esc(t('dinero'))}</span><span class="v" id="hud-dinero">${esc(money(dinero, md()))}</span>${dosMonedas() ? `<span class="amt-alt">${esc(money(DZ.convertir(dinero, md(), cur(S.origen), FX), cur(S.origen)))}</span>` : ''}${delta && dD ? `<span class="delta neg" id="hud-dinero-delta">−${esc(money(-dD, md()))}</span>` : ''}</div>
      <div><span class="lbl">${esc(t('colchon_aparte'))}</span><span class="v" id="hud-colchon">${esc(money(colchon, md()))}</span></div>
      <div><span class="lbl">${esc(t('bienestar'))}</span><span class="v"><span id="hud-bienestar">${bien}</span>${delta ? ` ${deltaChip(dB).replace('class="delta', 'id="hud-bienestar-delta" class="delta')}` : ''}</span><span class="meter" aria-hidden="true"><i style="width:${bien}%"></i></span></div>
    </div>`;
  }

  // Introducción: elegir modo (HU-13)
  function vSemanaIntro() {
    const modo = (id, icono) => `<label class="opt mode"><input type="radio" name="modo" id="modo-${id === 'historia' ? 'historia' : 'plan'}" data-bind="modo" value="${id}" ${S.modo === id ? 'checked' : ''}><span class="face">${icono}<b>${esc(t(id === 'historia' ? 'modo_historia_t' : 'modo_plan_t'))}</b><small>${esc(t(id === 'historia' ? 'modo_historia_d' : 'modo_plan_d'))}</small></span></label>`;
    return `<section class="week">${hud(null)}
      <div class="card">
        <div class="panel-head"><p class="eyebrow">${esc(t('semana_lbl'))} · ${S.destino}</p><h1>${esc(t('h_intro', { c: cname(S.destino) }))}</h1><p class="lead">${esc(t('p_intro'))}</p></div>
        <fieldset><legend>${esc(t('modo'))}</legend><div class="opts">${modo('historia', I.book)}${modo('planificador', I.list)}</div><p class="hint">${esc(t('modo_defecto'))}</p></fieldset>
        ${S.limiteMsg ? `<p class="err" role="alert" id="limite">${esc(S.limiteMsg)}</p>` : ''}
        <div class="nav"><button type="button" class="ghost" data-act="volver-resultado">${esc(t('atras'))}</button><button type="button" class="primary" data-act="empezar" id="btn-empezar">${esc(t('empezar_semana'))} ${I.arrow}</button></div>
      </div></section>`;
  }

  function lineaTiempo(p) {
    const dia = DZJ.diaActual(p);
    return `<ol class="timeline" aria-label="${esc(t('dia_n', { n: dia }))}">${DZJ.DIAS.map((d) => `<li class="${d.n < dia || p.fase === 'fin' ? 'done' : d.n === dia ? 'on' : ''}"><b>${d.n}</b><span>${esc(t('dias')[d.id])}</span></li>`).join('')}</ol>`;
  }

  function narracion(p) {
    const dia = DZJ.diaActual(p); const n = S.narr[`${dia}-${S.lang}`];
    if (n && !n.texto) return '';
    return `<article class="narr ${n ? '' : 'loading'}" id="narracion" data-fuente="${n ? n.fuente : ''}"><p>${n ? esc(n.texto) : esc(t('narrando'))}</p></article>`;
  }

  function tarjetaPiso(o, i, p, planner) {
    const x = o.piso; const remoto = p.trabajo && p.trabajo.modalidad === 'remoto';
    const tray = remoto ? esc(t('descubres_remoto')) : !planner ? `<span class="muted">${esc(t('trayecto_oculto'))}</span>` : `<b>${esc(t('min', { n: x.trayecto }))}</b> ${info(x.trayectoDato.fuentes)}`;
    return `<article class="flat">
      <div class="sky">${edificio(x.zona, i / 2, x.centro === 'centro')}</div>
      <div class="body">
        <p class="tag">${esc(t('zona_' + x.centro))}</p>
        <h3>${esc(x.zonaNombre)}</h3><p class="hint">${esc(t('tipo_viv')[x.tipo] || x.tipo)}</p>
        <p class="rent"><span>${dineroDual(x.alquiler.v)}</span> ${info(x.alquiler.fuentes)}</p>
        <p class="commute"><span class="lbl">${esc(t('trayecto'))}</span> ${tray}</p>
        ${planner ? `<p class="hint">${esc(t('bienestar'))} ${deltaChip(o.b)}</p>` : ''}
        <button type="button" class="primary" data-act="opcion" data-op="${esc(o.id)}">${esc(t('elegir'))}</button>
      </div></article>`;
  }

  function vDecision(p) {
    const paso = DZJ.pasoActual(p); const ops = DZJ.opcionesActuales(p);
    const planner = p.modo === 'planificador';
    const delDia = p.pasos.filter((x) => x.dia === paso.dia && x.tipo !== 'imprevisto');
    const idx = delDia.indexOf(paso);
    let cab;
    if (paso.tipo === 'imprevisto') {
      cab = `<p class="eyebrow alert">${esc(t('imprevisto_lbl'))}</p><h2>${esc(nombreImprevisto(paso.id))}</h2><p class="lead">${esc((t('imp_texto') || {})[paso.id] || '')}</p>`;
    } else {
      const remoto = paso.id === 'ida_trabajo' && p.trabajo && p.trabajo.modalidad === 'remoto';
      cab = `<p class="eyebrow ${paso.tipo === 'imprevisto_gordo' ? 'alert' : ''}">${paso.tipo === 'imprevisto_gordo' ? esc(t('imprevisto_lbl')) + ' · ' : ''}${esc(t('decision_n', { i: idx + 1, n: delDia.length }))}</p><h2>${esc(t(remoto ? 'q_ida_trabajo_remoto' : 'q_' + paso.id))}</h2>`;
    }
    const cuerpo = paso.id === 'piso'
      ? `<div class="flats">${ops.map((o, i) => tarjetaPiso(o, i, p, planner)).join('')}</div>`
      : `<div class="choices">${ops.map((o) => {
        const precio = o.coste.sinDato ? `<span class="nodata">${esc(t('sin_dato'))}</span>` : o.coste.v === 0 ? `<span class="amt">${esc(t('gratis'))}</span>` : dineroDual(o.coste.v);
        return `<article class="choice ${o.bloqueada ? 'locked' : ''}">
          <h3>${esc(etiquetaOpcion(paso.id, o.id))}</h3>
          ${o.id === 'hoy' && o.etiqueta ? `<small>${esc(o.etiqueta)}</small>` : ''}
          <div class="price">${planner ? `<span class="pv">${precio}</span>${o.coste.sinDato || o.coste.v === 0 ? '' : info(o.coste.fuentes)}<span class="pb">${esc(t('bienestar'))} ${deltaChip(o.b)}</span>` : `<span class="muted">${esc(t('precio_oculto'))}</span>`}</div>
          <button type="button" class="primary" data-act="opcion" data-op="${esc(o.id)}" ${o.bloqueada ? 'disabled' : ''}>${esc(t('elegir_op'))}</button>
        </article>`;
      }).join('')}</div>`;
    return `<div class="card decision" id="decision" data-paso="${esc(paso.id)}">${cab}${p.recorte ? `<p class="hint warn">${esc(t('bloqueada'))}</p>` : ''}${cuerpo}</div>`;
  }

  function vResultadoDecision(p) {
    const r = p.ultimo; const sig = p.pasos[p.cursor + 1];
    const btn = !sig ? t('ver_veredicto') : sig.dia !== r.dia ? t('siguiente_dia', { n: sig.dia }) : t('siguiente_decision');
    const coste = r.coste === 0 ? `<span class="amt">${esc(t('gratis'))}</span>` : dineroDual(r.coste);
    const remoto = p.trabajo && p.trabajo.modalidad === 'remoto';
    const extra = r.paso === 'piso' && p.piso ? `<p class="big-line">${esc(remoto ? t('descubres_remoto') : t('descubres', { z: p.piso.zonaNombre, n: p.piso.trayecto }))}</p>
      ${remoto ? '' : `<div class="commute-bar" aria-hidden="true"><i style="--w:${Math.min(100, (p.piso.trayecto / 60) * 100).toFixed(0)}%"></i></div>`}
      <p class="hint">${esc(t('alquiler_mes', { v: money(p.piso.alquiler.v, md()) }))}</p>` : '';
    return `<div class="card outcome" id="resultado-decision" role="status">
      <p class="eyebrow">${esc(etiquetaOpcion(r.paso, r.opcion, r))}</p>
      <div class="outcome-row">
        <div><span class="lbl">${esc(t('te_ha_costado'))}</span><p class="outcome-v" id="coste-decision">${coste} ${r.costeDato && r.coste ? info(r.costeDato.fuentes) : ''}</p></div>
        <div><span class="lbl">${esc(t('bienestar'))}</span><p class="outcome-v">${deltaChip(r.db)}</p></div>
      </div>
      ${r.nota ? `<p class="hint">${esc(t('nota_' + r.nota))}</p>` : ''}${extra}
      <div class="nav" style="justify-content:flex-end"><button type="button" class="primary" data-act="continuar" id="btn-continuar">${esc(btn)} ${I.arrow}</button></div>
    </div>`;
  }

  // HU-16: sin dinero, con cuatro salidas
  function vSinDinero(p) {
    const ops = DZJ.salidasDisponibles(p);
    return `<div class="card broke" id="sin-dinero" role="alertdialog" aria-labelledby="h-broke">
      <p class="eyebrow alert">${esc(t('dia_n', { n: DZJ.diaActual(p) }))}</p><h2 id="h-broke">${esc(t('h_sindinero'))}</h2>
      <p class="lead">${esc(t('p_sindinero', { v: money(p.dinero, md()) }))}</p>
      <div class="choices">${ops.map((o) => `<article class="choice ${o.disponible ? '' : 'locked'}">
        <h3>${esc(t('s_' + o.id))}</h3><small>${esc(o.disponible ? t('s_' + o.id + '_d', { v: money(p.colchon, md()) }) : t('s_no_disp'))}</small>
        <div class="price"><span class="pb">${esc(t('bienestar'))} ${deltaChip(o.b)}</span></div>
        <button type="button" class="primary" data-act="salida" data-s="${o.id}" id="salida-${o.id}" ${o.disponible ? '' : 'disabled'}>${esc(t('elegir_op'))}</button>
      </article>`).join('')}</div></div>`;
  }

  function vJuego() {
    const p = P(); if (!p) return vSemanaIntro();
    const dia = DZJ.DIAS[DZJ.diaActual(p) - 1];
    const cuerpo = p.fase === 'resultado' ? vResultadoDecision(p) : p.fase === 'sindinero' ? vSinDinero(p) : vDecision(p);
    return `<section class="week">${hud(p, p.fase === 'resultado')}
      ${lineaTiempo(p)}
      <div class="day-head"><p class="eyebrow">${esc(t('dia_n', { n: dia.n }))} · ${esc(cname(S.destino))}</p><h1>${esc(t('dias')[dia.id])}</h1></div>
      ${narracion(p)}
      ${cuerpo}</section>`;
  }

  // ---------- HU-20 · Veredicto ----------
  function payloadPartida() {
    const p = P(); const calc = DZ.calcular({ ...estadoCalculo(), piso: p.piso }, FX);
    return {
      origen: S.origen, destino: S.destino, lang: S.lang, moneda: p.moneda,
      resumen: DZJ.resumen(p, calc), numeroQueDuele: calc.diferencia, monedaOrigen: cur(S.origen),
      jugadaEn: p.creada, clave: `${p.seed}-${p.creada}`,
    };
  }
  function anillo(v) {
    const r = 52; const c = 2 * Math.PI * r; const off = c * (1 - v / 100);
    return `<svg viewBox="0 0 120 120" class="ring" aria-hidden="true"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#27325a" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="#ffc24b" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>`;
  }
  function vFin() {
    const p = P(); if (!p) return vSemanaIntro();
    const calc = DZ.calcular({ ...estadoCalculo(), piso: p.piso }, FX);
    const res = DZJ.resumen(p, calc);
    const guardada = S.guardadas.includes(`${p.seed}-${p.creada}`);
    return `<section class="week">${hud(p)}
      <article class="verdict-card v-${res.veredicto}" id="veredicto">
        <div><p class="eyebrow">${esc(t('semana_lbl'))} · ${S.origen} → ${S.destino}</p>
          <h1 id="veredicto-titulo">${esc(t('v_' + res.veredicto))}</h1>
          <p class="lead">${esc(t('v_' + res.veredicto + '_d', { c: cname(S.destino) }))}</p></div>
        <div class="score">${anillo(res.encaje)}<div class="score-v"><b id="encaje">${res.encaje}</b><span>/100</span></div><p class="lbl">${esc(t('encaje', { c: cname(S.destino) }))}</p></div>
      </article>
      <div class="cta-row">
        <button type="button" class="primary" data-act="ver-informe" id="btn-informe">${esc(t('ver_informe_final'))} ${I.arrow}</button>
        ${guardada ? `<span class="pill">${esc(t('guardada'))}</span>` : `<button type="button" class="ghost" data-act="guardar" id="btn-guardar">${esc(t('guardar_partida'))}</button>`}
        <button type="button" class="ghost" data-act="otra">${esc(t('jugar_otra'))}</button>
      </div></section>`;
  }

  // ---------- HU-21 · Informe ----------
  function vInforme() {
    const p = P(); if (!p) return vSemanaIntro();
    const e = { ...estadoCalculo(), piso: p.piso };
    const calc = DZ.calcular(e, FX); const res = DZJ.resumen(p, calc);
    const mo = calc.mo; const m = p.moneda;
    const maxDia = Math.max(1, ...res.porDia.map((d) => d.gasto));
    const lineas = p.historial.map((h) => `<tr><td class="muted">${h.dia}</td><th scope="row">${esc(etiquetaOpcion(h.paso, h.opcion, h))}${h.tipo !== 'decision' ? ` <span class="tag-e">${esc(t('imprevisto_lbl'))}</span>` : ''}</th><td>${h.coste ? dineroDual(h.coste) : esc(t('gratis'))} ${h.costeDato && h.coste ? info(h.costeDato.fuentes) : ''}</td></tr>`).join('');
    let cambiar;
    if (calc.diferencia != null && calc.diferencia < 0) {
      const min = DZ.sueldoMinimo(e, FX);
      cambiar = `<p class="verdict" id="sueldo-minimo">${esc(t('i_sueldo_min', { t: t(min.tipo === 'neto' ? 'neto_l' : 'bruto_l'), c: cname(S.destino), v: money(min.importe, min.moneda) }))}</p>`;
    } else cambiar = `<p class="verdict">${esc(t('i_sueldo_ok', { c: cname(S.destino), o: cname(S.origen) }))}</p>`;
    if (S.vivienda !== 'habitacion' && !DZ.alquiler(`${S.destino}-00`, 'habitacion').sinDato) {
      const alt = DZ.calcular({ ...e, vivienda: 'habitacion', piso: null }, FX);
      if (alt.diferencia != null) cambiar += `<p class="hint">${esc(t('i_hab', { viv: (t('tipo_viv')[S.vivienda] || '').toLowerCase(), v: money(alt.diferencia, mo) }))}</p>`;
    }
    if (res.pendientes.length) cambiar += `<p class="hint">${esc(t('i_pendientes', { p: res.pendientes.map((x) => t('pend_' + x)).join(', ') }))}</p>`;
    // Recoger fuentes del cálculo mensual para la lista de fuentes usadas
    [calc.neto.origen, calc.neto.destino].forEach((n) => n.fuentes.forEach((f) => usadas.add(f.fuente_id)));
    calc.coste.origen.partidas.concat(calc.coste.destino.partidas).forEach((x) => (x.d.fuentes || []).forEach((f) => usadas.add(f.fuente_id)));
    res.fuentes.forEach((f) => usadas.add(f));
    const fuentes = [...usadas].map((id) => DZ.fuente(id)).filter(Boolean)
      .map((f) => `<li>${f.texto_atribucion && !/^Ver /.test(f.texto_atribucion) ? esc(f.texto_atribucion) : esc(`${f.nombre} · ${f.organismo}`)} ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">↗</a>` : ''}</li>`).join('');
    const guardada = S.guardadas.includes(`${p.seed}-${p.creada}`);
    return `<section class="result" id="informe">
      <div class="panel-head"><p class="eyebrow">${S.origen} → ${S.destino}</p><h1>${esc(t('h_informe'))}</h1></div>
      <section class="panel" id="inf-resumen"><h2>${esc(t('i_resumen'))}</h2>
        <div class="kpis">
          <div><span class="lbl">${esc(t('neto_mensual'))} · ${esc(cname(S.origen))}</span><b>${dual(calc.neto.origen.netoMensual, mo)}</b></div>
          <div><span class="lbl">${esc(t('neto_mensual'))} · ${esc(cname(S.destino))}</span><b>${dual(calc.neto.destino.netoMensual, m)}</b></div>
          <div><span class="lbl">${esc(t('h_coste'))} · ${esc(cname(S.destino))}</span><b>${dual(calc.coste.destino.total, m)}</b></div>
          <div class="${calc.diferencia < 0 ? 'neg-box' : ''}"><span class="lbl">${esc(t('queda_mes'))} · ${esc(t('vs'))} ${esc(cname(S.origen))}</span><b id="inf-duele">${esc(money(calc.diferencia, mo))}</b></div>
        </div></section>
      <section class="panel" id="inf-semana"><h2>${esc(t('i_semana'))}</h2>
        <div class="kpis">
          <div><span class="lbl">${esc(t('i_gasto_total'))}</span><b id="inf-gasto">${dineroDual(res.gasto)}</b></div>
          <div><span class="lbl">${esc(t('i_imprevistos'))}</span><b>${dineroDual(res.gastoImprevistos)}</b></div>
          <div><span class="lbl">${esc(t('i_dinero_final'))}</span><b>${dineroDual(res.dineroFinal)}</b></div>
          <div><span class="lbl">${esc(t('i_bienestar_final'))}</span><b>${res.bienestarFinal}</b></div>
        </div>
        <div class="daybars">${res.porDia.map((d) => `<div class="daybar"><span>${esc(t('dias')[d.id])}</span><span class="bar"><i data-w="${((d.gasto / maxDia) * 100).toFixed(1)}" style="width:0;--k:var(--sodium)"></i></span><span class="amt">${esc(money(d.gasto, m))}</span></div>`).join('')}</div>
        <details><summary>${esc(t('ver_desglose'))}</summary><div class="tablewrap"><table class="cost single"><tbody>${lineas}</tbody></table></div></details>
        ${res.salidas.length ? `<p class="hint warn">${esc(t('i_salidas'))}: ${res.salidas.map((x) => `${esc(t('s_' + x.id))}${x.importe ? ' (' + esc(money(x.importe, m)) + ')' : ''}`).join(' · ')}</p>` : ''}
        ${res.deuda ? `<p class="hint warn">${esc(t('i_deuda'))}: ${esc(money(res.deuda, m))}</p>` : ''}
      </section>
      <section class="panel" id="inf-veredicto"><h2>${esc(t('v_' + res.veredicto))}</h2><p class="lead">${esc(t('encaje', { c: cname(S.destino) }))}: <b>${res.encaje}/100</b></p></section>
      <section class="panel" id="inf-cambiar"><h2>${esc(t('i_cambiar'))}</h2>${cambiar}</section>
      <section class="panel quiet" id="inf-fuentes"><h2>${esc(t('i_fuentes'))}</h2><ul class="attr">${fuentes}</ul></section>
      <div class="cta-row">${guardada ? `<span class="pill">${esc(t('guardada'))}</span>` : `<button type="button" class="primary" data-act="guardar">${esc(t('guardar_partida'))}</button>`}<button type="button" class="ghost" data-act="ver-veredicto">${esc(t('volver'))}</button></div>
    </section>`;
  }

  // ---------- HU-22 / HU-26 · Cuenta ----------
  function vCuenta() {
    if (S.usuario) {
      return `<section class="card"><div class="panel-head"><h1>${esc(t('mis_partidas'))}</h1><p class="lead">${esc(t('sesion_como', { e: S.usuario.email || S.usuario.nombre || '' }))}</p></div>
        <div class="cta-row"><button type="button" class="primary" data-act="mis">${esc(t('mis_partidas'))}</button><button type="button" class="ghost" data-act="logout">${esc(t('salir'))}</button></div></section>`;
    }
    const sso = (id, nombre, icono) => S.sso[id]
      ? `<a class="sso" href="/api/auth/${id}" id="sso-${id}">${icono}<span>${esc(t('con_' + id))}</span></a>`
      : `<span class="sso off" id="sso-${id}" title="${esc(t('sso_no_conf', { p: nombre }))}">${icono}<span>${esc(t('con_' + id))}</span></span>`;
    const reg = S.cuentaTab === 'registro';
    return `<section class="card cuenta">
      <div class="panel-head"><h1>${esc(t('h_cuenta'))}</h1><p class="lead">${esc(t('p_cuenta'))}</p></div>
      ${S.limiteMsg ? `<p class="err" role="alert" id="limite">${esc(S.limiteMsg)}</p>` : ''}
      <div class="sso-row">${sso('google', 'Google', I.google)}${sso('microsoft', 'Microsoft', I.microsoft)}</div>
      ${!S.sso.google || !S.sso.microsoft ? `<p class="hint">${esc(t('sso_no_conf', { p: [!S.sso.google && 'Google', !S.sso.microsoft && 'Microsoft'].filter(Boolean).join(' / ') }))}</p>` : ''}
      <p class="or">${esc(t('o_email'))}</p>
      <div class="seg wide" role="tablist"><label><input type="radio" name="ctab" data-bind="cuentaTab" value="registro" id="tab-registro" ${reg ? 'checked' : ''}><span>${esc(t('crear_cuenta'))}</span></label><label><input type="radio" name="ctab" data-bind="cuentaTab" value="login" id="tab-login" ${!reg ? 'checked' : ''}><span>${esc(t('ya_tengo'))}</span></label></div>
      <form class="step" data-paso="cuenta" novalidate>
        <label class="field"><span>${esc(t('email'))}</span><input type="email" id="cuenta-email" autocomplete="email" required></label>
        <label class="field"><span>${esc(t('password'))}</span><input type="password" id="cuenta-pass" autocomplete="${reg ? 'new-password' : 'current-password'}" required>${reg ? `<small>${esc(t('password_ayuda'))}</small>` : ''}</label>
        ${S.cuentaMsg ? `<p class="err" role="alert" id="cuenta-error">${esc(S.cuentaMsg)}</p>` : ''}
        <div class="nav"><button type="button" class="ghost" data-act="volver-cuenta">${esc(t('volver'))}</button><button type="submit" class="primary" data-sig="cuenta" id="btn-cuenta">${esc(reg ? t('crear_cuenta') : t('entrar'))} ${I.arrow}</button></div>
      </form></section>`;
  }

  function vMis() {
    const lista = S.misPartidas;
    const tarjetas = !lista ? `<p class="hint">…</p>` : !lista.length ? `<p class="hint" id="mis-vacio">${esc(t('mis_vacio'))}</p>`
      : `<div class="games">${lista.map((g) => `<article class="game v-${esc(g.resumen.veredicto)}">
        <p class="eyebrow">${esc(g.origen)} → ${esc(g.destino)} · ${esc(fecha(String(g.jugadaEn || g.creada).slice(0, 10)))}</p>
        <h3>${esc(t('v_' + g.resumen.veredicto))}</h3>
        <p><span class="lbl">${esc(t('encaje', { c: g.destino }))}</span> <b>${Number(g.resumen.encaje)}/100</b></p>
        <p class="hint">${esc(t('i_gasto_total'))}: ${esc(money(Number(g.resumen.gasto), g.moneda || 'EUR'))}</p></article>`).join('')}</div>`;
    return `<section class="card" id="mis-partidas"><div class="panel-head"><h1>${esc(t('h_mis'))}</h1>${S.usuario ? `<p class="lead">${esc(t('sesion_como', { e: S.usuario.email || S.usuario.nombre || '' }))}</p>` : ''}</div>
      ${tarjetas}
      <div class="cta-row"><button type="button" class="ghost" data-act="volver-cuenta">${esc(t('volver'))}</button>${S.usuario ? `<button type="button" class="ghost" data-act="logout">${esc(t('salir'))}</button>` : ''}</div></section>`;
  }

  // ---------- Llamadas al servidor ----------
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, ok: r.ok, body: j };
  }
  function toast(msg) {
    S.toast = msg; const el = document.getElementById('toast');
    if (el) { el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; S.toast = null; }, 4000); }
  }
  async function cargarUsuario() {
    try { const r = await api('/api/auth/yo'); if (r.ok) { S.usuario = r.body.usuario; S.sso = r.body.sso; } } catch (e) { /* sin servidor */ }
  }
  async function subirPendiente() {
    if (!S.usuario || !S.pendiente) return;
    try {
      const r = await api('/api/partidas', { method: 'POST', body: S.pendiente });
      if (r.ok) { S.guardadas.push(S.pendiente.clave); S.pendiente = null; toast(t('guardada')); }
    } catch (e) { /* se reintenta más tarde */ }
  }
  async function guardarPartida() {
    if (!P()) return;
    S.pendiente = payloadPartida();
    if (!S.usuario) { S.limiteMsg = null; ir('cuenta'); return; }
    await subirPendiente(); render();
  }
  async function cargarMis() {
    S.misPartidas = null; render();
    try { const r = await api('/api/partidas'); S.misPartidas = r.ok ? r.body : []; } catch (e) { S.misPartidas = []; }
    render();
  }
  const narrPedidas = new Set();
  function asegurarNarracion() {
    const p = P(); if (S.paso !== 'juego' || !p || p.fase === 'fin') return;
    const dia = DZJ.diaActual(p); const key = `${dia}-${S.lang}`;
    if (S.narr[key] || narrPedidas.has(key)) return;
    narrPedidas.add(key);
    const prev = p.historial[p.historial.length - 1];
    const anterior = prev ? etiquetaOpcion(prev.paso, prev.opcion, prev).toLowerCase() : t('anterior_vuelo', { o: cname(S.origen) });
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 6500);
    fetch('/api/narrar', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        dia, destino: S.destino, lang: S.lang, anterior,
        tema: t('dias')[DZJ.DIAS[dia - 1].id] + (dia === 5 ? ': ' + t('q_' + (p.gordo || 'cerrajero')) : ''),
        variante: dia === 5 && p.gordo === 'movil_roto' ? 'movil_roto' : undefined,
        permitidas: DZJ.cifrasPermitidas(p),
      }),
    }).then((r) => r.json()).then((j) => { S.narr[key] = { texto: j.texto || '', fuente: j.fuente || 'reserva' }; })
      .catch(() => { S.narr[key] = { texto: '', fuente: 'reserva' }; }) // HU-19 esc. 2: sin mensaje de error
      .finally(() => { clearTimeout(timer); narrPedidas.delete(key); if (S.paso === 'juego') { const el = document.getElementById('narracion'); const n = S.narr[key]; if (el && n) { if (n.texto) { el.classList.remove('loading'); el.dataset.fuente = n.fuente; el.querySelector('p').textContent = n.texto; } else el.remove(); } guardarEstado(); } });
  }

  async function empezarSemana() {
    S.limiteMsg = null;
    try {
      const r = await api('/api/partidas/empezar', { method: 'POST' });
      if (r.status === 429 && r.body) {
        if (r.body.limite === 'anonimo') { S.limiteMsg = t('limite_anonimo'); S.cuentaTab = 'registro'; ir('cuenta'); return; }
        S.limiteMsg = t('limite_diario'); render(); return;
      }
    } catch (e) { /* sin servidor: se deja jugar */ }
    S.partida = DZJ.crearPartida({ estado: estadoCalculo(), modo: S.modo, colchon: num(S.colchon), conoceAlguien: S.conoceAlguien }, FX);
    S.narr = {}; S.piso = null; S.pendiente = null;
    ir('juego');
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
    const cb = document.getElementById('cuenta-btn');
    cb.textContent = S.usuario ? t('mis_partidas') : t('entrar');
    const vistas = { inicio: vInicio, sueldo: vSueldo, situacion: vSituacion, trabajo: vTrabajo, resultado: vResultado, semana: vSemanaIntro, juego: vJuego, fin: vFin, informe: vInforme, cuenta: vCuenta, mis: vMis };
    const foco = document.activeElement && document.activeElement.id;
    $app.innerHTML = ruta() + (vistas[S.paso] || vInicio)();
    if (foco) { const el = document.getElementById(foco); if (el) el.focus({ preventScroll: true }); }
    animarFlaps(); animarNumeros();
    guardarEstado();
    asegurarNarracion();
  }
  let pasoAnterior = 'inicio';
  function ir(paso) {
    if (!['cuenta', 'mis'].includes(S.paso)) pasoAnterior = S.paso;
    S.errores = {}; S.paso = paso; S.confirmarBorrado = false;
    if (paso === 'resultado' || paso === 'informe') animarResultado = true;
    if (paso === 'mis') { cargarMis(); window.scrollTo(0, 0); return; }
    render(); window.scrollTo(0, 0);
  }

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
    else if (b === 'cuentaTab') { S.cuentaTab = el.value; S.cuentaMsg = null; }
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
    if (paso === 'cuenta') { enviarCuenta(); return; }
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
    if (a === 'semana') { S.limiteMsg = null; ir(S.partida && S.partida.fase !== 'fin' ? 'juego' : 'semana'); }
    if (a === 'editar') ir('sueldo');
    if (a === 'volver-resultado') ir('resultado');
    if (a === 'empezar') empezarSemana();
    if (a === 'opcion') { // HU-14: elegir una opción
      DZJ.elegir(S.partida, b.dataset.op);
      if (S.partida.piso) S.piso = S.partida.piso;
      render(); const el = document.getElementById('resultado-decision'); if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    }
    if (a === 'continuar') {
      const diaAntes = DZJ.diaActual(S.partida);
      DZJ.continuar(S.partida);
      if (S.partida.fase === 'fin') { S.pendiente = payloadPartida(); if (S.usuario) subirPendiente().then(render); ir('fin'); return; }
      render(); if (DZJ.diaActual(S.partida) !== diaAntes || S.partida.fase === 'sindinero') window.scrollTo(0, 0);
    }
    if (a === 'salida') { // HU-16
      DZJ.aplicarSalida(S.partida, b.dataset.s);
      if (S.partida.fase === 'fin') { S.pendiente = payloadPartida(); if (S.usuario) subirPendiente().then(render); ir('fin'); return; }
      render(); window.scrollTo(0, 0);
    }
    if (a === 'ver-informe') ir('informe');
    if (a === 'ver-veredicto') ir('fin');
    if (a === 'guardar') guardarPartida();
    if (a === 'otra') { S.partida = null; S.narr = {}; S.piso = null; S.modo = null; ir('semana'); }
    if (a === 'continuar-partida') { const dest = S.pasoGuardado; S.pasoGuardado = null; ir(dest || 'inicio'); }
    if (a === 'borrar') { S.confirmarBorrado = true; render(); }
    if (a === 'borrar-no') { S.confirmarBorrado = false; render(); }
    if (a === 'borrar-si') { borrarTodo(); ir('inicio'); }
    if (a === 'mis') ir('mis');
    if (a === 'volver-cuenta') ir(pasoAnterior === 'cuenta' || pasoAnterior === 'mis' ? 'inicio' : pasoAnterior);
    if (a === 'logout') { api('/api/auth/logout', { method: 'POST' }).finally(() => { S.usuario = null; S.misPartidas = null; ir('inicio'); }); }
  });

  async function enviarCuenta() {
    const email = document.getElementById('cuenta-email').value.trim();
    const password = document.getElementById('cuenta-pass').value;
    const ruta = S.cuentaTab === 'registro' ? '/api/auth/registro' : '/api/auth/login';
    try {
      const r = await api(ruta, { method: 'POST', body: { email, password } });
      if (!r.ok) { S.cuentaMsg = t('err_' + ((r.body && r.body.error) || 'red')); render(); return; }
      S.usuario = r.body.usuario; S.cuentaMsg = null; S.limiteMsg = null;
      await subirPendiente();
      toast(t('login_ok'));
      ir('mis');
    } catch (e) { S.cuentaMsg = t('err_red'); render(); }
  }

  document.getElementById('lang').addEventListener('click', () => {
    S.lang = S.lang === 'es' ? 'en' : 'es'; store.set('dz-lang', S.lang); render();
  });
  document.getElementById('cuenta-btn').addEventListener('click', () => ir(S.usuario ? 'mis' : 'cuenta'));
  const sheet = document.getElementById('sheet');
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close')) sheet.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });

  // ---------- Arranque ----------
  restaurarEstado();
  const params = new URLSearchParams(location.search);
  const login = params.get('login');
  if (login) history.replaceState(null, '', location.pathname);
  render();
  cargarUsuario().then(async () => {
    if (login === 'ok') { await subirPendiente(); toast(t('login_ok')); }
    if (login === 'error') toast(t('login_error')); // HU-26 esc. 3
    if (login === 'no_configurado') toast(t('sso_no_conf', { p: 'Google / Microsoft' }));
    render();
  });
})();
