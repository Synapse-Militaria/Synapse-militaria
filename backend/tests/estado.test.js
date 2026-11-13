const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const neon = require('../neon');
const { app } = require('../app');

// Ninguna prueba se conecta a una base real: neon.pool y neon.query se simulan.
const poolOriginal = neon.pool;
let server;
let base;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(() => {
  mock.restoreAll();
  neon.pool = poolOriginal;
});

async function pedirEstado() {
  const respuesta = await fetch(`${base}/api/estado`);
  return { status: respuesta.status, body: await respuesta.json() };
}

test('GET /api/estado informa Postgres conectada sin pedir sesión', async () => {
  neon.pool = {};
  const consulta = mock.method(neon, 'query', async sql => {
    assert.equal(sql, 'SELECT 1');
    return { rows: [{ '?column?': 1 }] };
  });
  const { status, body } = await pedirEstado();
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, bases: { mongodb: 'sin conexión', postgresql: 'conectada' } });
  assert.equal(consulta.mock.callCount(), 1);
});

test('GET /api/estado informa Postgres sin conexión y no muestra el error interno', async () => {
  neon.pool = {};
  mock.method(neon, 'query', async () => {
    throw new Error('connect ECONNREFUSED host-secreto.neon.tech:5432');
  });
  const { status, body } = await pedirEstado();
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, bases: { mongodb: 'sin conexión', postgresql: 'sin conexión' } });
  assert.ok(!JSON.stringify(body).includes('host-secreto'));
});

test('GET /api/estado corta la comprobación de Postgres a los 3 segundos', async () => {
  neon.pool = {};
  mock.method(neon, 'query', () => new Promise(() => {})); // nunca responde
  const inicio = Date.now();
  const { body } = await pedirEstado();
  const duracion = Date.now() - inicio;
  assert.equal(body.bases.postgresql, 'sin conexión');
  assert.ok(duracion >= 2900 && duracion < 4000, `tardó ${duracion} ms`);
});

test('GET /api/estado informa Postgres no configurada sin llamar a query', async () => {
  neon.pool = null;
  const consulta = mock.method(neon, 'query', async () => ({ rows: [] }));
  const { status, body } = await pedirEstado();
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, bases: { mongodb: 'sin conexión', postgresql: 'no configurada' } });
  assert.equal(consulta.mock.callCount(), 0);
});
