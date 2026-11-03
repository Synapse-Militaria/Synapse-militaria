const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearLimitadorLogin } = require('../middleware/loginLimiter');
const { app } = require('../app');

function intento(limitador, ip = '127.0.0.1') {
  const resultado = { estado: 200, cabeceras: {} };
  const res = {
    setHeader: (nombre, valor) => { resultado.cabeceras[nombre] = valor; },
    status: estado => { resultado.estado = estado; return res; },
    json: body => { resultado.body = body; },
  };
  limitador({ ip }, res, () => { resultado.continua = true; });
  return resultado;
}

test('el login bloquea el sexto intento por IP y vuelve a permitirlo al expirar la ventana', () => {
  const previo = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let tiempo = 1000;
    const limitador = crearLimitadorLogin({ ahora: () => tiempo });
    for (let i = 0; i < 5; i += 1) assert.equal(intento(limitador).continua, true);
    const bloqueado = intento(limitador);
    assert.equal(bloqueado.estado, 429);
    assert.equal(bloqueado.continua, undefined);
    assert.equal(bloqueado.cabeceras['Retry-After'], '900');
    assert.equal(intento(limitador, '127.0.0.2').continua, true);
    tiempo += 15 * 60 * 1000;
    assert.equal(intento(limitador).continua, true);
  } finally {
    if (previo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previo;
  }
});

test('el limitador no bloquea las suites configuradas con NODE_ENV=test', () => {
  const previo = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const limitador = crearLimitadorLogin();
    for (let i = 0; i < 10; i += 1) assert.equal(intento(limitador).continua, true);
  } finally {
    if (previo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previo;
  }
});

test('POST /api/auth/login aplica el límite antes de procesar otra autenticación', async () => {
  const previo = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    for (let i = 0; i < 6; i += 1) {
      const respuesta = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(respuesta.status, i < 5 ? 400 : 429);
      if (i === 5) assert.ok(Number(respuesta.headers.get('Retry-After')) > 0 && Number(respuesta.headers.get('Retry-After')) <= 900);
      await respuesta.body.cancel();
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previo;
  }
});
