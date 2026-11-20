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
const SQL_BLOQUEAR_GENERALES = "SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'Administrador General' AND u.cuenta_activa FOR UPDATE OF u";
const SQL_ACTUALIZAR = `UPDATE usuarios u
SET cuenta_activa = COALESCE($2, u.cuenta_activa),
    rol_id = COALESCE($3, u.rol_id)
FROM roles r
WHERE u.id = $1
  AND r.id = COALESCE($3, u.rol_id)
  AND (
    NOT (u.cuenta_activa = true AND u.rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador General'))
    OR (COALESCE($2, u.cuenta_activa) = true AND r.nombre = 'Administrador General')
    OR EXISTS (
      SELECT 1 FROM usuarios otro
      JOIN roles ro ON ro.id = otro.rol_id
      WHERE otro.id <> u.id AND otro.cuenta_activa = true AND ro.nombre = 'Administrador General'
    )
  )
RETURNING u.id, u.nombre, u.email, r.nombre AS rol, u.cuenta_activa, u.ultimo_acceso, u.creado_en`;
const SQL_ELIMINAR = `DELETE FROM usuarios u
WHERE u.id = $1
  AND (
    NOT (u.cuenta_activa = true AND u.rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador General'))
    OR EXISTS (
      SELECT 1 FROM usuarios otro
      JOIN roles ro ON ro.id = otro.rol_id
      WHERE otro.id <> u.id AND otro.cuenta_activa = true AND ro.nombre = 'Administrador General'
    )
  )
RETURNING u.id`;

