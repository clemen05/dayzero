// HU-22 cuentas con email · HU-26 inicio de sesión con Google o Microsoft · HU-23 límite de partidas
// Sesión en una cookie firmada (HMAC). Contraseñas con scrypt. OAuth 2.0 / OpenID Connect sin librerías.
const crypto = require('crypto');
const express = require('express');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('  Aviso: SESSION_SECRET no está definido; las sesiones se pierden al reiniciar el servidor.');
const DIAS_SESION = 30;
const LIMITE_ANONIMO = 1;
const LIMITE_DIARIO = 3;

// ---------- Cookies firmadas ----------
const firmar = (v) => `${v}.${crypto.createHmac('sha256', SECRET).update(v).digest('base64url')}`;
function verificar(s) {
  if (!s || typeof s !== 'string') return null;
  const i = s.lastIndexOf('.'); if (i < 0) return null;
  const v = s.slice(0, i);
  const a = Buffer.from(firmar(v)); const b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? v : null;
}
function leerCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function ponerCookie(req, res, nombre, valor, maxAgeS) {
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeS}`];
  if (seguro) partes.push('Secure');
  const prev = res.getHeader('Set-Cookie'); const lista = Array.isArray(prev) ? prev : prev ? [prev] : [];
  res.setHeader('Set-Cookie', lista.concat(partes.join('; ')));
}

// ---------- Contraseñas ----------
function hashPass(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pass, salt, 64).toString('hex')}`;
}
function comprobarPass(pass, guardado) {
  if (!guardado) return false;
  const [salt, h] = guardado.split(':');
  const a = Buffer.from(h, 'hex'); const b = crypto.scryptSync(pass, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const emailValido = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const fechaMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

// ---------- Proveedores OAuth (las URLs se pueden cambiar para los tests) ----------
function proveedores() {
  return {
    google: {
      id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
      auth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
      token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      extra: { prompt: 'select_account' },
    },
    microsoft: {
      id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET,
      auth: process.env.MICROSOFT_AUTH_URL || 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: process.env.MICROSOFT_TOKEN_URL || 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      extra: { prompt: 'select_account' },
    },
  };
}
const baseUrl = (req) => process.env.BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
// El id_token llega directamente del endpoint de tokens del proveedor por HTTPS, así que basta con leer sus datos.
function leerIdToken(t) {
  try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

function crearAuth(store) {
  const router = express.Router();

  async function usuarioDe(req) {
    const v = verificar(leerCookies(req).dz_sid);
    if (!v) return null;
    const [id, exp] = v.split('|');
    if (!exp || Date.now() > Number(exp)) return null;
    return store.usuarioPorId(id);
  }
  function iniciarSesion(req, res, user) {
    const exp = Date.now() + DIAS_SESION * 86400000;
    ponerCookie(req, res, 'dz_sid', firmar(`${user.id}|${exp}`), DIAS_SESION * 86400);
  }
  // Identificador anónimo del navegador (para el límite de 1 partida sin cuenta)
  function anonimoDe(req, res) {
    let a = verificar(leerCookies(req).dz_anon);
    if (!a) { a = crypto.randomUUID(); ponerCookie(req, res, 'dz_anon', firmar(a), 365 * 86400); }
    return a;
  }
  const publico = (u) => (u ? { id: u.id, email: u.email, nombre: u.nombre, google: !!u.google, microsoft: !!u.microsoft } : null);

  // ----- Sesión -----
  router.get('/auth/yo', async (req, res) => {
    const p = proveedores();
    res.json({ usuario: publico(await usuarioDe(req)), sso: { google: !!(p.google.id && p.google.secret), microsoft: !!(p.microsoft.id && p.microsoft.secret) } });
  });

  router.post('/auth/registro', async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const pass = String((req.body || {}).password || '');
    if (!emailValido(email)) return res.status(400).json({ error: 'email_invalido' });
    if (pass.length < 8) return res.status(400).json({ error: 'password_corta' });
    if (await store.usuarioPorEmail(email)) return res.status(409).json({ error: 'email_existe' });
    const user = await store.crearUsuario({ email, pass: hashPass(pass) });
    iniciarSesion(req, res, user);
    res.status(201).json({ usuario: publico(user) });
  });

  router.post('/auth/login', async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const user = await store.usuarioPorEmail(email);
    if (!user || !comprobarPass(String((req.body || {}).password || ''), user.pass)) return res.status(401).json({ error: 'credenciales' });
    iniciarSesion(req, res, user);
    res.json({ usuario: publico(user) });
  });

  router.post('/auth/logout', (req, res) => { ponerCookie(req, res, 'dz_sid', '', 0); res.json({ ok: true }); });

  // ----- HU-26: Google y Microsoft -----
  router.get('/auth/:prov(google|microsoft)', (req, res) => {
    const prov = proveedores()[req.params.prov];
    if (!prov.id || !prov.secret) return res.redirect('/?login=no_configurado');
    const state = crypto.randomBytes(16).toString('hex');
    ponerCookie(req, res, 'dz_oauth', firmar(`${req.params.prov}|${state}`), 600);
    const q = new URLSearchParams({
      client_id: prov.id, redirect_uri: `${baseUrl(req)}/api/auth/${req.params.prov}/callback`, response_type: 'code',
      scope: 'openid email profile', state, ...prov.extra,
    });
    res.redirect(`${prov.auth}?${q}`);
  });

  router.get('/auth/:prov(google|microsoft)/callback', async (req, res) => {
    const nombre = req.params.prov; const prov = proveedores()[nombre];
    const guardado = verificar(leerCookies(req).dz_oauth);
    ponerCookie(req, res, 'dz_oauth', '', 0);
    // HU-26 esc. 3: si se cancela el permiso, se vuelve a la partida sin cuenta con un aviso
    if (req.query.error || !req.query.code || !guardado || guardado !== `${nombre}|${req.query.state}`) return res.redirect('/?login=error');
    try {
      const r = await fetch(prov.token, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          code: String(req.query.code), client_id: prov.id, client_secret: prov.secret,
          redirect_uri: `${baseUrl(req)}/api/auth/${nombre}/callback`, grant_type: 'authorization_code',
        }),
      });
      if (!r.ok) return res.redirect('/?login=error');
      const tok = await r.json();
      const c = leerIdToken(tok.id_token);
      const sub = c && (c.sub || c.oid);
      const email = c && String(c.email || c.preferred_username || '').toLowerCase();
      if (!sub) return res.redirect('/?login=error');
      // HU-26 esc. 2: si ya entró antes con este proveedor (o con el mismo email), es la misma cuenta
      let user = await store.usuarioPorProveedor(nombre, sub);
      if (!user && email && emailValido(email)) {
        user = await store.usuarioPorEmail(email);
        if (user) user = await store.vincularProveedor(user.id, nombre, sub);
      }
      if (!user) user = await store.crearUsuario({ email: emailValido(email) ? email : null, nombre: c.name || null, [nombre]: sub });
      iniciarSesion(req, res, user);
      res.redirect('/?login=ok');
    } catch (e) {
      res.redirect('/?login=error');
    }
  });

  // ----- HU-23: límite de partidas -----
  router.post('/partidas/empezar', async (req, res) => {
    const user = await usuarioDe(req);
    if (user) {
      const hoy = fechaMadrid();
      const n = await store.contarInicios(`u:${user.id}`, hoy);
      if (n >= LIMITE_DIARIO) return res.status(429).json({ limite: 'diario', usadas: n, max: LIMITE_DIARIO });
      await store.registrarInicio(`u:${user.id}`, hoy);
      return res.json({ ok: true, usadas: n + 1, max: LIMITE_DIARIO });
    }
    const anon = anonimoDe(req, res);
    const n = await store.contarInicios(`a:${anon}`);
    if (n >= LIMITE_ANONIMO) return res.status(429).json({ limite: 'anonimo', usadas: n, max: LIMITE_ANONIMO });
    await store.registrarInicio(`a:${anon}`, fechaMadrid());
    res.json({ ok: true, usadas: n + 1, max: LIMITE_ANONIMO });
  });

  // ----- HU-22: Mis partidas (cada usuario solo ve las suyas) -----
  router.get('/partidas', async (req, res) => {
    const user = await usuarioDe(req);
    if (!user) return res.status(401).json({ error: 'sin_sesion' });
    const lista = await store.partidasDe(user.id);
    res.json(lista.map((p) => ({ id: p.id, creada: p.creada, ...p.datos })));
  });
  router.post('/partidas', async (req, res) => {
    const user = await usuarioDe(req);
    if (!user) return res.status(401).json({ error: 'sin_sesion' });
    const d = req.body || {};
    if (!d.resumen || !d.origen || !d.destino) return res.status(400).json({ error: 'partida_incompleta' });
    const datos = {
      origen: String(d.origen).slice(0, 3), destino: String(d.destino).slice(0, 3), lang: d.lang === 'en' ? 'en' : 'es',
      resumen: d.resumen, numeroQueDuele: Number(d.numeroQueDuele) || 0, moneda: String(d.moneda || '').slice(0, 3),
      jugadaEn: String(d.jugadaEn || new Date().toISOString()).slice(0, 30), clave: String(d.clave || '').slice(0, 64),
    };
    // No guardar dos veces la misma partida
    if (datos.clave) {
      const ya = (await store.partidasDe(user.id)).find((p) => p.datos && p.datos.clave === datos.clave);
      if (ya) return res.json({ id: ya.id, repetida: true });
    }
    const p = await store.guardarPartida(user.id, datos);
    res.status(201).json({ id: p.id });
  });

  return { router, usuarioDe };
}

module.exports = { crearAuth, hashPass, comprobarPass, firmar, verificar, LIMITE_ANONIMO, LIMITE_DIARIO };
