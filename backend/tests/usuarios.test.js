const { test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const neon = require('../neon');
const { firmarToken } = require('../config/jwt');
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
beforeEach(() => { neon.pool = {}; });
afterEach(() => {
  mock.restoreAll();
  neon.pool = poolOriginal;
});

const HASH_EXISTENTE = `scrypt:${'ab'.repeat(16)}:${'cd'.repeat(64)}`;
const CLAVE_VALIDA = 'Clave-Segura-2026!';
const SQL_LISTAR = 'SELECT u.id, u.nombre, u.email, r.nombre AS rol, u.cuenta_activa, u.ultimo_acceso, u.creado_en FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.creado_en, u.id';
const SQL_INSERTAR = 'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, cuenta_activa, creado_en';

// Simula las tablas roles y usuarios de database/schema.sql, incluida la restricción UNIQUE(email).
function simularNeon({ caidaDespuesDeAutenticar = false } = {}) {
  const roles = [{ id: 1, nombre: 'Administrador General' }, { id: 2, nombre: 'Administrador' }, { id: 3, nombre: 'Usuario' }];
  const usuarios = [
    { id: 1, nombre: 'Jefa de archivo', email: 'general@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 1, cuenta_activa: true, ultimo_acceso: null, creado_en: new Date('2026-11-01T10:00:00Z') },
    { id: 2, nombre: 'Editor', email: 'editor@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 2, cuenta_activa: true, ultimo_acceso: new Date('2026-11-10T09:00:00Z'), creado_en: new Date('2026-11-02T10:00:00Z') },
  ];
  const rolDe = usuario => roles.find(rol => rol.id === usuario.rol_id).nombre;
  const inserts = [];
  const consulta = mock.method(neon, 'query', async (sql, params = []) => {
    if (sql.startsWith('SELECT u.id, u.email, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1')) {
      return { rows: usuarios.filter(u => u.id === params[0] && u.cuenta_activa).map(u => ({ id: u.id, email: u.email, rol: rolDe(u) })) };
    }
    if (caidaDespuesDeAutenticar) throw new Error('connect ECONNREFUSED 10.0.0.5:5432 detalle interno');
    if (sql === SQL_LISTAR) {
      // Devuelve también password_hash para comprobar que el controlador no lo reenvía aunque llegue.
      return { rows: usuarios.map(u => ({ ...u, rol: rolDe(u) })) };
    }
    if (sql === 'SELECT id FROM roles WHERE nombre = $1') {
      return { rows: roles.filter(rol => rol.nombre === params[0]).map(({ id }) => ({ id })) };
    }
    if (sql === SQL_INSERTAR) {
      const [nombre, email, password_hash, rol_id] = params;
      inserts.push({ nombre, email, password_hash, rol_id });
      if (usuarios.some(u => u.email === email)) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "usuarios_email_key"'), { code: '23505' });
      }
      const fila = { id: usuarios.length + 1, nombre, email, password_hash, rol_id, cuenta_activa: true, ultimo_acceso: null, creado_en: new Date('2026-11-20T12:00:00Z') };
      usuarios.push(fila);
      return { rows: [{ id: fila.id, nombre, email, cuenta_activa: true, creado_en: fila.creado_en }] };
    }
    throw new Error(`Consulta no esperada en la prueba: ${sql}`);
  });
  return { consulta, inserts, usuarios };
}

const tokenDe = (id, rol) => firmarToken({ id, email: 'x@synapse-militaria.cl', rol }).token;
const GENERAL = () => tokenDe(1, 'Administrador General');
const ADMINISTRADOR = () => tokenDe(2, 'Administrador');

async function pedir(metodo, { token, body } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const respuesta = await fetch(`${base}/api/usuarios`, { method: metodo, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const texto = await respuesta.text();
  return { status: respuesta.status, texto, json: JSON.parse(texto) };
}

function sinDatosSensibles(texto, password) {
  assert.ok(!texto.includes('password_hash'), 'la respuesta no debe incluir password_hash');
  assert.ok(!texto.includes('scrypt:'), 'la respuesta no debe incluir hashes');
  if (password) assert.ok(!texto.includes(password), 'la respuesta no debe incluir la contraseña enviada');
}

const nuevaCuenta = (cambios = {}) => ({ nombre: 'Ana Archivo', email: 'ana.archivo@synapse-militaria.cl', password: CLAVE_VALIDA, rol: 'Administrador', ...cambios });

test('GET /api/usuarios lista las cuentas con su rol y sin hashes', async () => {
  simularNeon();
  const { status, texto, json } = await pedir('GET', { token: GENERAL() });
  assert.equal(status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data.map(cuenta => [cuenta.id, cuenta.email, cuenta.rol]), [
    [1, 'general@synapse-militaria.cl', 'Administrador General'],
    [2, 'editor@synapse-militaria.cl', 'Administrador'],
  ]);
  assert.deepEqual(Object.keys(json.data[0]).sort(), ['creado_en', 'cuenta_activa', 'email', 'id', 'nombre', 'rol', 'ultimo_acceso']);
  assert.equal(json.data[1].ultimo_acceso, '2026-11-10T09:00:00.000Z');
  assert.ok(!SQL_LISTAR.includes('password_hash'));
  sinDatosSensibles(texto);
});

for (const rol of ['Administrador', 'Administrador General']) {
  test(`POST /api/usuarios crea una cuenta ${rol} con hash scrypt y correo normalizado`, async () => {
    const { inserts, usuarios } = simularNeon();
    const body = nuevaCuenta({ nombre: '  Ana Archivo  ', email: '  Ana.Archivo@Synapse-Militaria.CL ', rol });
    const { status, texto, json } = await pedir('POST', { token: GENERAL(), body });

    assert.equal(status, 201);
    assert.deepEqual(json, {
      success: true,
      data: { id: 3, nombre: 'Ana Archivo', email: 'ana.archivo@synapse-militaria.cl', rol, cuenta_activa: true, creado_en: '2026-11-20T12:00:00.000Z' },
    });
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].email, 'ana.archivo@synapse-militaria.cl');
    assert.equal(inserts[0].nombre, 'Ana Archivo');
    assert.equal(inserts[0].rol_id, rol === 'Administrador General' ? 1 : 2);
    assert.match(inserts[0].password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.ok(!inserts[0].password_hash.includes(CLAVE_VALIDA));
    assert.equal(usuarios.length, 3);
    sinDatosSensibles(texto, CLAVE_VALIDA);
  });
}

for (const [caso, cambios, mensaje] of [
  ['un nombre corto', { nombre: ' A ' }, /nombre debe tener entre 2 y 100 caracteres/],
  ['un nombre de más de 100 caracteres', { nombre: 'x'.repeat(101) }, /nombre debe tener entre 2 y 100 caracteres/],
  ['un nombre que no es texto', { nombre: 42 }, /nombre debe tener entre 2 y 100 caracteres/],
  ['un correo inválido', { email: 'ana-sin-arroba' }, /correo no tiene un formato válido/],
  ['un correo que no es texto', { email: ['ana@synapse-militaria.cl'] }, /correo no tiene un formato válido/],
  ['la contraseña admin123', { password: 'Admin123' }, /no puede ser admin123/],
  ['una contraseña corta', { password: 'Corta-2026' }, /entre 12 y 128 caracteres/],
  ['una contraseña que contiene el correo', { password: 'xx-ANA.ARCHIVO-2026' }, /parte del correo antes de la @/],
  ['un rol inválido', { rol: 'Usuario' }, /rol debe ser Administrador General o Administrador/],
  ['el rol ausente', { rol: undefined }, /rol debe ser Administrador General o Administrador/],
]) {
  test(`POST /api/usuarios responde 400 con ${caso} y no inserta`, async () => {
    const { inserts } = simularNeon();
    const body = nuevaCuenta(cambios);
    const { status, texto, json } = await pedir('POST', { token: GENERAL(), body });
    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.match(json.message, mensaje);
    assert.equal(inserts.length, 0);
    sinDatosSensibles(texto, typeof body.password === 'string' && body.password !== 'Admin123' ? body.password : undefined);
  });
}

test('POST /api/usuarios responde 409 si el correo ya existe, sin importar mayúsculas', async () => {
  const { usuarios } = simularNeon();
  const { status, texto, json } = await pedir('POST', { token: GENERAL(), body: nuevaCuenta({ email: 'Editor@Synapse-Militaria.cl' }) });
  assert.equal(status, 409);
  assert.equal(json.message, 'Ya existe una cuenta con ese correo.');
  assert.equal(usuarios.length, 2);
  sinDatosSensibles(texto, CLAVE_VALIDA);
});

test('un usuario con rol Administrador recibe 403 en las dos rutas', async () => {
  const { consulta, inserts } = simularNeon();
  const lista = await pedir('GET', { token: ADMINISTRADOR() });
  const creacion = await pedir('POST', { token: ADMINISTRADOR(), body: nuevaCuenta() });
  for (const respuesta of [lista, creacion]) {
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.json.message, 'No tienes permiso para esta acción.');
    sinDatosSensibles(respuesta.texto, CLAVE_VALIDA);
  }
  assert.equal(inserts.length, 0);
  // Solo se ejecutaron las dos consultas de autenticar.
  assert.equal(consulta.mock.callCount(), 2);
});

test('sin token las dos rutas responden 401 sin consultar Postgres', async () => {
  const { consulta } = simularNeon();
  assert.equal((await pedir('GET')).status, 401);
  assert.equal((await pedir('POST', { body: nuevaCuenta() })).status, 401);
  assert.equal(consulta.mock.callCount(), 0);
});

test('Postgres caído después de autenticar responde 503 sin detalles internos', async () => {
  const { inserts } = simularNeon({ caidaDespuesDeAutenticar: true });
  for (const respuesta of [await pedir('GET', { token: GENERAL() }), await pedir('POST', { token: GENERAL(), body: nuevaCuenta() })]) {
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.json.message, 'Servicio de cuentas no disponible temporalmente.');
    assert.ok(!/ECONNREFUSED|10\.0\.0\.5|detalle interno/.test(respuesta.texto));
    sinDatosSensibles(respuesta.texto, CLAVE_VALIDA);
  }
  assert.equal(inserts.length, 0);
});

test('sin pool de Postgres (falta NEON_URI) el controlador responde 503', async () => {
  simularNeon();
  neon.pool = null;
  for (const respuesta of [await pedir('GET', { token: GENERAL() }), await pedir('POST', { token: GENERAL(), body: nuevaCuenta() })]) {
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.json.message, 'Servicio de cuentas no disponible temporalmente.');
  }
});

test('Postgres caído también en autenticar responde 503 sin detalles internos', async () => {
  mock.method(neon, 'query', async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432'); });
  const respuesta = await pedir('GET', { token: GENERAL() });
  assert.equal(respuesta.status, 503);
  assert.ok(!/ECONNREFUSED|10\.0\.0\.5/.test(respuesta.texto));
});
