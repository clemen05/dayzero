// Almacenamiento de cuentas, partidas e inicios de partida.
// - Con la variable DATABASE_URL usa PostgreSQL (producción: Neon, Render Postgres, Supabase…).
// - Sin ella, guarda en un archivo JSON (storage/dayzero-store.json): perfecto para programar en local.
//   Ojo: en Render el disco se borra en cada despliegue, así que en producción hace falta DATABASE_URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const nuevoId = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();

// ---------- Archivo JSON ----------
function storeArchivo(file = process.env.STORE_FILE || path.join(__dirname, '..', 'storage', 'dayzero-store.json')) {
  let db = { users: [], partidas: [], inicios: [] };
  const guardar = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  };
  return {
    tipo: 'archivo',
    async init() { try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { guardar(); } },
    async crearUsuario(u) { const nu = { id: nuevoId(), creado: ahora(), google: null, microsoft: null, pass: null, nombre: null, ...u }; db.users.push(nu); guardar(); return nu; },
    async usuarioPorEmail(email) { return db.users.find((u) => u.email === email) || null; },
    async usuarioPorId(id) { return db.users.find((u) => u.id === id) || null; },
    async usuarioPorProveedor(prov, sub) { return db.users.find((u) => u[prov] === sub) || null; },
    async vincularProveedor(id, prov, sub) { const u = db.users.find((x) => x.id === id); if (u) { u[prov] = sub; guardar(); } return u; },
    async guardarPartida(userId, datos) { const p = { id: nuevoId(), user_id: userId, creada: ahora(), datos }; db.partidas.push(p); guardar(); return p; },
    async partidasDe(userId) { return db.partidas.filter((p) => p.user_id === userId).sort((a, b) => b.creada.localeCompare(a.creada)); },
    async registrarInicio(quien, fecha) { db.inicios.push({ id: nuevoId(), quien, fecha, creado: ahora() }); guardar(); },
    async contarInicios(quien, fecha) { return db.inicios.filter((i) => i.quien === quien && (!fecha || i.fecha === fecha)).length; },
  };
}

// ---------- PostgreSQL ----------
function storePostgres(url = process.env.DATABASE_URL, poolExterno) {
  let pool = poolExterno;
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 5 });
  }
  const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
  const fila = (rows) => rows[0] || null;
  const partida = (r) => ({ ...r, datos: typeof r.datos === 'string' ? JSON.parse(r.datos) : r.datos });
  return {
    tipo: 'postgres',
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS dz_users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE, pass TEXT, nombre TEXT, google TEXT, microsoft TEXT, creado TEXT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS dz_partidas (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, creada TEXT NOT NULL, datos TEXT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS dz_inicios (
        id TEXT PRIMARY KEY, quien TEXT NOT NULL, fecha TEXT NOT NULL, creado TEXT NOT NULL)`);
    },
    async crearUsuario(u) {
      const nu = { id: nuevoId(), creado: ahora(), google: null, microsoft: null, pass: null, nombre: null, ...u };
      await q('INSERT INTO dz_users (id, email, pass, nombre, google, microsoft, creado) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [nu.id, nu.email, nu.pass, nu.nombre, nu.google, nu.microsoft, nu.creado]);
      return nu;
    },
    async usuarioPorEmail(email) { return fila(await q('SELECT * FROM dz_users WHERE email = $1', [email])); },
    async usuarioPorId(id) { return fila(await q('SELECT * FROM dz_users WHERE id = $1', [id])); },
    async usuarioPorProveedor(prov, sub) {
      if (!['google', 'microsoft'].includes(prov)) throw new Error('Proveedor no válido');
      return fila(await q(`SELECT * FROM dz_users WHERE ${prov} = $1`, [sub]));
    },
    async vincularProveedor(id, prov, sub) {
      if (!['google', 'microsoft'].includes(prov)) throw new Error('Proveedor no válido');
      await q(`UPDATE dz_users SET ${prov} = $1 WHERE id = $2`, [sub, id]);
      return this.usuarioPorId(id);
    },
    async guardarPartida(userId, datos) {
      const p = { id: nuevoId(), user_id: userId, creada: ahora(), datos };
      await q('INSERT INTO dz_partidas (id, user_id, creada, datos) VALUES ($1,$2,$3,$4)', [p.id, userId, p.creada, JSON.stringify(datos)]);
      return p;
    },
    async partidasDe(userId) { return (await q('SELECT * FROM dz_partidas WHERE user_id = $1 ORDER BY creada DESC', [userId])).map(partida); },
    async registrarInicio(quien, fecha) { await q('INSERT INTO dz_inicios (id, quien, fecha, creado) VALUES ($1,$2,$3,$4)', [nuevoId(), quien, fecha, ahora()]); },
    async contarInicios(quien, fecha) {
      const rows = fecha ? await q('SELECT COUNT(*) AS n FROM dz_inicios WHERE quien = $1 AND fecha = $2', [quien, fecha])
        : await q('SELECT COUNT(*) AS n FROM dz_inicios WHERE quien = $1', [quien]);
      return Number(rows[0].n);
    },
  };
}

function crearStore() {
  return process.env.DATABASE_URL ? storePostgres() : storeArchivo();
}

module.exports = { crearStore, storeArchivo, storePostgres };
