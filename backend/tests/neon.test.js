const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const RUTA_NEON = require.resolve('../neon');
const NEON_URI_ORIGINAL = process.env.NEON_URI;
const pools = [];

// Carga backend/neon.js desde cero con la NEON_URI indicada (undefined = sin variable).
function cargarNeon(uri) {
  if (uri === undefined) delete process.env.NEON_URI;
  else process.env.NEON_URI = uri;
  delete require.cache[RUTA_NEON];
  const neon = require(RUTA_NEON);
  if (neon.pool) pools.push(neon.pool);
  return neon;
}

afterEach(async () => {
  // Los pools de prueba nunca se conectan; se cierran igual para no dejar nada abierto.
  await Promise.all(pools.splice(0).map(pool => pool.end()));
  if (NEON_URI_ORIGINAL === undefined) delete process.env.NEON_URI;
  else process.env.NEON_URI = NEON_URI_ORIGINAL;
  delete require.cache[RUTA_NEON];
});

test('sin NEON_URI el pool es null, conectarNeon devuelve false y query lanza un error claro', async () => {
  const neon = cargarNeon(undefined);
  assert.equal(neon.pool, null);
  assert.equal(await neon.conectarNeon(), false);
  assert.throws(() => neon.query('SELECT 1'), /falta NEON_URI/);
});

test('con sslmode=require verifica el certificado, limita el pool y quita sslmode de la URI', () => {
  const { pool } = cargarNeon('postgresql://usuario:clave-falsa@host-falso.example.com/neondb?sslmode=require&uselibpqcompat=true&channel_binding=require');
  assert.ok(pool);
  assert.equal(pool.options.ssl.rejectUnauthorized, true);
  assert.equal(pool.options.max, 5);
  assert.equal(pool.options.connectionTimeoutMillis, 5000);
  assert.equal(pool.options.idleTimeoutMillis, 10000);
  assert.ok(!pool.options.connectionString.includes('sslmode'));
  assert.ok(!pool.options.connectionString.includes('uselibpqcompat'));
  // El resto de la dirección se mantiene igual.
  const url = new URL(pool.options.connectionString);
  assert.equal(url.hostname, 'host-falso.example.com');
  assert.equal(url.pathname, '/neondb');
  assert.equal(url.searchParams.get('channel_binding'), 'require');
});

test('con una NEON_URI inválida el pool es null y el error no muestra la dirección', () => {
  const uriInvalida = 'esto no es una url con clave-secreta';
  const errores = [];
  const errorOriginal = console.error;
  console.error = (...args) => errores.push(args.join(' '));
  let neon;
  try {
    neon = cargarNeon(uriInvalida);
  } finally {
    console.error = errorOriginal;
  }
  assert.equal(neon.pool, null);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /NEON_URI/);
  assert.ok(!errores[0].includes('clave-secreta'));
  assert.throws(() => neon.query('SELECT 1'), /falta NEON_URI/);
});
