// Pruebas de aceptación del Sprint 2 en navegador (Playwright): node tests/e2e-sprint2.js
// Levanta el servidor real con un almacén temporal, un narrador de IA falso y un proveedor
// de Google/Microsoft falso, y recorre los escenarios de Jira (DAYZ-21 a DAYZ-37).
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ---------- IA falsa (HU-18 / HU-19) ----------
let modoIA = 'ok';
const ia = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const prompt = JSON.parse(body).messages[0].content;
    const ciudad = (prompt.match(/mudar a ([^.]+)\./) || [])[1] || 'la ciudad';
    const anterior = (prompt.match(/Su decisión anterior fue: ([^.]+)\./) || [])[1] || '';
    const ingles = /English/.test(prompt);
    let texto = ingles
      ? `A new day dawns in ${ciudad}. After ${anterior}, you step outside and feel the city testing you once again.`
      : `Amanece en ${ciudad}. Después de ${anterior}, sales a la calle y notas que la ciudad vuelve a ponerte a prueba.`;
    if (modoIA === 'cifra') texto += ' Hoy gastarás 4321 euros en un capricho.';
    const responder = () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: texto }] })); };
    if (modoIA === 'lento') setTimeout(responder, 2500); else responder();
  });
}).listen(0);
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
process.env.ANTHROPIC_URL = `http://localhost:${ia.address().port}/v1/messages`;
process.env.NARRADOR_TIMEOUT_MS = '1200'; // en producción son 5 s; aquí se acorta para no alargar las pruebas

// ---------- Google / Microsoft falsos (HU-26) ----------
let modoSSO = 'ok';
const idToken = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
const sso = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/authorize') {
    const vuelta = new URL(u.searchParams.get('redirect_uri'));
    if (modoSSO === 'cancelar') vuelta.searchParams.set('error', 'access_denied');
    else vuelta.searchParams.set('code', 'codigo-123');
    vuelta.searchParams.set('state', u.searchParams.get('state'));
    res.writeHead(302, { location: vuelta.toString() }); res.end(); return;
  }
  if (u.pathname === '/token') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id_token: idToken({ sub: 'google-sub-1', email: 'ana.google@example.com', name: 'Ana' }) })); return;
  }
  res.writeHead(404); res.end();
}).listen(0);
const ssoBase = `http://localhost:${sso.address().port}`;
Object.assign(process.env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_AUTH_URL: `${ssoBase}/authorize`, GOOGLE_TOKEN_URL: `${ssoBase}/token` });

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { cargarDatos } = require('../server/db');
const { crearApp } = require('../server/app');
const { storeArchivo } = require('../server/store');

