const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../app');
const { Pais, Conflicto } = require('../models/armaModel');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(() => mock.restoreAll());

for (const [tipo, Modelo, datos] of [
  ['paises', Pais, { _id: '6713f1a0c9d8e20015a4b004', nombre: 'Reino Unido' }],
  ['conflictos', Conflicto, { _id: '6713f1a0c9d8e20015a4b201', nombre_conflicto: 'Segunda Guerra Mundial', fecha_inicio: '1939-09-01', teatro_operaciones: 'Europa' }],
]) {
  test(`GET /api/${tipo}/:id distingue identificadores inválidos, registros ausentes y existentes`, async () => {
    let registro = null;
    const buscar = mock.method(Modelo, 'findById', async id => {
      assert.equal(id, datos._id);
      return registro;
    });
    assert.equal((await fetch(`${base}/api/${tipo}/invalido`)).status, 400);
    assert.equal(buscar.mock.callCount(), 0);
    assert.equal((await fetch(`${base}/api/${tipo}/${datos._id}`)).status, 404);
    registro = new Modelo(datos);
    const respuesta = await fetch(`${base}/api/${tipo}/${datos._id}`);
    assert.equal(respuesta.status, 200);
    const body = await respuesta.json();
    assert.equal(body.success, true);
    assert.equal(body.data._id, datos._id);
    assert.equal(body.data.nombre ?? body.data.nombre_conflicto, datos.nombre ?? datos.nombre_conflicto);
  });
}
