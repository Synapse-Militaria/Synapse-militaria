const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const neon = require('../neon');
const { crearAdministradorInicial } = require('../seed');

// Ninguna prueba se conecta a una base real: neon.pool y neon.query se simulan.
const VARIABLES = ['ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const poolOriginal = neon.pool;
const CLAVE_VALIDA = 'Clave-Segura-2026!';
let envOriginal;
let salida;

beforeEach(() => {
  envOriginal = Object.fromEntries(VARIABLES.map(nombre => [nombre, process.env[nombre]]));
  neon.pool = {};
  // Se guarda lo que el seed muestra en consola para revisarlo sin ensuciar la salida.
  salida = [];
  for (const metodo of ['log', 'warn', 'error']) {
    mock.method(console, metodo, (...args) => salida.push(args.join(' ')));
  }
});

afterEach(() => {
  mock.restoreAll();
  neon.pool = poolOriginal;
  for (const [nombre, valor] of Object.entries(envOriginal)) {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  }
});

function definirCuenta(email, password) {
  if (email === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = email;
  if (password === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = password;
}

// Simula Postgres con roles y una tabla usuarios en memoria que respeta UNIQUE(email).
function simularNeon({ roles = [{ id: 1, nombre: 'Administrador General' }], emailsExistentes = [] } = {}) {
  const usuarios = emailsExistentes.map((email, i) => ({ id: i + 1, email }));
  const inserts = [];
  const consulta = mock.method(neon, 'query', async (sql, params = []) => {
    if (/^SELECT id FROM roles WHERE nombre = \$1$/.test(sql)) {
      return { rows: roles.filter(rol => rol.nombre === params[0]).map(({ id }) => ({ id })) };
    }
    if (sql.startsWith('INSERT INTO usuarios')) {
      assert.equal(sql, "INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES ('Administrador', $1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id");
      const [email, password_hash, rol_id] = params;
      inserts.push({ email, password_hash, rol_id });
      if (usuarios.some(u => u.email === email)) return { rows: [] };
      usuarios.push({ id: usuarios.length + 1, email });
      return { rows: [{ id: usuarios.length }] };
    }
    throw new Error(`Consulta no esperada en la prueba: ${sql}`);
  });
  return { consulta, inserts, usuarios };
}

function salidaSinDatosSensibles(email, password) {
  const texto = salida.join('\n');
  assert.ok(!texto.includes(email), 'la consola no debe mostrar el correo completo');
  assert.ok(!texto.includes(password), 'la consola no debe mostrar la clave');
  assert.ok(!/scrypt:/.test(texto), 'la consola no debe mostrar el hash');
}

test('crea la cuenta con hash scrypt, rol Administrador General y el correo en minúsculas', async () => {
  definirCuenta('  Jefe.Archivo@Synapse-Militaria.CL ', CLAVE_VALIDA);
  const { inserts } = simularNeon({ roles: [{ id: 7, nombre: 'Administrador General' }] });

  const resultado = await crearAdministradorInicial();

  assert.deepEqual(resultado, { estado: 'creada' });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].email, 'jefe.archivo@synapse-militaria.cl');
  assert.equal(inserts[0].rol_id, 7);
  assert.match(inserts[0].password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.ok(!inserts[0].password_hash.includes(CLAVE_VALIDA));
  salidaSinDatosSensibles('jefe.archivo@synapse-militaria.cl', CLAVE_VALIDA);
});

for (const [caso, email, password] of [
  ['falta ADMIN_EMAIL', undefined, CLAVE_VALIDA],
  ['falta ADMIN_PASSWORD', 'jefe@synapse-militaria.cl', undefined],
  ['faltan las dos', undefined, undefined],
]) {
  test(`no hace consultas y avisa cómo definirlas si ${caso}`, async () => {
    definirCuenta(email, password);
    const { consulta } = simularNeon();

    const resultado = await crearAdministradorInicial();

    assert.deepEqual(resultado, { estado: 'omitida', motivo: 'faltan-variables' });
    assert.equal(consulta.mock.callCount(), 0);
    assert.match(salida.join('\n'), /define ADMIN_EMAIL y ADMIN_PASSWORD/);
  });
}

for (const [caso, email, password, mensaje] of [
  ['la clave admin123', 'jefe@synapse-militaria.cl', 'admin123', /no puede ser admin123/],
  ['una clave corta', 'jefe@synapse-militaria.cl', 'Corta-2026', /entre 12 y 128 caracteres/],
  ['una clave demasiado larga', 'jefe@synapse-militaria.cl', 'x'.repeat(129), /entre 12 y 128 caracteres/],
  ['una clave que contiene el correo', 'jefe.archivo@synapse-militaria.cl', 'Jefe.Archivo-2026!', /parte del correo antes de la @/],
  ['un correo sin formato válido', 'jefe-sin-arroba', CLAVE_VALIDA, /formato de correo válido/],
]) {
  test(`rechaza ${caso} sin consultar Neon`, async () => {
    definirCuenta(email, password);
    const { consulta } = simularNeon();

    const resultado = await crearAdministradorInicial();

    assert.deepEqual(resultado, { estado: 'omitida', motivo: 'datos-invalidos' });
    assert.equal(consulta.mock.callCount(), 0);
    assert.match(salida.join('\n'), mensaje);
    // admin123 es pública y el aviso la nombra a propósito; las demás claves no deben aparecer.
    if (password !== 'admin123') salidaSinDatosSensibles(email, password);
  });
}

test('avisa sin duplicar ni cambiar la contraseña si la cuenta ya existe', async () => {
  definirCuenta('jefe@synapse-militaria.cl', CLAVE_VALIDA);
  const { inserts, usuarios } = simularNeon({ emailsExistentes: ['jefe@synapse-militaria.cl'] });

  const resultado = await crearAdministradorInicial();

  assert.deepEqual(resultado, { estado: 'existente' });
  assert.equal(inserts.length, 1); // un solo intento, resuelto por ON CONFLICT DO NOTHING
  assert.equal(usuarios.length, 1);
  assert.match(salida.join('\n'), /ya existía.*no se cambió su contraseña/);
  salidaSinDatosSensibles('jefe@synapse-militaria.cl', CLAVE_VALIDA);
});

test('se detiene sin insertar si falta el rol Administrador General', async () => {
  definirCuenta('jefe@synapse-militaria.cl', CLAVE_VALIDA);
  const { inserts } = simularNeon({ roles: [{ id: 2, nombre: 'Administrador' }] });

  await assert.rejects(crearAdministradorInicial(), /Administrador General.*database\/schema\.sql/);
  assert.equal(inserts.length, 0);
});

test('no hace nada si neon.pool es null (falta NEON_URI)', async () => {
  definirCuenta('jefe@synapse-militaria.cl', CLAVE_VALIDA);
  neon.pool = null;
  const { consulta } = simularNeon();

  const resultado = await crearAdministradorInicial();

  assert.deepEqual(resultado, { estado: 'omitida', motivo: 'sin-neon' });
  assert.equal(consulta.mock.callCount(), 0);
  assert.match(salida.join('\n'), /falta NEON_URI/);
});