const results = [];
const check = (id, ok, info = '') => { results.push({ id, ok: !!ok, info }); };
const SHOTS = path.resolve(__dirname, '../shots'); fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const storeFile = path.join(os.tmpdir(), `dz-s2-${process.pid}.json`);
  const store = storeArchivo(storeFile); await store.init();
  const server = crearApp(await cargarDatos(), { store }).listen(0);
  const URL0 = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const errores = [];

  async function nuevaPagina(ctx) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_INTERNET|status of 429|status of 401/.test(m.text())) errores.push(m.text()); });
    await page.goto(URL0); await page.waitForFunction(() => window.DZ_STATE && window.DZJ);
    return page;
  }
  const rerender = async (pg) => { await pg.click('#lang'); await pg.click('#lang'); };
  const txt = async (pg, sel) => (await pg.locator(sel).first().innerText()).trim();
  // Rellena el asistente hasta el resultado (vía estado, como haría el usuario con los formularios del Sprint 1)
  async function hastaResultado(pg, extra = {}) {
    await pg.evaluate((x) => {
      const S = window.DZ_STATE;
      Object.assign(S, { origen: 'MAD', destino: 'LON', sueldoActual: { importe: '30000', tipo: 'bruto', pagas: 14, moneda: 'EUR' }, sueldoOfrecido: { importe: '45000', tipo: 'bruto', pagas: 12, moneda: 'GBP' }, paso: 'resultado' }, x);
    }, extra);
    await rerender(pg);
  }
  async function empezar(pg, modo) {
    await pg.click('#btn-semana');
    if (modo) await pg.check(modo === 'planificador' ? '#modo-plan' : '#modo-historia', { force: true });
    await pg.click('#btn-empezar');
    await pg.waitForSelector('#decision, #limite');
  }
  // Elige la primera opción disponible y continúa, n veces (o hasta el final)
  async function avanzar(pg, n = 1) {
    for (let i = 0; i < n; i++) {
      const fase = await pg.evaluate(() => window.DZ_STATE.partida && window.DZ_STATE.partida.fase);
      if (fase === 'sindinero') { await pg.click('#sin-dinero button.primary:not([disabled])'); continue; }
      if (fase !== 'decision') return;
      await pg.locator('#decision button.primary:not([disabled])').first().click();
      await pg.click('#btn-continuar');
    }
  }
  async function hastaFin(pg) {
    for (let i = 0; i < 40; i++) {
      const paso = await pg.evaluate(() => window.DZ_STATE.paso);
      if (paso === 'fin') return; await avanzar(pg, 1);
    }
  }

  // ======================= Partida 1: contexto sin límite =======================
  const ctx1 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  store.contarInicios = async () => 0; // el límite se prueba más abajo
  let page = await nuevaPagina(ctx1);

  // ---- HU-27: gastos reales en origen ----
  await page.evaluate(() => { const S = window.DZ_STATE; S.sueldoOfrecido.importe = '45000'; S.paso = 'situacion'; });
  await rerender(page);
  await page.fill('#gasto-alquiler', '-50');
  await page.click('button[type=submit]');
  check('HU-27 esc.3 cantidad no válida', (await page.locator('.err').allInnerTexts()).some((s) => s.includes('Introduce una cantidad válida')) && await page.locator('[data-paso=situacion]').count() === 1);
  await page.fill('#gasto-alquiler', 'abc'); await page.click('button[type=submit]');
  check('HU-27 esc.3 texto no numérico', await page.locator('[data-paso=situacion]').count() === 1);
  const antes = await page.evaluate(() => window.DZ.calcular({ ...window.DZ_STATE, gastosOrigen: null, edad: 28, dineroMudanza: 3000, sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: 'EUR' }, sueldoOfrecido: { importe: 45000, tipo: 'bruto', pagas: 12, moneda: 'GBP' }, trabajo: { modalidad: 'hibrido', dias: 3 } }).diferencia);
  await page.fill('#gasto-alquiler', '750'); await page.fill('#gasto-comida', '300');
  await page.click('button[type=submit]'); await page.click('button[type=submit]');
  await page.waitForSelector('#coste');
  const filaAlq = await page.locator('#coste tbody tr').first().locator('td').first().innerText();
  check('HU-27 esc.1 alquiler 750 € del usuario', /750\s?€/.test(filaAlq) && /Tu dato/i.test(filaAlq), filaAlq.replace(/\s+/g, ' '));
  const despues = await page.evaluate(() => window.DZ.calcular({ ...window.DZ_STATE, gastosOrigen: { alquiler: 750, comida: 300 }, edad: 28, dineroMudanza: 3000, sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: 'EUR' }, sueldoOfrecido: { importe: 45000, tipo: 'bruto', pagas: 12, moneda: 'GBP' }, trabajo: { modalidad: 'hibrido', dias: 3 } }).diferencia);
  check('HU-27 esc.1 el número que duele cambia', Math.round(antes) !== Math.round(despues), `${Math.round(antes)} → ${Math.round(despues)}`);
  const filaTr = await page.locator('#coste tbody tr').nth(1).locator('td').first().innerText();
  check('HU-27 esc.2 gasto vacío = dato de la base marcado «estimado»', /estimado/i.test(filaTr), filaTr.replace(/\s+/g, ' '));
  await page.evaluate(() => { window.DZ_STATE.gastosOrigen = { alquiler: '', transporte: '', comida: '', facturas: '' }; });

  // ---- HU-28: habitación compartida ----
  await page.evaluate(() => { window.DZ_STATE.paso = 'situacion'; }); await rerender(page);
  const optHab = await page.locator('label.opt', { has: page.locator('#vivienda-habitacion') }).innerText();
  check('HU-28 esc.1 opción «Habitación compartida» con precio', /Habitación compartida/.test(optHab) && /£/.test(optHab), optHab.replace(/\s+/g, ' '));
  check('HU-28 esc.1 con su fuente (botón i)', await page.locator('label.opt', { has: page.locator('#vivienda-habitacion') }).locator('.info').count() === 1);
  await page.evaluate(() => { window.__hab = window.DZ_DATA.alquiler.filter((r) => r.zona_id === 'LON-00' && r.tipo_vivienda_id === 'habitacion'); window.DZ_DATA.alquiler = window.DZ_DATA.alquiler.filter((r) => !(r.zona_id === 'LON-00' && r.tipo_vivienda_id === 'habitacion')); });
  await rerender(page);
  check('HU-28 esc.2 sin dato, la opción no aparece', await page.locator('#vivienda-habitacion').count() === 0);
  await page.evaluate(() => { window.DZ_DATA.alquiler = window.DZ_DATA.alquiler.concat(window.__hab); window.DZ_STATE.vivienda = 'habitacion'; window.DZ_STATE.paso = 'resultado'; });
  await rerender(page);
  const hab = await page.evaluate(() => {
    const S = window.DZ_STATE; const room = window.DZ.alquiler('LON-00', 'habitacion').v;
    const R = window.DZ.calcular({ origen: 'MAD', destino: 'LON', edad: 28, vivienda: 'habitacion', trabajo: { modalidad: 'hibrido', dias: 3 }, nacionalidad: 'ue', dineroMudanza: 3000, sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: 'EUR' }, sueldoOfrecido: { importe: 45000, tipo: 'bruto', pagas: 12, moneda: 'GBP' } });
    const alq = R.coste.destino.partidas.find((p) => p.id === 'alquiler').d.v;
    const f = R.arranque.lineas.find((l) => l.id === 'fianza').dLocal.v; const pm = R.arranque.lineas.find((l) => l.id === 'primer_mes').dLocal.v;
    return { room, alq, f, pm, esperado: room * 12 / 52 * 5, agencia: R.arranque.lineas.find((l) => l.id === 'agencia').dLocal.sinDato };
  });
  check('HU-28 esc.3 alquiler, fianza y agencia con el precio de la habitación', Math.abs(hab.alq - hab.room) < 0.01 && Math.abs(hab.pm - hab.room) < 0.01 && Math.abs(hab.f - hab.esperado) < 0.01 && hab.agencia, JSON.stringify(hab));
  await page.evaluate(() => { window.DZ_STATE.vivienda = '1_dormitorio'; });

  // ---- HU-13 esc. 2 + HU-15 esc. 1 + HU-17 ----
  await hastaResultado(page, { conoceAlguien: false, dineroMudanza: '3000' });
  await empezar(page, null);
  const modo = await page.evaluate(() => window.DZ_STATE.partida.modo);
  check('HU-13 esc.2 sin elegir, modo historia', modo === 'historia');
  check('HU-15 esc.1 bienestar inicial 60', (await txt(page, '#hud-bienestar')) === '60');
  const imp = await page.evaluate(() => {
    const p = window.DZ_STATE.partida; const pas = p.pasos.filter((x) => x.tipo !== 'decision');
    const ids = pas.map((x) => x.id); const peq = p.imprevistos;
    const precios = ids.map((id) => window.DZ.precioImprevisto(id === 'cerrajero' ? window.DZJ.IMPREVISTO_GORDO : id, 'LON'));
    return { total: pas.length, peq: peq.length, gordoDia5: pas.some((x) => x.tipo === 'imprevisto_gordo' && x.dia === 5), unicos: new Set(ids).size === ids.length, monedas: [...new Set(precios.map((d) => d.moneda))], sinDato: precios.some((d) => d.sinDato) };
  });
  check('HU-17 esc.1 2-3 pequeños + el gordo del día 5 (3 o 4)', imp.peq >= 2 && imp.peq <= 3 && imp.gordoDia5 && imp.total >= 3 && imp.total <= 4, JSON.stringify(imp));
  check('HU-17 esc.1 precios de la ciudad de destino', imp.monedas.join() === 'GBP' && !imp.sinDato);
  const repes = await page.evaluate(() => {
    let ok = true;
    for (let seed = 1; seed <= 200; seed++) {
      const p = window.DZJ.crearPartida({ estado: { origen: 'MAD', destino: 'AMS', edad: 28, vivienda: 'estudio', trabajo: { modalidad: 'oficina' }, nacionalidad: 'ue', dineroMudanza: 3000 }, seed });
      const ids = p.pasos.filter((x) => x.tipo !== 'decision').map((x) => x.id);
      if (new Set(ids).size !== ids.length) ok = false;
    }
    return ok;
  });
  check('HU-17 esc.2 un imprevisto no se repite (200 partidas)', repes);

  // ---- HU-18 esc. 1: narración ----
  await page.waitForFunction(() => { const n = document.getElementById('narracion'); return n && !n.classList.contains('loading'); }, null, { timeout: 8000 });
  const narr1 = await txt(page, '#narracion');
  check('HU-18 esc.1 narración ≤ 120 palabras, en español, con la ciudad y la decisión anterior', narr1.split(/\s+/).length <= 120 && /Londres/.test(narr1) && /tu vuelo desde Madrid/i.test(narr1) && (await page.getAttribute('#narracion', 'data-fuente')) === 'ia', narr1);

  // ---- HU-14: día 1 con 3 decisiones; taxi vs transporte público en modo historia ----
  const delDia1 = await txt(page, '#decision .eyebrow');
  check('HU-14 día 1 con 3 decisiones', /Decisión 1 de 3/i.test(delDia1), delDia1);
  await page.locator('#decision .flat button.primary').first().click();
  await page.click('#btn-continuar');
  check('HU-13 esc.3 historia: precio oculto antes de elegir', (await page.locator('#decision .choice').first().innerText()).includes('Lo sabrás al elegir'));
  const dineroAntes = await page.evaluate(() => window.DZ_STATE.partida.dinero);
  await page.locator('#decision .choice', { hasText: 'Taxi' }).locator('button').click();
  const costeTaxi = await txt(page, '#coste-decision');
  const dineroDespues = await page.evaluate(() => window.DZ_STATE.partida.dinero);
  const precioTaxi = await page.evaluate(() => window.DZ.precioImprevisto('I09', 'LON').v);
  check('HU-14 esc.1 / HU-13 esc.3 veo lo que me ha costado con su precio real', /95\s?£/.test(costeTaxi) && precioTaxi === 95, costeTaxi.split('\n')[0]);
  check('HU-14 esc.1 mi dinero se actualiza', Math.abs((dineroAntes - dineroDespues) - 95) < 0.001 && (await txt(page, '#hud-dinero')).replace(/\D/g, '') === String(Math.round(dineroDespues)), `${dineroAntes.toFixed(0)} → ${dineroDespues.toFixed(0)} (${await txt(page, '#hud-dinero')})`);
  check('HU-15 esc.2 veo el cambio (+/–) del indicador', await page.locator('#hud-bienestar-delta').count() === 1 && /\+6/.test(await txt(page, '#hud-bienestar-delta')));
  await page.click('#btn-continuar');
  check('HU-14 esc.1 paso a la siguiente decisión del día', /Decisión 3 de 3/i.test(await txt(page, '#decision .eyebrow')));
  await page.screenshot({ path: path.join(SHOTS, 's2-decision.png'), fullPage: true });

  // ---- HU-15 esc. 2: el bienestar no pasa de 100 ----
  await page.evaluate(() => { window.DZ_STATE.partida.bienestar = 98; });
  await page.locator('#decision .choice', { hasText: 'restaurante' }).locator('button').click();
  check('HU-15 esc.2 el valor se mantiene entre 0 y 100', (await txt(page, '#hud-bienestar')) === '100');
  await page.click('#btn-continuar');

  // ---- HU-18 en inglés + HU-19 ----
  await page.waitForFunction(() => { const n = document.getElementById('narracion'); return n && !n.classList.contains('loading'); }, null, { timeout: 8000 });
  check('HU-18 esc.1 día 2 menciona la decisión anterior', /restaurante/i.test(await txt(page, '#narracion')), await txt(page, '#narracion'));
  await page.click('#lang');
  await page.waitForFunction(() => { const n = document.getElementById('narracion'); return n && !n.classList.contains('loading'); }, null, { timeout: 8000 });
  check('HU-18 esc.1 en el idioma del usuario (inglés)', /London/.test(await txt(page, '#narracion')) && /dawns/.test(await txt(page, '#narracion')));
  await page.click('#lang');
  // Cifra inventada -> texto de reserva
  modoIA = 'cifra';
  await avanzar(page, 4);
  await page.waitForFunction(() => { const n = document.getElementById('narracion'); return n && !n.classList.contains('loading'); }, null, { timeout: 8000 });
  const nCifra = await txt(page, '#narracion');
  check('HU-18 esc.2 cifra que no viene del motor -> texto de reserva', !/4321/.test(nCifra) && (await page.getAttribute('#narracion', 'data-fuente')) === 'reserva', nCifra.slice(0, 80));
  // IA lenta -> texto de reserva sin error
  modoIA = 'lento';
  const diaLento = await page.evaluate(() => window.DZJ.diaActual(window.DZ_STATE.partida));
  for (let i = 0; i < 6; i++) { const d = await page.evaluate(() => window.DZJ.diaActual(window.DZ_STATE.partida)); if (d !== diaLento) break; await avanzar(page, 1); }
  await page.waitForFunction(() => { const n = document.getElementById('narracion'); return n && !n.classList.contains('loading'); }, null, { timeout: 8000 });
  check('HU-19 esc.1 la IA tarda demasiado -> texto de reserva', (await page.getAttribute('#narracion', 'data-fuente')) === 'reserva');
  const textoPagina = await page.locator('#app').innerText();
  check('HU-19 esc.2 sin mensaje de error', !/error|fallo|failed/i.test(textoPagina));
  modoIA = 'ok';

  // ---- HU-14 esc. 2 + HU-29 esc. 2: recargar en el día 4 ----
  await page.evaluate(() => {
    const S = window.DZ_STATE; const J = window.DZJ;
    S.partida = J.crearPartida({ estado: { origen: 'MAD', destino: 'LON', edad: 28, vivienda: '1_dormitorio', trabajo: { modalidad: 'hibrido', dias: 3 }, nacionalidad: 'ue', dineroMudanza: 9000 }, seed: 11, colchon: 2000 });
    const p = S.partida;
    while (J.diaActual(p) < 4) { if (p.fase === 'sindinero') { J.aplicarSalida(p, 'tarjeta'); continue; } J.elegir(p, J.opcionesActuales(p).filter((o) => !o.bloqueada)[0].id); J.continuar(p); }
    S.paso = 'juego';
  });
  await rerender(page);
  const antesRecarga = await page.evaluate(() => ({ dia: window.DZJ.diaActual(window.DZ_STATE.partida), dinero: Math.round(window.DZ_STATE.partida.dinero), bien: window.DZ_STATE.partida.bienestar }));
  const hudAntes = await txt(page, '.hud');
  await page.reload(); await page.waitForFunction(() => window.DZ_STATE && window.DZ_STATE.paso);
  const trasRecarga = await page.evaluate(() => ({ paso: window.DZ_STATE.paso, dia: window.DZJ.diaActual(window.DZ_STATE.partida), dinero: Math.round(window.DZ_STATE.partida.dinero), bien: window.DZ_STATE.partida.bienestar }));
  check('HU-14 esc.2 / HU-29 esc.2 recargo y sigo en el día 4 con los mismos indicadores', trasRecarga.paso === 'juego' && trasRecarga.dia === 4 && antesRecarga.dia === 4 && trasRecarga.dinero === antesRecarga.dinero && trasRecarga.bien === antesRecarga.bien && (await txt(page, '.hud')) === hudAntes, `${JSON.stringify(antesRecarga)} → ${JSON.stringify(trasRecarga)}`);

  // ---- HU-16: sin dinero ----
  await page.evaluate(() => { window.DZ_STATE.partida.dinero = 5; }); await rerender(page);
  if (await page.evaluate(() => window.DZ_STATE.partida.fase) === 'resultado') await page.click('#btn-continuar');
  await page.locator('#decision button.primary:not([disabled])').first().click(); await page.click('#btn-continuar');
  const broke = await page.locator('#sin-dinero').count();
  const salidas = await page.locator('#sin-dinero .choice h3').allInnerTexts();
  check('HU-16 esc.1 pantalla «Sin dinero» con 4 salidas', broke === 1 && salidas.length === 4 && /colchón/.test(salidas[0]) && /familia/.test(salidas[1]) && /tarjeta/.test(salidas[2]) && /Recortar/.test(salidas[3]), salidas.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 's2-sindinero.png'), fullPage: true });
  const b0 = await page.evaluate(() => window.DZ_STATE.partida.bienestar);
  await page.click('#salida-familia');
  const tras = await page.evaluate(() => ({ b: window.DZ_STATE.partida.bienestar, s: window.DZ_STATE.partida.salidas, fase: window.DZ_STATE.partida.fase }));
  const ult = tras.s[tras.s.length - 1];
  check('HU-16 esc.2 se aplica la penalización y queda anotada', tras.b === Math.max(0, b0 - 10) && ult.id === 'familia' && ult.db === -10 && tras.fase === 'decision', JSON.stringify(tras));

  // ---- HU-20 / HU-21 ----
  await hastaFin(page);
  const ver = await txt(page, '#veredicto-titulo');
  check('HU-20 esc.2 usé una salida de «sin dinero» -> «Por los pelos» (o peor)', /Por los pelos|La ciudad pudo contigo/.test(ver), ver);
  const enc = Number(await txt(page, '#encaje'));
  check('HU-20 esc.4 puntuación de encaje 0-100', enc >= 0 && enc <= 100, String(enc));
  await page.screenshot({ path: path.join(SHOTS, 's2-veredicto.png'), fullPage: true });
  await page.click('#btn-informe');
  const inf = await page.locator('#informe').innerText();
  check('HU-21 esc.1 informe: resumen, gasto de la semana, veredicto y fuentes', /Resumen económico/.test(inf) && /Lo que gastaste en la semana/.test(inf) && /Encaje/.test(inf) && /Fuentes usadas/.test(inf) && await page.locator('#inf-fuentes li').count() > 3);
  check('HU-21 informe anota la salida usada', /Pedir ayuda a la familia/.test(inf));
  await page.screenshot({ path: path.join(SHOTS, 's2-informe.png'), fullPage: true });

  // ---- HU-21 esc. 2: sueldo mínimo con número negativo ----
  await page.evaluate(() => { window.DZ_STATE.sueldoOfrecido.importe = '30000'; }); await rerender(page);
  const cambiar = await txt(page, '#inf-cambiar');
  const comprob = await page.evaluate(() => {
    const S = window.DZ_STATE; const e = { origen: 'MAD', destino: 'LON', edad: 28, vivienda: S.vivienda, trabajo: { modalidad: S.trabajo.modalidad, dias: Number(S.trabajo.dias) }, nacionalidad: 'ue', dineroMudanza: 3000, sueldoActual: { importe: 30000, tipo: 'bruto', pagas: 14, moneda: 'EUR' }, sueldoOfrecido: { importe: 30000, tipo: 'bruto', pagas: 12, moneda: 'GBP' }, piso: S.partida.piso };
    const min = window.DZ.sueldoMinimo(e); return { neg: window.DZ.calcular(e).diferencia < 0, dif0: window.DZ.calcular({ ...e, sueldoOfrecido: { ...e.sueldoOfrecido, importe: min.importe } }).diferencia };
  });
  check('HU-21 esc.2 sueldo bruto mínimo con el que la diferencia sería 0', comprob.neg && /sueldo bruto mínimo en Londres tendría que ser [\d.,]+\s?£ al año/.test(cambiar) && Math.abs(comprob.dif0) < 1, cambiar.split('\n')[1]);

  // ---- HU-22 esc. 1: crear cuenta tras la partida sin cuenta ----
  await page.click('[data-act=guardar]');
  await page.waitForSelector('#cuenta-email');
  await page.fill('#cuenta-email', 'clara@example.com'); await page.fill('#cuenta-pass', 'contrasena-segura');
  await page.click('#btn-cuenta');
  await page.waitForSelector('#mis-partidas .game, #mis-vacio');
  const mis = await page.locator('#mis-partidas .game').count();
  check('HU-22 esc.1 la partida aparece en «Mis partidas»', mis === 1, `${mis} partida(s)`);
  await page.screenshot({ path: path.join(SHOTS, 's2-mispartidas.png'), fullPage: true });

  // ---- HU-22 esc. 2: otro usuario no ve mis partidas ----
  const ctx2 = await browser.newContext(); const p2 = await nuevaPagina(ctx2);
  await p2.click('#cuenta-btn'); await p2.fill('#cuenta-email', 'otro@example.com'); await p2.fill('#cuenta-pass', 'otra-contrasena');
  await p2.click('#btn-cuenta'); await p2.waitForSelector('#mis-partidas .game, #mis-vacio');
  check('HU-22 esc.2 otro usuario no ve mis partidas', await p2.locator('#mis-partidas .game').count() === 0 && await p2.locator('#mis-vacio').count() === 1);
  const api403 = await p2.evaluate(async () => (await fetch('/api/partidas')).json());
  check('HU-22 esc.2 la API solo devuelve las suyas', Array.isArray(api403) && api403.length === 0);

  // ---- HU-23: límites ----
  delete store.contarInicios; Object.assign(store, storeArchivo(storeFile)); await store.init();
  const ctx3 = await browser.newContext(); const p3 = await nuevaPagina(ctx3);
  await hastaResultado(p3); await empezar(p3);
  check('HU-23 primera partida sin cuenta permitida', await p3.locator('#decision').count() === 1);
  await p3.evaluate(() => { window.DZ_STATE.partida = null; window.DZ_STATE.paso = 'resultado'; }); await rerender(p3);
  await p3.click('#btn-semana'); await p3.click('#btn-empezar'); await p3.waitForSelector('#limite');
  check('HU-23 esc.1 la segunda sin cuenta pide crear cuenta', (await p3.evaluate(() => window.DZ_STATE.paso)) === 'cuenta' && /Crea una cuenta para jugar otra/.test(await txt(p3, '#limite')));
  await p3.fill('#cuenta-email', 'limite@example.com'); await p3.fill('#cuenta-pass', 'contrasena-larga'); await p3.click('#btn-cuenta');
  await p3.waitForSelector('#mis-partidas');
  for (let i = 0; i < 3; i++) {
    await p3.evaluate(() => { window.DZ_STATE.partida = null; window.DZ_STATE.paso = 'resultado'; }); await rerender(p3);
    await p3.click('#btn-semana'); await p3.click('#btn-empezar'); await p3.waitForSelector('#decision, #limite');
  }
  const terceraOk = await p3.locator('#decision').count() === 1;
  await p3.evaluate(() => { window.DZ_STATE.partida = null; window.DZ_STATE.paso = 'resultado'; }); await rerender(p3);
  await p3.click('#btn-semana'); await p3.click('#btn-empezar'); await p3.waitForSelector('#limite');
  check('HU-23 esc.2 con cuenta, la 4.ª del día -> «Vuelve mañana para jugar otra»', terceraOk && /Vuelve mañana para jugar otra/.test(await txt(p3, '#limite')));

  // ---- HU-26: Google ----
  store.contarInicios = async () => 0;
  const ctx4 = await browser.newContext(); let p4 = await nuevaPagina(ctx4);
  await hastaResultado(p4); await empezar(p4); await hastaFin(p4);
  modoSSO = 'cancelar';
  await p4.click('#btn-guardar'); await p4.waitForSelector('#sso-google');
  await p4.click('#sso-google'); await p4.waitForFunction(() => window.DZ_STATE && document.getElementById('toast') && !document.getElementById('toast').hidden);
  check('HU-26 esc.3 cancelo el permiso: sigo sin cuenta y veo «No se ha podido iniciar sesión»', /No se ha podido iniciar sesión/.test(await txt(p4, '#toast')) && !(await p4.evaluate(() => window.DZ_STATE.usuario)) && !!(await p4.evaluate(() => window.DZ_STATE.partida)), await txt(p4, '#toast'));
  modoSSO = 'ok';
  await p4.evaluate(() => { window.DZ_STATE.paso = 'cuenta'; }); await rerender(p4);
  await p4.click('#sso-google'); await p4.waitForFunction(() => window.DZ_STATE && window.DZ_STATE.usuario, null, { timeout: 8000 });
  await p4.waitForFunction(() => window.DZ_STATE.pendiente === null);
  await p4.click('#cuenta-btn'); await p4.waitForSelector('#mis-partidas .game, #mis-vacio');
  check('HU-26 esc.1 entro con Google y la partida aparece en «Mis partidas»', await p4.locator('#mis-partidas .game').count() === 1 && /ana.google@example.com/.test(await txt(p4, '#mis-partidas')));
  // Vuelvo otro día: misma cuenta, sin crear otra
  const ctx5 = await browser.newContext(); const p5 = await nuevaPagina(ctx5);
  await p5.click('#cuenta-btn'); await p5.click('#sso-google'); await p5.waitForFunction(() => window.DZ_STATE && window.DZ_STATE.usuario, null, { timeout: 8000 });
  await p5.click('#cuenta-btn'); await p5.waitForSelector('#mis-partidas .game, #mis-vacio');
  const usuariosGoogle = JSON.parse(fs.readFileSync(storeFile, 'utf8')).users.filter((u) => u.google === 'google-sub-1').length;
  check('HU-26 esc.2 entro directamente, sin cuenta nueva, y veo mis partidas', usuariosGoogle === 1 && await p5.locator('#mis-partidas .game').count() === 1);

  // ---- HU-29 esc. 1 y 3: cerrar la pestaña y volver; empezar de cero ----
  const ctx6 = await browser.newContext(); let p6 = await nuevaPagina(ctx6);
  await p6.check('#origen-MAD', { force: true }); await p6.check('#destino-ZRH', { force: true }); await p6.click('button[type=submit]');
  await p6.fill('#sueldoOfrecido-importe', '91000'); await p6.waitForTimeout(100);
  await p6.click('button[type=submit]');
  await p6.close(); // cierro la pestaña
  p6 = await nuevaPagina(ctx6);
  const banner = await p6.locator('#btn-continuar-partida').count();
  check('HU-29 esc.1 aparece «Continuar partida»', banner === 1 && /Madrid → Zúrich/.test(await txt(p6, '.resume')));
  await p6.click('#btn-continuar-partida');
  check('HU-29 esc.1 con mis datos ya rellenados', (await p6.evaluate(() => window.DZ_STATE.paso)) === 'situacion' && (await p6.evaluate(() => window.DZ_STATE.sueldoOfrecido.importe)) === '91000');
  await p6.close(); p6 = await nuevaPagina(ctx6);
  await p6.click('#btn-empezar-cero');
  check('HU-29 esc.3 pide confirmación', await p6.locator('#btn-borrar-si').count() === 1 && /Seguro/.test(await txt(p6, '.resume')));
  await p6.click('#btn-borrar-si');
  const borrado = await p6.evaluate(() => ({ ls: localStorage.getItem('dz-estado'), paso: window.DZ_STATE.paso, dest: window.DZ_STATE.destino, sueldo: window.DZ_STATE.sueldoOfrecido.importe }));
  check('HU-29 esc.3 se borran los datos y vuelvo a la portada', borrado.paso === 'inicio' && borrado.dest === 'LON' && borrado.sueldo === '' && await p6.locator('.resume').count() === 0, JSON.stringify(borrado).slice(0, 120));

  // ---- HU-13 esc. 1: planificador ----
  const ctx7 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p7 = await nuevaPagina(ctx7);
  await hastaResultado(p7, { trabajo: { modalidad: 'oficina', dias: '3' } }); await empezar(p7, 'planificador');
  check('HU-13 esc.1 planificador: narración y precio de cada opción antes de elegir', /\d+\s?min/.test(await p7.locator('.flat').first().innerText()) && await p7.locator('#narracion').count() === 1);
  await avanzar(p7, 1);
  const op = await p7.locator('#decision .choice').first().innerText();
  check('HU-13 esc.1 planificador muestra el precio', /£\s?\d/.test(op) && !/Lo sabrás/.test(op), op.replace(/\s+/g, ' '));
  const ow = await p7.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Móvil sin scroll horizontal en la semana', ow <= 0, `overflow ${ow}px`);
  await p7.screenshot({ path: path.join(SHOTS, 's2-movil.png'), fullPage: true });

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await browser.close(); server.close(); ia.close(); sso.close();
  try { fs.unlinkSync(storeFile); } catch (e) { /* nada */ }
  const fail = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}${r.info ? '  · ' + r.info : ''}`));
  console.log(`\n${results.length - fail.length}/${results.length} escenarios OK`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
