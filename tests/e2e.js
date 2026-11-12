// Prueba de aceptación en navegador (Playwright): node tests/e2e.js
// Recorre los escenarios de las historias del Sprint 1 sobre dist/index.html.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const FILE = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
fs.mkdirSync(path.resolve(__dirname, '../shots'), { recursive: true });
const results = [];
const check = (id, ok, info = '') => { results.push({ id, ok: !!ok, info }); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_INTERNET/.test(m.text())) errors.push(m.text()); });
  await page.goto(FILE);
  const text = async (sel) => (await page.locator(sel).first().innerText()).trim();

  // HU-01 esc. 2: misma ciudad
  await page.selectOption('#origen', 'MAD'); await page.selectOption('#destino', 'MAD');
  await page.click('button[type=submit]');
  check('HU-01 esc.2 aviso misma ciudad', (await page.locator('.err').innerText()).includes('Elige dos ciudades distintas'));
  check('HU-01 esc.2 no avanza', await page.locator('[data-paso=inicio]').count() === 1);
  // HU-01 esc. 1
  await page.selectOption('#destino', 'LON'); await page.click('button[type=submit]');
  check('HU-01 esc.1 pasa a sueldo', await page.locator('[data-paso=sueldo]').count() === 1);
  const route = await text('.route');
  check('HU-01 esc.1 ciudades arriba', route.includes('Madrid') && route.includes('Londres'), route.replace(/\s+/g, ' '));

  // HU-02 esc. 2: sueldo vacío
  await page.fill('#sueldoOfrecido-importe', '');
  await page.click('button[type=submit]');
  check('HU-02 esc.2 aviso sueldo', (await page.locator('.err').allInnerTexts()).some((s) => s.includes('Introduce un sueldo válido')));
  check('HU-02 esc.2 no avanza', await page.locator('[data-paso=sueldo]').count() === 1);
  await page.fill('#sueldoOfrecido-importe', '0'); await page.click('button[type=submit]');
  check('HU-02 esc.2 sueldo 0', await page.locator('[data-paso=sueldo]').count() === 1);
  // HU-02 esc. 1: 30.000 € brutos 14 pagas -> se ve en libras
  await page.fill('#sueldoActual-importe', '30000');
  await page.check('#sueldoActual-pagas-14', { force: true });
  const conv = await text('[data-conv=sueldoActual]');
  check('HU-02 esc.1 se muestra en libras', /Londres: [\d.,]+\s?£/.test(conv), conv);
  await page.fill('#sueldoOfrecido-importe', '45000');
  await page.click('button[type=submit]');
  check('HU-02 esc.1 guardado y avanza', await page.locator('[data-paso=situacion]').count() === 1);

  // HU-03
  await page.fill('#dineroMudanza', '3000'); await page.fill('#colchon', '2000');
  await page.click('button[type=submit]');
  // HU-24 esc. 3: híbrido sin días
  await page.evaluate(() => { window.DZ_STATE.trabajo.dias = ''; });
  await page.check('#modalidad-hibrido', { force: true });
  await page.click('button[type=submit]');
  check('HU-24 esc.3 aviso días', (await page.locator('.err').innerText()).includes('Indica cuántos días vas a la oficina'));
  await page.check('#dias-3', { force: true });
  await page.click('button[type=submit]');
  check('Resultado visible', await page.locator('#numero-que-duele').count() === 1);

  // HU-24 esc. 1: transporte con 3 días
  const tr = await page.locator('#coste tbody tr').nth(1).innerText();
  check('HU-24 esc.1 transporte con 3 días', /3 días/.test(tr), tr.replace(/\s+/g, ' '));
  // HU-09
  const neto = await page.locator('#neto .col').allInnerTexts();
  check('HU-09 esc.1 neto lado a lado', neto.length === 2 && neto[0].includes('Madrid') && neto[1].includes('Londres'));
  check('HU-09 esc.2 indica paga normal / prorrateado', /prorrateadas/.test(neto[0]) && /Paga normal/.test(neto[0]), neto[0].split('\n').slice(0, 5).join(' | '));
  // HU-10
  const coste = await page.locator('#coste').innerText();
  check('HU-10 partidas y total', ['Alquiler', 'Transporte', 'Comida', 'Facturas', 'Total'].every((k) => coste.includes(k)));
  // HU-12
  const ouch = await text('#numero-que-duele');
  check('HU-12 frase', /^En Londres te quedan .+ (más|menos) al mes que en Madrid$/.test(ouch), ouch);
  check('HU-12 esc.3 botón semana', await page.locator('#btn-semana').isVisible());
  // HU-08 esc. 1: £ y €
  const fx = await text('.fx');
  check('HU-08 esc.1 tipo BCE y fecha', /Banco Central Europeo del \d\d\/\d\d\/\d{4}/.test(fx), fx);
  const celdaAlq = await page.locator('#coste tbody tr').first().locator('td').nth(1).innerText();
  check('HU-08 esc.1 importe en £ y €', /£/.test(celdaAlq) && /€/.test(celdaAlq), celdaAlq.replace(/\s+/g, ' '));
  // HU-11 esc. 1: visado en el desglose
  const arr = await page.locator('#arranque').innerText();
  check('HU-11 esc.1 visado como línea', /Permiso o visado/.test(arr) && /Skilled Worker/.test(arr));
  // HU-07 esc. 1 y 2: botón i
  await page.locator('#coste tbody tr').first().locator('.info').nth(1).click();
  const sheet = await text('#sheet');
  check('HU-07 esc.1 fuente, fecha y enlace', /Fecha/.test(sheet) && (await page.locator('#sheet a').count()) > 0, sheet.split('\n').slice(0, 4).join(' | '));
  check('HU-07 esc.2 secundaria marcada', /Estimación de fuente secundaria/i.test(sheet) || /ESTIMACIÓN DE FUENTE SECUNDARIA/.test(sheet));
  await page.click('.sheet-close');
  // HU-05 esc. 2: dato pendiente -> sin dato (agencia)
  check('HU-05 esc.2 sin dato visible', /sin dato/.test(arr));
  await page.screenshot({ path: path.resolve(__dirname, '../shots/resultado.png'), fullPage: true });

  // HU-04 esc. 1: cambio de idioma sin perder datos
  await page.click('#lang');
  const ouchEn = await text('#numero-que-duele');
  check('HU-04 esc.1 todo en inglés', /^In London you have .+ (more|less) left each month than in Madrid$/.test(ouchEn), ouchEn);
  check('HU-04 esc.1 datos conservados', (await page.evaluate(() => window.DZ_STATE.sueldoOfrecido.importe)) === '45000');
  // HU-04 esc. 2: recuerda el idioma
  await page.reload();
  check('HU-04 esc.2 abre en inglés', (await text('#lang')) === 'Español');
  await page.click('#lang');

  // HU-11 esc. 2 y HU-12 esc. 1/3 con sueldo bajo
  await page.evaluate(() => { const S = window.DZ_STATE; S.origen = 'MAD'; S.destino = 'LON'; S.sueldoActual = { importe: '30000', tipo: 'bruto', pagas: 14, moneda: 'EUR' }; S.sueldoOfrecido = { importe: '18000', tipo: 'bruto', pagas: 12, moneda: 'GBP' }; S.paso = 'trabajo'; });
  await page.click('#lang'); await page.click('#lang');
  await page.click('button[type=submit]');
  const arr2 = await page.locator('#arranque').innerText();
  check('HU-11 esc.2 no lo recuperas', /Con este sueldo no lo recuperas/.test(arr2));
  const ouch2 = await text('#numero-que-duele');
  check('HU-12 esc.1 diferencia negativa', /menos al mes/.test(ouch2), ouch2);
  check('HU-12 esc.3 botón también si negativa', await page.locator('#btn-semana').isVisible());

  // HU-08 esc. 2: dos ciudades en euro, sin conversión
  await page.evaluate(() => { const S = window.DZ_STATE; S.destino = 'AMS'; S.sueldoOfrecido = { importe: '50000', tipo: 'bruto', pagas: 12, moneda: 'EUR' }; S.paso = 'trabajo'; });
  await page.click('#lang'); await page.click('#lang');
  await page.click('button[type=submit]');
  check('HU-08 esc.2 sin conversión', (await page.locator('.amt-alt').count()) === 0 && (await page.locator('.fx').count()) === 0);
  // HU-05 esc. 1: alquiler de Ámsterdam con fecha
  await page.locator('#coste tbody tr').first().locator('.info').nth(1).click();
  const sAms = await text('#sheet');
  check('HU-05 esc.1 alquiler de Ámsterdam con fecha', /Pararius|Kamernet|Rent\.nl/i.test(sAms) && /Fecha\s*\n?\s*20\d\d/.test(sAms), sAms.split('\n').slice(0, 4).join(' | '));
  await page.click('.sheet-close');
  // NL seguro médico sin dato
  check('HU-05 esc.2 seguro NL sin dato', /Seguro médico obligatorio[\s\S]*sin dato/.test(await page.locator('#coste').innerText()));

  // HU-03 + HU-25
  await page.evaluate(() => { const S = window.DZ_STATE; S.conoceAlguien = true; });
  await page.click('#btn-semana');
  check('HU-03 esc.1 dinero inicial 3.000 €', /3\.?000\s?€/.test(await text('#hud-dinero')), await text('#hud-dinero'));
  check('HU-03 esc.1 colchón aparte', /2\.?000\s?€/.test(await text('#hud-colchon')));
  check('HU-03 esc.2 bienestar 80', (await text('#hud-bienestar')) === '80');
  check('HU-25 esc.1 tres pisos con alquiler', (await page.locator('.flat').count()) === 3);
  check('HU-25 esc.3 modo historia oculta trayecto', (await page.locator('.flat').first().innerText()).includes('Lo descubrirás'));
  await page.check('#modo-plan', { force: true });
  check('HU-25 esc.1 trayecto visible en planificador', /\d+ min/.test(await page.locator('.flat').first().innerText()));
  await page.check('#modo-historia', { force: true });
  await page.locator('.flat button.primary').first().click();
  const rev = await text('.reveal');
  check('HU-25 esc.3 descubre trayecto tras elegir', /tardas \d+ minutos/.test(rev), rev.split('\n')[0]);
  await page.screenshot({ path: path.resolve(__dirname, '../shots/semana.png'), fullPage: true });
  const zona = await page.evaluate(() => window.DZ_STATE.piso);
  await page.click('[data-act=informe]');
  const alqInf = await page.locator('#coste tbody tr').first().innerText();
  check('HU-25 esc.2 alquiler del piso en el informe', alqInf.includes(zona.zonaNombre) && (await text('.hero')).toLowerCase().includes(zona.zonaNombre.toLowerCase()), alqInf.replace(/\s+/g, ' '));
  // HU-24 esc. 2: remoto
  await page.evaluate(() => { const S = window.DZ_STATE; S.trabajo.modalidad = 'remoto'; S.paso = 'semana'; });
  await page.click('#lang'); await page.click('#lang');
  check('HU-24 esc.2 remoto sin trayecto', /desde el piso: no hay trayecto/.test(await page.locator('.week').innerText()));
  // Zúrich
  await page.evaluate(() => { const S = window.DZ_STATE; S.destino = 'ZRH'; S.piso = null; S.trabajo.modalidad = 'oficina'; S.sueldoOfrecido = { importe: '95000', tipo: 'bruto', pagas: 12, moneda: 'CHF' }; S.paso = 'resultado'; });
  await page.click('#lang'); await page.click('#lang');
  const zrh = await page.locator('#coste').innerText();
  check('Zúrich: CHF y seguro médico', /CHF/.test(zrh) && /Seguro médico obligatorio/.test(zrh));

  // Móvil
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(FILE);
  await m.evaluate(() => { const S = window.DZ_STATE; S.sueldoOfrecido.importe = '45000'; S.paso = 'resultado'; });
  await m.click('#lang'); await m.click('#lang');
  const ow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Móvil sin scroll horizontal', ow <= 0, `overflow ${ow}px`);
  await m.screenshot({ path: path.resolve(__dirname, '../shots/movil.png'), fullPage: true });

  check('Sin errores de JavaScript', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fail = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}${r.info ? '  · ' + r.info : ''}`));
  console.log(`\n${results.length - fail.length}/${results.length} escenarios OK`);
  process.exit(fail.length ? 1 : 0);
})();