// Simula las tablas roles, usuarios y favoritos de database/schema.sql, incluidas UNIQUE(email), ON DELETE CASCADE y pool.connect().
function simularNeon({ caidaDespuesDeAutenticar = false, falloEnModificar = false, idAdminComoString = false, extras = [], despuesDeAutenticar = null } = {}) {
  const roles = [{ id: 1, nombre: 'Administrador General' }, { id: 2, nombre: 'Administrador' }, { id: 3, nombre: 'Usuario' }];
  const usuarios = [
    { id: 1, nombre: 'Jefa de archivo', email: 'general@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 1, cuenta_activa: true, ultimo_acceso: null, creado_en: new Date('2026-11-01T10:00:00Z') },
    { id: 2, nombre: 'Editor', email: 'editor@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 2, cuenta_activa: true, ultimo_acceso: new Date('2026-11-10T09:00:00Z'), creado_en: new Date('2026-11-02T10:00:00Z') },
    ...extras.map(extra => ({ ...extra })),
  ];
  const favoritos = [{ id: 1, usuario_id: 2, arma_id: '507f1f77bcf86cd799439011' }];
  const rolDe = usuario => roles.find(rol => rol.id === usuario.rol_id).nombre;
  const inserts = [];
  const consultasCliente = [];
  const releases = [];

  async function ejecutarConsulta(sql, params = []) {
    if (sql.startsWith('SELECT u.id, u.email, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1')) {
      const rows = usuarios
        .filter(u => u.id === params[0] && u.cuenta_activa)
        .map(u => ({ id: idAdminComoString ? String(u.id) : u.id, email: u.email, rol: rolDe(u) }));
      if (despuesDeAutenticar) despuesDeAutenticar(usuarios);
      return { rows };
    }
    if (caidaDespuesDeAutenticar) throw new Error('connect ECONNREFUSED 10.0.0.5:5432 detalle interno');
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql === SQL_BLOQUEAR_GENERALES) {
      return { rows: usuarios.filter(u => u.cuenta_activa && u.rol_id === 1).map(({ id }) => ({ id })) };
    }
    if (sql === SQL_LISTAR) {
      // Devuelve también password_hash para comprobar que el controlador no lo reenvía aunque llegue.
      return { rows: usuarios.map(u => ({ ...u, rol: rolDe(u) })) };
    }
    if (sql === 'SELECT id FROM roles WHERE nombre = $1') {
      return { rows: roles.filter(rol => rol.nombre === params[0]).map(({ id }) => ({ id })) };
    }
    if (sql === 'SELECT id FROM usuarios WHERE id = $1') {
      return { rows: usuarios.filter(u => u.id === params[0]).map(({ id }) => ({ id })) };
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
    if (sql === SQL_ACTUALIZAR) {
      if (falloEnModificar) throw new Error('terminating connection due to administrator command');
      const [id, cuentaActiva, rolId] = params;
      const usuario = usuarios.find(u => u.id === id);
      if (!usuario) return { rows: [] };
      const nuevaActiva = cuentaActiva ?? usuario.cuenta_activa;
      const nuevoRolId = rolId ?? usuario.rol_id;
      const eraGeneralActivo = usuario.cuenta_activa && usuario.rol_id === 1;
      const sigueGeneralActivo = nuevaActiva === true && nuevoRolId === 1;
      const hayOtroGeneralActivo = usuarios.some(u => u.id !== usuario.id && u.cuenta_activa && u.rol_id === 1);
      if (eraGeneralActivo && !sigueGeneralActivo && !hayOtroGeneralActivo) {
        return { rows: [] };
      }
      usuario.cuenta_activa = nuevaActiva;
      usuario.rol_id = nuevoRolId;
      // Incluye password_hash en la fila simulada para comprobar que cuentaPublica lo descarta.
      return { rows: [{ ...usuario, rol: rolDe(usuario) }] };
    }
    if (sql === SQL_ELIMINAR) {
      if (falloEnModificar) throw new Error('terminating connection due to administrator command');
      const [id] = params;
      const indice = usuarios.findIndex(u => u.id === id);
      if (indice === -1) return { rows: [] };
      const usuario = usuarios[indice];
      const eraGeneralActivo = usuario.cuenta_activa && usuario.rol_id === 1;
      const hayOtroGeneralActivo = usuarios.some(u => u.id !== usuario.id && u.cuenta_activa && u.rol_id === 1);
      if (eraGeneralActivo && !hayOtroGeneralActivo) {
        return { rows: [] };
      }
      usuarios.splice(indice, 1);
      for (let i = favoritos.length - 1; i >= 0; i -= 1) {
        if (favoritos[i].usuario_id === id) favoritos.splice(i, 1);
      }
      return { rows: [{ id: usuario.id }] };
    }
    throw new Error(`Consulta no esperada en la prueba: ${sql}`);
  }

  const consulta = mock.method(neon, 'query', ejecutarConsulta);
  neon.pool = {
    connect: mock.fn(async () => {
      if (caidaDespuesDeAutenticar) throw new Error('connect ECONNREFUSED 10.0.0.5:5432 detalle interno');
      const release = mock.fn();
      releases.push(release);
      return {
        query: mock.fn(async (sql, params = []) => {
          consultasCliente.push(sql);
          return ejecutarConsulta(sql, params);
        }),
        release,
      };
    }),
  };
  return { consulta, inserts, usuarios, favoritos, consultasCliente, releases };
}

const tokenDe = (id, rol) => firmarToken({ id, email: 'x@synapse-militaria.cl', rol }).token;
const GENERAL = () => tokenDe(1, 'Administrador General');
const ADMINISTRADOR = () => tokenDe(2, 'Administrador');

async function pedir(metodo, { token, body, ruta = '/api/usuarios' } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
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

test('PATCH /api/usuarios/:id desactiva y reactiva una cuenta Administrador, cambia su rol a Administrador General y de vuelta, y bloquea autenticar cuando está desactivada', async () => {
  const { usuarios } = simularNeon();
  const tokenEditor = ADMINISTRADOR();

  const desactivada = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { cuenta_activa: false } });
  assert.equal(desactivada.status, 200);
  assert.equal(desactivada.json.success, true);
  assert.equal(desactivada.json.data.id, 2);
  assert.equal(desactivada.json.data.cuenta_activa, false);
  assert.equal(desactivada.json.data.rol, 'Administrador');
  assert.equal(usuarios[1].cuenta_activa, false);
  sinDatosSensibles(desactivada.texto);

  // Una cuenta desactivada ya no pasa autenticar (401).
  const intentoDesactivada = await pedir('POST', { ruta: '/api/armas', token: tokenEditor, body: {} });
  assert.equal(intentoDesactivada.status, 401);
  assert.equal(intentoDesactivada.json.message, 'La sesión venció. Inicia sesión nuevamente.');

  const reactivada = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { cuenta_activa: true } });
  assert.equal(reactivada.status, 200);
  assert.equal(reactivada.json.data.cuenta_activa, true);
  sinDatosSensibles(reactivada.texto);

  const aGeneral = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { rol: 'Administrador General' } });
  assert.equal(aGeneral.status, 200);
  assert.equal(aGeneral.json.data.rol, 'Administrador General');
  assert.equal(usuarios[1].rol_id, 1);
  sinDatosSensibles(aGeneral.texto);

  const deVuelta = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { rol: 'Administrador' } });
  assert.equal(deVuelta.status, 200);
  assert.equal(deVuelta.json.data.rol, 'Administrador');
  assert.equal(usuarios[1].rol_id, 2);
  sinDatosSensibles(deVuelta.texto);
});

