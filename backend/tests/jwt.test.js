const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

// Clave conocida solo para estas pruebas (no se guarda en ningún archivo).
const CLAVE_PRUEBA = crypto.randomBytes(48).toString('hex');
process.env.JWT_SECRET = CLAVE_PRUEBA;

const { firmarToken, verificarToken } = require('../config/jwt');

const usuario = { id: 42, email: 'admin@synapse-militaria.cl', rol: 'admin' };

test('firma un token y lo verifica correctamente', () => {
  const antes = Date.now();
  const { token, expiresAt } = firmarToken(usuario);
  const payload = verificarToken(token);

  assert.equal(payload.sub, '42');
  assert.equal(payload.email, usuario.email);
  assert.equal(payload.rol, usuario.rol);
  assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
  assert.equal(payload.exp - payload.iat, 30 * 60);
  assert.equal(expiresAt, payload.exp * 1000);
  assert.ok(expiresAt >= antes + 30 * 60 * 1000 - 1000 && expiresAt <= Date.now() + 30 * 60 * 1000);
});

test('rechaza un token vencido', () => {
  const ahora = Math.floor(Date.now() / 1000);
  const vencido = jwt.sign(
    { sub: '42', email: usuario.email, rol: usuario.rol, iat: ahora - 3600, exp: ahora - 1800 },
    CLAVE_PRUEBA,
    { algorithm: 'HS256' }
  );
  assert.throws(() => verificarToken(vencido), { name: 'TokenExpiredError' });
});

test('rechaza un token firmado con otra clave', () => {
  const otraClave = crypto.randomBytes(48).toString('hex');
  const falso = jwt.sign({ email: usuario.email, rol: usuario.rol }, otraClave, { algorithm: 'HS256', subject: '42', expiresIn: 1800 });
  assert.throws(() => verificarToken(falso), { name: 'JsonWebTokenError', message: 'invalid signature' });
});

test('rechaza un token con algoritmo distinto de HS256', () => {
  // Firmado con la misma clave pero HS512: solo debe fallar por el algoritmo.
  const hs512 = jwt.sign({ email: usuario.email, rol: usuario.rol }, CLAVE_PRUEBA, { algorithm: 'HS512', subject: '42', expiresIn: 1800 });
  assert.throws(() => verificarToken(hs512), { name: 'JsonWebTokenError', message: 'invalid algorithm' });

  // Token sin firma (alg "none").
  const codificar = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sinFirma = `${codificar({ alg: 'none', typ: 'JWT' })}.${codificar({ sub: '42', rol: 'admin', exp: Math.floor(Date.now() / 1000) + 1800 })}.`;
  assert.throws(() => verificarToken(sinFirma), { name: 'JsonWebTokenError' });
});

test('el payload no incluye contraseñas ni hashes', () => {
  const { token } = firmarToken({
    ...usuario,
    password: 'no-debe-aparecer',
    password_hash: 'hash-no-debe-aparecer',
    hash: 'otro-hash',
    token_hash: 'hash-de-token',
  });
  const payload = verificarToken(token);

  assert.deepEqual(Object.keys(payload).sort(), ['email', 'exp', 'iat', 'rol', 'sub']);
  const texto = JSON.stringify(payload).toLowerCase();
  for (const prohibido of ['password', 'hash', 'no-debe-aparecer']) assert.ok(!texto.includes(prohibido));
});

test('en pruebas sin JWT_SECRET usa una clave temporal', () => {
  const previa = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const { token } = firmarToken(usuario);
    assert.equal(verificarToken(token).sub, '42');
    // La clave temporal no es la clave de prueba.
    assert.throws(() => jwt.verify(token, CLAVE_PRUEBA, { algorithms: ['HS256'] }));
  } finally {
    process.env.JWT_SECRET = previa;
  }
});

test('en producción exige JWT_SECRET de al menos 32 caracteres', () => {
  const previos = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
  process.env.NODE_ENV = 'production';
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => firmarToken(usuario), /JWT_SECRET/);
    process.env.JWT_SECRET = 'corta';
    assert.throws(() => firmarToken(usuario), /JWT_SECRET/);
  } finally {
    for (const [nombre, valor] of Object.entries(previos)) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  }
});
