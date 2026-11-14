const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const neon = require('../neon');
const { migrarAdministradores } = require('../scripts/migrarAdmin');

// Ninguna prueba se conecta a una base real: neon.query y la colección Administradores se simulan.
const HASH_VALIDO = `scrypt:${'a1'.repeat(16)}:${'b2'.repeat(64)}`;
const HASH_VALIDO_2 = `scrypt:${'c3'.repeat(16)}:${'d4'.repeat(64)}`;
const ROLES = [{ id: 1, nombre: 'Administrador General' }, { id: 2, nombre: 'Administrador' }];

afterEach(() => mock.restoreAll());

function simularMongo(cuentas) {
  const llamadas = { colecciones: [], filtros: [] };
  mock.method(mongoose.connection, 'collection', nombre => {
    llamadas.colecciones.push(nombre);
    return {
      find(filtro) {
        llamadas.filtros.push(filtro);
        return { toArray: async () => cuentas.map(cuenta => ({ ...cuenta })) };
      },
    };
  });
  return llamadas;
}

// Simula Postgres con una tabla usuarios en memoria que respeta UNIQUE(email).
function simularNeon({ roles = ROLES, emailsExistentes = [] } = {}) {
  const usuarios = emailsExistentes.map((email, i) => ({ id: i + 1, email, rol_id: 2, cuenta_activa: true }));
  const inserts = [];
  mock.method(neon, 'query', async (sql, params = []) => {
    if (/FROM roles WHERE nombre = ANY/.test(sql)) {
      return { rows: roles.filter(rol => params[0].includes(rol.nombre)) };
    }
    if (/^\s*INSERT INTO usuarios/.test(sql)) {
      assert.match(sql, /ON CONFLICT \(email\) DO NOTHING/);
      assert.match(sql, /RETURNING id/);
      const [nombre, email, password_hash, rol_id, cuenta_activa, ultimo_acceso] = params;
      inserts.push({ nombre, email, password_hash, rol_id, cuenta_activa, ultimo_acceso });
      if (usuarios.some(u => u.email === email)) return { rows: [] };
      const fila = { id: usuarios.length + 1, email, rol_id, cuenta_activa };
      usuarios.push(fila);
      return { rows: [{ id: fila.id }] };
    }
    if (/count\(\*\)/.test(sql)) {
      const idGeneral = roles.find(r => r.nombre === params[0])?.id;
      return { rows: [{ total: usuarios.filter(u => u.rol_id === idGeneral && u.cuenta_activa).length }] };
    }
    throw new Error(`Consulta no esperada en la prueba: ${sql}`);
  });
  return { inserts, usuarios };
}

test('copia el mismo hash sin cambiarlo y el resto de los datos de la cuenta', async () => {
  const ultimoAcceso = new Date('2026-10-01T12:00:00Z');
  const mongo = simularMongo([
    { email: '  Admin@Ejemplo.CL ', password_hash: HASH_VALIDO, rol: 'Administrador General', cuenta_activa: false, ultimo_acceso: ultimoAcceso },
  ]);
  const { inserts } = simularNeon();

  const resumen = await migrarAdministradores();

  assert.deepEqual(mongo.colecciones, ['Administradores']);
  assert.deepEqual(mongo.filtros, [{}]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].password_hash, HASH_VALIDO);
  assert.equal(inserts[0].nombre, 'Administrador');
  assert.equal(inserts[0].email, 'admin@ejemplo.cl');
  assert.equal(inserts[0].cuenta_activa, false);
  assert.equal(inserts[0].ultimo_acceso.getTime(), ultimoAcceso.getTime());
  assert.deepEqual(resumen, { leidas: 1, insertadas: 1, existentes: 0, omitidas: 0, hayAdminGeneralActivo: false });
});

test('no duplica una cuenta que ya existe en usuarios', async () => {
  simularMongo([
    { email: 'existente@ejemplo.cl', password_hash: HASH_VALIDO, rol: 'Administrador' },
    { email: 'nuevo@ejemplo.cl', password_hash: HASH_VALIDO_2, rol: 'Administrador' },
  ]);
  const { usuarios } = simularNeon({ emailsExistentes: ['existente@ejemplo.cl'] });

  const resumen = await migrarAdministradores();

  assert.equal(resumen.insertadas, 1);
  assert.equal(resumen.existentes, 1);
  assert.equal(usuarios.filter(u => u.email === 'existente@ejemplo.cl').length, 1);
  assert.equal(usuarios.length, 2);
});

test('asigna el rol según la cuenta y usa Administrador si viene vacío o con otro valor', async () => {
  simularMongo([
    { email: 'general@ejemplo.cl', password_hash: HASH_VALIDO, rol: 'Administrador General' },
    { email: 'admin@ejemplo.cl', password_hash: HASH_VALIDO, rol: 'Administrador' },
    { email: 'sinrol@ejemplo.cl', password_hash: HASH_VALIDO },
    { email: 'otro@ejemplo.cl', password_hash: HASH_VALIDO, rol: 'Superusuario' },
  ]);
  const { inserts } = simularNeon();

  const resumen = await migrarAdministradores();

  assert.deepEqual(inserts.map(i => [i.email, i.rol_id]), [
    ['general@ejemplo.cl', 1],
    ['admin@ejemplo.cl', 2],
    ['sinrol@ejemplo.cl', 2],
    ['otro@ejemplo.cl', 2],
  ]);
  // Sin cuenta_activa en Mongo se usa true, como el default del modelo.
  assert.ok(inserts.every(i => i.cuenta_activa === true && i.ultimo_acceso === null));
  assert.equal(resumen.hayAdminGeneralActivo, true);
});

test('omite las cuentas con un hash de formato inválido', async () => {
  simularMongo([
    { email: 'valida@ejemplo.cl', password_hash: HASH_VALIDO },
    { email: 'bcrypt@ejemplo.cl', password_hash: '$2b$10$abcdefghijklmnopqrstuv' },
    { email: 'corto@ejemplo.cl', password_hash: 'scrypt:sal:abc123' },
    { email: 'sinsal@ejemplo.cl', password_hash: `scrypt::${'b2'.repeat(64)}` },
    { email: 'vacio@ejemplo.cl', password_hash: '' },
  ]);
  const { inserts } = simularNeon();

  const resumen = await migrarAdministradores();

  assert.deepEqual(inserts.map(i => i.email), ['valida@ejemplo.cl']);
  assert.deepEqual(resumen, { leidas: 5, insertadas: 1, existentes: 0, omitidas: 4, hayAdminGeneralActivo: false });
});

test('se detiene sin insertar nada si falta un rol en la tabla roles', async () => {
  const mongo = simularMongo([{ email: 'admin@ejemplo.cl', password_hash: HASH_VALIDO, rol: 'Administrador General' }]);
  const { inserts } = simularNeon({ roles: [{ id: 2, nombre: 'Administrador' }] });

  await assert.rejects(migrarAdministradores(), /Administrador General.*database\/schema\.sql/);
  assert.equal(inserts.length, 0);
  assert.equal(mongo.colecciones.length, 0);
});