test('PATCH /api/usuarios/:id asciende una cuenta Usuario a Administrador, baja un Administrador a Usuario y le impide usar rutas protegidas del catálogo (403)', async () => {
  const usuaria = { id: 3, nombre: 'Investigadora', email: 'usuaria@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 3, cuenta_activa: true, ultimo_acceso: null, creado_en: new Date('2026-11-03T10:00:00Z') };
  const { usuarios } = simularNeon({ extras: [usuaria] });
  const tokenEditor = ADMINISTRADOR();

  const ascendida = await pedir('PATCH', { ruta: '/api/usuarios/3', token: GENERAL(), body: { rol: 'Administrador' } });
  assert.equal(ascendida.status, 200);
  assert.equal(ascendida.json.data.id, 3);
  assert.equal(ascendida.json.data.rol, 'Administrador');
  assert.equal(usuarios[2].rol_id, 2);
  sinDatosSensibles(ascendida.texto);

  const bajada = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { rol: 'Usuario' } });
  assert.equal(bajada.status, 200);
  assert.equal(bajada.json.data.id, 2);
  assert.equal(bajada.json.data.rol, 'Usuario');
  assert.equal(usuarios[1].rol_id, 3);
  sinDatosSensibles(bajada.texto);

  // Aunque su JWT se emitió cuando era Administrador, autenticar lee el rol actual desde la base y responde 403.
  const intentoCatalogo = await pedir('POST', { ruta: '/api/armas', token: tokenEditor, body: {} });
  assert.equal(intentoCatalogo.status, 403);
  assert.equal(intentoCatalogo.json.message, 'No tienes permiso para esta acción.');
});

test('DELETE /api/usuarios/:id elimina una cuenta Administrador y sus favoritos por ON DELETE CASCADE', async () => {
  const { usuarios, favoritos } = simularNeon();
  assert.equal(favoritos.length, 1);

  const eliminada = await pedir('DELETE', { ruta: '/api/usuarios/2', token: GENERAL() });
  assert.equal(eliminada.status, 200);
  assert.deepEqual(eliminada.json, { success: true, data: { id: 2 } });
  assert.deepEqual(usuarios.map(u => u.id), [1]);
  assert.equal(favoritos.length, 0);
  sinDatosSensibles(eliminada.texto);
});

for (const [caso, metodo, ruta, body, mensaje] of [
  [':id no numérico en PATCH', 'PATCH', '/api/usuarios/abc', { cuenta_activa: false }, /entero positivo/],
  [':id cero en PATCH', 'PATCH', '/api/usuarios/0', { cuenta_activa: false }, /entero positivo/],
  [':id negativo en DELETE', 'DELETE', '/api/usuarios/-5', undefined, /entero positivo/],
  [':id mayor a 2147483647 (fuera de rango INTEGER) en PATCH', 'PATCH', '/api/usuarios/9999999999', { cuenta_activa: false }, /entero positivo/],
  [':id mayor a 2147483647 (fuera de rango INTEGER) en DELETE', 'DELETE', '/api/usuarios/2147483648', undefined, /entero positivo/],
  ['body vacío en PATCH', 'PATCH', '/api/usuarios/2', {}, /cuenta_activa o rol/],
  ['cuenta_activa que no es booleano', 'PATCH', '/api/usuarios/2', { cuenta_activa: 'false' }, /cuenta_activa debe ser booleano/],
  ['rol inválido en PATCH', 'PATCH', '/api/usuarios/2', { rol: 'Superadmin' }, /Administrador General, Administrador o Usuario/],
]) {
  test(`${metodo} ${ruta} responde 400 con ${caso}`, async () => {
    simularNeon();
    const respuesta = await pedir(metodo, { ruta, token: GENERAL(), body });
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.json.success, false);
    assert.match(respuesta.json.message, mensaje);
    sinDatosSensibles(respuesta.texto);
  });
}

test('PATCH y DELETE /api/usuarios/:id responden 404 si la cuenta no existe', async () => {
  simularNeon();
  const patch = await pedir('PATCH', { ruta: '/api/usuarios/999', token: GENERAL(), body: { cuenta_activa: false } });
  const del = await pedir('DELETE', { ruta: '/api/usuarios/999', token: GENERAL() });
  for (const respuesta of [patch, del]) {
    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.json.message, 'Cuenta no encontrada.');
    sinDatosSensibles(respuesta.texto);
  }
});

