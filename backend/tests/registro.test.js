const { test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const neon = require('../neon');
const { app } = require('../app');

// Ninguna prueba se conecta a una base real: neon.pool y neon.query se simulan.
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

const poolOriginal = neon.pool;
const nodeEnvOriginal = process.env.NODE_ENV;
beforeEach(() => {
  neon.pool = {};
  // NODE_ENV=test desactiva el limitador para que las pruebas puedan registrar varias cuentas desde la misma IP.
  process.env.NODE_ENV = 'test';
});
afterEach(() => {
  mock.restoreAll();
  neon.pool = poolOriginal;
  if (nodeEnvOriginal === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnvOriginal;
});

const HASH_EXISTENTE = `scrypt:${'ab'.repeat(16)}:${'cd'.repeat(64)}`;
const CLAVE_VALIDA = 'Clave-Segura-2026!';
const SQL_AUTENTICAR = 'SELECT u.id, u.nombre, u.email, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.cuenta_activa = true';
const SQL_ROL = 'SELECT id FROM roles WHERE nombre = $1';
const SQL_INSERTAR = 'INSERT INTO usuarios (nombre, email, password_hash, rol_id, cuenta_activa, ultimo_acceso) VALUES ($1, $2, $3, $4, true, now()) RETURNING id, nombre, email';

// Simula las tablas roles y usuarios de database/schema.sql, incluida la restricción UNIQUE(email).
function simularNeon({ roles = [{ id: 1, nombre: 'Administrador General' }, { id: 2, nombre: 'Administrador' }, { id: 3, nombre: 'Usuario' }] } = {}) {
  const usuarios = [
    { id: 1, nombre: 'Jefa de archivo', email: 'general@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 1, cuenta_activa: true, ultimo_acceso: null },
  ];
  const rolDe = usuario => roles.find(rol => rol.id === usuario.rol_id).nombre;
  const inserts = [];
  const consulta = mock.method(neon, 'query', async (sql, params = []) => {
    if (sql === SQL_AUTENTICAR) {
      return { rows: usuarios.filter(u => u.id === params[0] && u.cuenta_activa).map(u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: rolDe(u) })) };
    }
    if (sql === SQL_ROL) {
      return { rows: roles.filter(rol => rol.nombre === params[0]).map(({ id }) => ({ id })) };
    }
    if (sql === SQL_INSERTAR) {
      const [nombre, email, password_hash, rol_id] = params;
      inserts.push({ nombre, email, password_hash, rol_id });
      if (usuarios.some(u => u.email === email)) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "usuarios_email_key"'), { code: '23505' });
      }
      // El SQL fija cuenta_activa = true y ultimo_acceso = now(); la simulación aplica lo mismo.
      const fila = { id: usuarios.length + 1, nombre, email, password_hash, rol_id, cuenta_activa: true, ultimo_acceso: new Date() };
      usuarios.push(fila);
      return { rows: [{ id: fila.id, nombre, email }] };
    }
    throw new Error(`Consulta no esperada en la prueba: ${sql}`);
  });
  return { consulta, inserts, usuarios };
}

async function pedir(metodo, ruta, { token, body } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const texto = await respuesta.text();
  return { status: respuesta.status, texto, json: JSON.parse(texto) };
}

const registrar = body => pedir('POST', '/api/auth/registro', { body });
const nuevaCuenta = (cambios = {}) => ({ nombre: 'Lectora del archivo', email: 'lectora@synapse-militaria.cl', password: CLAVE_VALIDA, ...cambios });

function sinDatosSensibles(texto, password) {
  assert.ok(!/"password(_hash)?"/.test(texto), 'la respuesta no debe incluir los campos password ni password_hash');
  assert.ok(!texto.includes('password_hash'), 'la respuesta no debe mencionar password_hash');
  assert.ok(!texto.includes('scrypt:'), 'la respuesta no debe incluir hashes');
  if (password) assert.ok(!texto.includes(password), 'la respuesta no debe incluir la contraseña enviada');
}

test('un registro válido crea una cuenta Usuario y deja la sesión iniciada', async () => {
  const { inserts, usuarios } = simularNeon();
  const { status, texto, json } = await registrar(nuevaCuenta({ nombre: '  Lectora del archivo  ' }));

  assert.equal(status, 201);
  assert.equal(json.success, true);
  assert.deepEqual(Object.keys(json.data).sort(), ['email', 'expiresAt', 'nombre', 'rol', 'token']);
  assert.equal(json.data.email, 'lectora@synapse-militaria.cl');
  assert.equal(json.data.nombre, 'Lectora del archivo');
  assert.equal(json.data.rol, 'Usuario');
  assert.match(json.data.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(json.data.expiresAt > Date.now());
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].rol_id, 3);
  assert.equal(usuarios.at(-1).cuenta_activa, true);
  assert.ok(usuarios.at(-1).ultimo_acceso instanceof Date);
  sinDatosSensibles(texto, CLAVE_VALIDA);

  const token = json.data.token;
  const cierre = await pedir('POST', '/api/auth/logout', { token });
  assert.equal(cierre.status, 200);
  for (const [metodo, ruta, body] of [['POST', '/api/armas', {}], ['GET', '/api/usuarios']]) {
    const respuesta = await pedir(metodo, ruta, { token, body });
    assert.equal(respuesta.status, 403, `${metodo} ${ruta}`);
    assert.equal(respuesta.json.message, 'No tienes permiso para esta acción.');
  }
});

