// Aplicación Express: sirve la web (public/), el motor compartido (shared/) y la API REST.
const express = require('express');
const path = require('path');
const DZ = require('../shared/engine.js');
const { crearAuth } = require('./auth');
const { narrar } = require('./narrador');

function crearApp(datos, { store } = {}) {
  globalThis.DZ_DATA = datos; // el motor lee los datos de aquí
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render y otros hostings van detrás de un proxy HTTPS
  app.use(express.json({ limit: '200kb' }));

  // ---------- API ----------
  const api = express.Router();

  // Todos los datos que necesita el navegador (se cachean 1 hora)
  api.get('/datos', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(datos);
  });

  api.get('/ciudades', (req, res) => {
    res.json(datos.ciudad.map((c) => ({ id: c.ciudad_id, nombre_es: c.nombre_es, nombre_en: c.nombre_en, pais: c.pais_iso2, moneda: c.moneda_iso })));
  });

  api.get('/tipos-cambio', (req, res) => res.json(DZ.tipos()));

  api.get('/fuentes/:id', (req, res) => {
    const f = DZ.fuente(req.params.id);
    if (!f) return res.status(404).json({ error: 'Fuente no encontrada' });
    res.json(f);
  });

  // Neto anual: /api/neto?pais=ES&bruto=30000&edad=30
  api.get('/neto', (req, res) => {
    const pais = String(req.query.pais || '').toUpperCase();
    const bruto = Number(req.query.bruto);
    if (!['ES', 'GB', 'NL', 'CH'].includes(pais)) return res.status(400).json({ error: 'pais debe ser ES, GB, NL o CH' });
    if (!(bruto > 0)) return res.status(400).json({ error: 'bruto debe ser un número mayor que 0' });
    res.json(DZ.netoAnual(pais, bruto, { edad: Number(req.query.edad) || 30, expat30: req.query.expat30 === 'true' }));
  });

  // Cálculo completo: neto, coste de vida, arranque y número que duele
  api.post('/calcular', (req, res) => {
    const e = req.body || {};
    const ids = datos.ciudad.map((c) => c.ciudad_id);
    const errores = [];
    if (!ids.includes(e.origen) || !ids.includes(e.destino)) errores.push('origen y destino deben ser MAD, LON, AMS o ZRH');
    if (e.origen === e.destino) errores.push('Elige dos ciudades distintas');
    for (const k of ['sueldoActual', 'sueldoOfrecido']) if (!e[k] || !(Number(e[k].importe) > 0)) errores.push(`${k}.importe debe ser mayor que 0`);
    if (errores.length) return res.status(400).json({ errores });
    const estado = {
      origen: e.origen, destino: e.destino, edad: Number(e.edad) || 30, expat30: !!e.expat30,
      vivienda: e.vivienda || '1_dormitorio', trabajo: e.trabajo || { modalidad: 'oficina' },
      nacionalidad: e.nacionalidad || 'ue', dineroMudanza: Number(e.dineroMudanza) || 0,
      sueldoActual: { tipo: 'bruto', pagas: 12, moneda: DZ.ciudad(e.origen).moneda_iso, ...e.sueldoActual, importe: Number(e.sueldoActual.importe) },
      sueldoOfrecido: { tipo: 'bruto', pagas: 12, moneda: DZ.ciudad(e.destino).moneda_iso, ...e.sueldoOfrecido, importe: Number(e.sueldoOfrecido.importe) },
    };
    res.json(DZ.calcular(estado));
  });

  // Tres pisos de la ciudad destino: /api/pisos?ciudad=LON&tipo=estudio
  api.get('/pisos', (req, res) => {
    const c = String(req.query.ciudad || '').toUpperCase();
    if (!DZ.ciudad(c)) return res.status(400).json({ error: 'ciudad no válida' });
    res.json(DZ.opcionesPiso(c, req.query.tipo || '1_dormitorio'));
  });

  // HU-18 / HU-19: narración del día (IA con texto de reserva)
  api.post('/narrar', async (req, res) => {
    const b = req.body || {};
    const dia = Math.min(7, Math.max(1, Number(b.dia) || 1));
    const c = DZ.ciudad(String(b.destino || ''));
    if (!c) return res.status(400).json({ error: 'destino no válido' });
    const lang = b.lang === 'en' ? 'en' : 'es';
    const r = await narrar({
      dia, lang, ciudad: lang === 'en' ? c.nombre_en : c.nombre_es,
      anterior: String(b.anterior || '').slice(0, 120), tema: String(b.tema || '').slice(0, 160),
      variante: /^[a-z_]{1,20}$/.test(String(b.variante || '')) ? String(b.variante) : undefined,
      permitidas: Array.isArray(b.permitidas) ? b.permitidas.slice(0, 200).map(String) : [],
    });
    res.json(r);
  });

  if (store) api.use(crearAuth(store).router);

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada' }));

  // ---------- Web ----------
  app.get('/js/engine.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', 'engine.js')));
  app.get('/js/juego.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', 'juego.js')));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // Errores
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}

module.exports = { crearApp };