test('PATCH y DELETE /api/usuarios/:id responden 400 al intentar modificar o eliminar la propia cuenta, incluso si Postgres devuelve el id como string', async () => {
  for (const idAdminComoString of [false, true]) {
    const { usuarios } = simularNeon({ idAdminComoString });
    const desactivarPropia = await pedir('PATCH', { ruta: '/api/usuarios/1', token: GENERAL(), body: { cuenta_activa: false } });
    const cambiarRolPropia = await pedir('PATCH', { ruta: '/api/usuarios/1', token: GENERAL(), body: { rol: 'Administrador' } });
    const eliminarPropia = await pedir('DELETE', { ruta: '/api/usuarios/1', token: GENERAL() });
    for (const respuesta of [desactivarPropia, cambiarRolPropia, eliminarPropia]) {
      assert.equal(respuesta.status, 400);
      assert.equal(respuesta.json.message, 'No puedes desactivar, cambiar el rol ni eliminar tu propia cuenta.');
      sinDatosSensibles(respuesta.texto);
    }
    assert.equal(usuarios[0].cuenta_activa, true);
    assert.equal(usuarios[0].rol_id, 1);
    assert.equal(usuarios.length, 2);
  }
});

test('ejecuta la consulta de bloqueo FOR UPDATE antes del UPDATE/DELETE, hace ROLLBACK si ocurre un error y siempre llama a release()', async () => {
  // Caso exitoso: BEGIN -> bloqueo -> UPDATE/DELETE -> COMMIT y release()
  const exito = simularNeon();
  const patchOk = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { cuenta_activa: false } });
  const deleteOk = await pedir('DELETE', { ruta: '/api/usuarios/2', token: GENERAL() });
  assert.equal(patchOk.status, 200);
  assert.equal(deleteOk.status, 200);
  assert.deepEqual(exito.consultasCliente, [
    'BEGIN',
    SQL_BLOQUEAR_GENERALES,
    SQL_ACTUALIZAR,
    'COMMIT',
    'BEGIN',
    SQL_BLOQUEAR_GENERALES,
    SQL_ELIMINAR,
    'COMMIT',
  ]);
  assert.equal(exito.releases.length, 2);
  for (const release of exito.releases) {
    assert.equal(release.mock.callCount(), 1);
  }

  // Caso de error en la consulta de modificación (503) y caso de cuenta inexistente (404): ambos hacen ROLLBACK y llaman a release()
  const fallo = simularNeon({ falloEnModificar: true });
  const patchFallo = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { cuenta_activa: false } });
  const deleteFallo = await pedir('DELETE', { ruta: '/api/usuarios/2', token: GENERAL() });
  assert.equal(patchFallo.status, 503);
  assert.equal(deleteFallo.status, 503);
  assert.deepEqual(fallo.consultasCliente, [
    'BEGIN',
    SQL_BLOQUEAR_GENERALES,
    SQL_ACTUALIZAR,
    'ROLLBACK',
    'BEGIN',
    SQL_BLOQUEAR_GENERALES,
    SQL_ELIMINAR,
    'ROLLBACK',
  ]);
  assert.equal(fallo.releases.length, 2);
  for (const release of fallo.releases) {
    assert.equal(release.mock.callCount(), 1);
  }

  const noEncontrada = simularNeon();
  const patch404 = await pedir('PATCH', { ruta: '/api/usuarios/999', token: GENERAL(), body: { cuenta_activa: false } });
  assert.equal(patch404.status, 404);
  assert.deepEqual(noEncontrada.consultasCliente, [
    'BEGIN',
    SQL_BLOQUEAR_GENERALES,
    SQL_ACTUALIZAR,
    'SELECT id FROM usuarios WHERE id = $1',
    'ROLLBACK',
  ]);
  assert.equal(noEncontrada.releases.length, 1);
  assert.equal(noEncontrada.releases[0].mock.callCount(), 1);
});