test('el registro ignora rol, rol_id y cuenta_activa del body y crea un Usuario activo', async () => {
  const { inserts, usuarios } = simularNeon();
  const { status, texto, json } = await registrar(nuevaCuenta({ rol: 'Administrador General', rol_id: 1, cuenta_activa: false }));

  assert.equal(status, 201);
  assert.equal(json.data.rol, 'Usuario');
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].rol_id, 3);
  assert.equal(usuarios.at(-1).cuenta_activa, true);
  sinDatosSensibles(texto, CLAVE_VALIDA);
  // La cuenta queda activa (el token sirve) y sin permisos de administrador.
  assert.equal((await pedir('POST', '/api/auth/logout', { token: json.data.token })).status, 200);
  assert.equal((await pedir('GET', '/api/usuarios', { token: json.data.token })).status, 403);
});

test('password_hash guarda un hash scrypt y no la contraseña original', async () => {
  const { inserts } = simularNeon();
  assert.equal((await registrar(nuevaCuenta())).status, 201);
  assert.ok(inserts[0].password_hash.startsWith('scrypt:'));
  assert.match(inserts[0].password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(inserts[0].password_hash, CLAVE_VALIDA);
  assert.ok(!inserts[0].password_hash.includes(CLAVE_VALIDA));
});

test('un correo repetido responde 409 aunque cambien las mayúsculas o los espacios', async () => {
  const { usuarios } = simularNeon();
  assert.equal((await registrar(nuevaCuenta())).status, 201);
  for (const email of ['lectora@synapse-militaria.cl', '  LECTORA@Synapse-Militaria.CL ', 'General@Synapse-Militaria.cl']) {
    const { status, texto, json } = await registrar(nuevaCuenta({ email }));
    assert.equal(status, 409, email);
    assert.equal(json.message, 'Ya existe una cuenta con ese correo.');
    sinDatosSensibles(texto, CLAVE_VALIDA);
  }
  assert.equal(usuarios.length, 2);
});

for (const [caso, cambios, mensaje] of [
  ['un nombre corto', { nombre: ' A ' }, 'El nombre debe tener entre 2 y 100 caracteres.'],
  ['un email inválido', { email: 'lectora-sin-arroba' }, 'El correo no tiene un formato válido.'],
  ['una contraseña corta', { password: 'Corta-2026' }, 'La contraseña debe tener entre 12 y 128 caracteres.'],
  ['la contraseña admin123', { password: 'ADMIN123' }, 'La contraseña no puede ser admin123.'],
  ['una contraseña que contiene la parte del correo antes de la @', { password: 'xx-LECTORA-2026-xx' }, 'La contraseña no puede contener la parte del correo antes de la @.'],
]) {
  test(`el registro responde 400 con ${caso} y no consulta Neon`, async () => {
    const { consulta } = simularNeon();
    const body = nuevaCuenta(cambios);
    const { status, texto, json } = await registrar(body);
    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.equal(json.message, mensaje);
    assert.equal(consulta.mock.callCount(), 0);
    sinDatosSensibles(texto, body.password === 'ADMIN123' ? undefined : body.password);
  });
}

test('si Neon falla el registro responde 503 sin detalles internos', async () => {
  mock.method(neon, 'query', async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 detalle interno'); });
  const { status, texto, json } = await registrar(nuevaCuenta());
  assert.equal(status, 503);
  assert.equal(json.message, 'Servicio de cuentas no disponible temporalmente.');
  assert.ok(!/ECONNREFUSED|10\.0\.0\.5|detalle interno/.test(texto));
  sinDatosSensibles(texto, CLAVE_VALIDA);
});

test('sin pool de Postgres (falta NEON_URI) el registro responde 503 sin consultar', async () => {
  const { consulta } = simularNeon();
  neon.pool = null;
  const { status, json } = await registrar(nuevaCuenta());
  assert.equal(status, 503);
  assert.equal(json.message, 'Servicio de cuentas no disponible temporalmente.');
  assert.equal(consulta.mock.callCount(), 0);
});

test('si falta el rol Usuario en la tabla roles el registro responde 503 y no inserta', async () => {
  const { inserts } = simularNeon({ roles: [{ id: 1, nombre: 'Administrador General' }, { id: 2, nombre: 'Administrador' }] });
  const { status, json } = await registrar(nuevaCuenta());
  assert.equal(status, 503);
  assert.equal(json.message, 'Servicio de cuentas no disponible temporalmente.');
  assert.equal(inserts.length, 0);
});

test('el registro tiene su propio limitador y no consume los intentos del login', async () => {
  // Con NODE_ENV distinto de test el limitador cuenta. Las pruebas anteriores no sumaron intentos.
  process.env.NODE_ENV = 'production-simulada';
  const { consulta } = simularNeon();
  for (let i = 0; i < 5; i += 1) assert.equal((await registrar({})).status, 400);
  const bloqueado = await registrar({});
  assert.equal(bloqueado.status, 429);
  // El login usa otra instancia: sus contadores siguen en cero y llega a validar el body.
  assert.equal((await pedir('POST', '/api/auth/login', { body: {} })).status, 400);
  assert.equal(consulta.mock.callCount(), 0);
});
