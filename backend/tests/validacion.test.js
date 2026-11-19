const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarCuenta, normalizarEmail, LARGO_MINIMO_CLAVE, LARGO_MAXIMO_CLAVE } = require('../utils/validarCuenta');
const { requerirRol } = require('../middleware/requerirRol');

// Pruebas puras: no se conectan a MongoDB ni a PostgreSQL.
const EMAIL = 'jefe.archivo@synapse-militaria.cl';
const CLAVE_VALIDA = 'Clave-Segura-2026!';

test('validarCuenta acepta una cuenta válida', () => {
  assert.equal(validarCuenta({ email: EMAIL, password: CLAVE_VALIDA }), null);
  assert.equal(LARGO_MINIMO_CLAVE, 12);
  assert.equal(LARGO_MAXIMO_CLAVE, 128);
});

test('validarCuenta rechaza un correo sin @', () => {
  assert.equal(validarCuenta({ email: 'jefe-sin-arroba', password: CLAVE_VALIDA }), 'El correo no tiene un formato válido.');
});

test('validarCuenta rechaza un correo de más de 254 caracteres', () => {
  const largo = `${'a'.repeat(64)}@${'b'.repeat(186)}.cl`;
  assert.equal(largo.length, 254);
  assert.equal(validarCuenta({ email: largo, password: CLAVE_VALIDA }), null);
  const demasiado = `${'a'.repeat(64)}@${'b'.repeat(187)}.cl`;
  assert.equal(demasiado.length, 255);
  assert.equal(validarCuenta({ email: demasiado, password: CLAVE_VALIDA }), 'El correo no tiene un formato válido.');
});

test('validarCuenta rechaza admin123 sin importar mayúsculas', () => {
  for (const password of ['admin123', 'ADMIN123']) {
    assert.equal(validarCuenta({ email: EMAIL, password }), 'La contraseña no puede ser admin123.', password);
  }
});

test('validarCuenta exige entre 12 y 128 caracteres', () => {
  const mensaje = 'La contraseña debe tener entre 12 y 128 caracteres.';
  assert.equal(validarCuenta({ email: EMAIL, password: 'x'.repeat(11) }), mensaje);
  assert.equal(validarCuenta({ email: EMAIL, password: 'x'.repeat(129) }), mensaje);
  assert.equal(validarCuenta({ email: EMAIL, password: 'x'.repeat(12) }), null);
  assert.equal(validarCuenta({ email: EMAIL, password: 'x'.repeat(128) }), null);
});

test('validarCuenta rechaza una contraseña que contiene la parte del correo antes de la @', () => {
  assert.equal(validarCuenta({ email: EMAIL, password: 'xx-JEFE.Archivo-2026' }), 'La contraseña no puede contener la parte del correo antes de la @.');
});

test('normalizarEmail quita espacios y pasa a minúsculas', () => {
  assert.equal(normalizarEmail('  Jefe.Archivo@Synapse-Militaria.CL \t'), EMAIL);
});

// Ejecuta el middleware y devuelve con qué se llamó a next.
function ejecutar(middleware, req) {
  const llamadas = [];
  middleware(req, {}, (...args) => llamadas.push(args));
  assert.equal(llamadas.length, 1, 'next se llama una sola vez');
  return llamadas[0][0];
}

test('requerirRol deja pasar a un rol permitido', () => {
  assert.equal(ejecutar(requerirRol('Administrador General'), { admin: { rol: 'Administrador General' } }), undefined);
});

test('requerirRol responde 403 a un rol no permitido', () => {
  const error = ejecutar(requerirRol('Administrador General'), { admin: { rol: 'Administrador' } });
  assert.equal(error.status, 403);
  assert.equal(error.message, 'No tienes permiso para esta acción.');
});

test('requerirRol responde 403 si no hay req.admin', () => {
  assert.equal(ejecutar(requerirRol('Administrador General'), {}).status, 403);
});

test('requerirRol acepta varios roles a la vez', () => {
  const middleware = requerirRol('Administrador General', 'Administrador');
  assert.equal(ejecutar(middleware, { admin: { rol: 'Administrador General' } }), undefined);
  assert.equal(ejecutar(middleware, { admin: { rol: 'Administrador' } }), undefined);
  assert.equal(ejecutar(middleware, { admin: { rol: 'Editor' } }).status, 403);
});