test('responde 409 al intentar desactivar, quitar el rol o eliminar al único Administrador General activo, y lo permite cuando hay otro activo', async () => {
  const otroGeneral = { id: 3, nombre: 'Subjefe de archivo', email: 'general2@synapse-militaria.cl', password_hash: HASH_EXISTENTE, rol_id: 1, cuenta_activa: true, ultimo_acceso: null, creado_en: new Date('2026-11-03T10:00:00Z') };

  // Si entre autenticar y la consulta de modificación la cuenta 1 dejó de ser Administrador General activo, la cuenta 3 queda como única activa y la cláusula WHERE bloquea el cambio con 409.
  for (const [accion, metodo, body] of [
    ['desactivar', 'PATCH', { cuenta_activa: false }],
    ['quitar el rol', 'PATCH', { rol: 'Administrador' }],
    ['eliminar', 'DELETE', undefined],
  ]) {
    const { usuarios } = simularNeon({
      extras: [otroGeneral],
      despuesDeAutenticar: lista => { lista[0].cuenta_activa = false; },
    });
    const respuesta = await pedir(metodo, { ruta: '/api/usuarios/3', token: GENERAL(), body });
    assert.equal(respuesta.status, 409, `debía responder 409 al ${accion} al único Administrador General activo`);
    assert.equal(respuesta.json.message, 'Debe quedar al menos un Administrador General activo.');
    assert.equal(usuarios.find(u => u.id === 3)?.cuenta_activa, true);
    assert.equal(usuarios.find(u => u.id === 3)?.rol_id, 1);
    sinDatosSensibles(respuesta.texto);
  }

  // Cuando hay otro Administrador General activo (cuenta 1 activa), sí se permite desactivar, quitar el rol y eliminar a la cuenta 3.
  const { usuarios } = simularNeon({ extras: [otroGeneral] });
  const desactivado = await pedir('PATCH', { ruta: '/api/usuarios/3', token: GENERAL(), body: { cuenta_activa: false } });
  assert.equal(desactivado.status, 200);
  assert.equal(desactivado.json.data.cuenta_activa, false);

  await pedir('PATCH', { ruta: '/api/usuarios/3', token: GENERAL(), body: { cuenta_activa: true } });
  const degradado = await pedir('PATCH', { ruta: '/api/usuarios/3', token: GENERAL(), body: { rol: 'Administrador' } });
  assert.equal(degradado.status, 200);
  assert.equal(degradado.json.data.rol, 'Administrador');

  await pedir('PATCH', { ruta: '/api/usuarios/3', token: GENERAL(), body: { rol: 'Administrador General' } });
  const eliminado = await pedir('DELETE', { ruta: '/api/usuarios/3', token: GENERAL() });
  assert.equal(eliminado.status, 200);
  assert.deepEqual(eliminado.json, { success: true, data: { id: 3 } });
  assert.ok(!usuarios.some(u => u.id === 3));
});

test('PATCH y DELETE /api/usuarios/:id responden 403 para rol Administrador y 401 sin token', async () => {
  const { usuarios } = simularNeon();
  const patchAdmin = await pedir('PATCH', { ruta: '/api/usuarios/1', token: ADMINISTRADOR(), body: { cuenta_activa: false } });
  const deleteAdmin = await pedir('DELETE', { ruta: '/api/usuarios/1', token: ADMINISTRADOR() });
  for (const respuesta of [patchAdmin, deleteAdmin]) {
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.json.message, 'No tienes permiso para esta acción.');
    sinDatosSensibles(respuesta.texto);
  }

  const patchSinToken = await pedir('PATCH', { ruta: '/api/usuarios/2', body: { cuenta_activa: false } });
  const deleteSinToken = await pedir('DELETE', { ruta: '/api/usuarios/2' });
  for (const respuesta of [patchSinToken, deleteSinToken]) {
    assert.equal(respuesta.status, 401);
    sinDatosSensibles(respuesta.texto);
  }
  assert.equal(usuarios.length, 2);
});

test('PATCH y DELETE /api/usuarios/:id responden 503 con Postgres caído', async () => {
  simularNeon({ caidaDespuesDeAutenticar: true });
  const patch = await pedir('PATCH', { ruta: '/api/usuarios/2', token: GENERAL(), body: { cuenta_activa: false } });
  const del = await pedir('DELETE', { ruta: '/api/usuarios/2', token: GENERAL() });
  for (const respuesta of [patch, del]) {
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.json.message, 'Servicio de cuentas no disponible temporalmente.');
    assert.ok(!/ECONNREFUSED|10\.0\.0\.5|detalle interno/.test(respuesta.texto));
    sinDatosSensibles(respuesta.texto);
  }
});

test('OPTIONS desde http://localhost:5173 incluye PATCH en Access-Control-Allow-Methods', async () => {
  const respuesta = await fetch(`${base}/api/usuarios/2`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(respuesta.status, 204);
  const metodos = respuesta.headers.get('access-control-allow-methods') || '';
  assert.ok(metodos.split(',').includes('PATCH'), `se esperaba PATCH en Access-Control-Allow-Methods: ${metodos}`);
});
