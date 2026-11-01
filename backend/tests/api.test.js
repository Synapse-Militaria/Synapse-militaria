const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../app');
const { Arma, Conflicto, Administrador, Pais } = require('../models/armaModel');
const { catalogoController, crearHash } = require('../controllers/armaController');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(() => mock.restoreAll());

const datosArma = {
  _id: '6713f1a0c9d8e20015a4b101',
  nombre: 'M1 Garand',
  designacion_oficial: 'Rifle, Caliber .30, M1',
  tipo_arma: 'Rifle',
  anio_creacion: 1936,
  descripcion: 'Fusil semiautomático adoptado por Estados Unidos en 1936.',
  especificaciones_tecnicas: { calibre: '.30-06 Springfield', longitud_total_mm: 1107, peso_cargado_kg: null, peso_sin_cargar_kg: 4.3, modos_de_fuego: 'Semiautomático' },
  multimedia: [{ url_archivo: '/images/m1-garand.jpg', descripcion_imagen: 'M1 Garand', es_portada: true }],
  referencias: [{ detalle_cita: 'Hatcher (1948). The Book of the Garand.', url_enlace: 'https://archive.org/details/bookofgarand00hatc', verificada: false }],
};

test('el modelo conserva la ficha documental completa', async () => {
  const arma = new Arma({ ...datosArma,
    pais_origen: { id_pais: '6713f1a0c9d8e20015a4b001', nombre: 'Estados Unidos', codigo_iso: 'US' },
    eventos: [{ id_evento: '6713f1a0c9d8e20015a4b201', nombre_conflicto: 'Segunda Guerra Mundial', fecha_inicio: '1939-09-01', rol: 'Infantería' }],
  });
  await arma.validate();
  const documento = arma.toObject();
  assert.equal(documento.designacion_oficial, datosArma.designacion_oficial);
  assert.equal(documento.especificaciones_tecnicas.calibre, '.30-06 Springfield');
  assert.equal(documento.especificaciones_tecnicas.peso_sin_cargar_kg, 4.3);
  assert.equal(documento.pais_origen.codigo_iso, 'US');
  assert.equal(documento.eventos[0].nombre_conflicto, 'Segunda Guerra Mundial');
  assert.equal(documento.multimedia.length, 1);
  assert.equal(documento.referencias.length, 1);
  assert.equal(Arma.collection.name, 'Armas');
});

test('se rechazan fechas invertidas y valores técnicos negativos', async () => {
  await assert.rejects(new Conflicto({ nombre_conflicto: 'Conflicto de prueba', teatro_operaciones: 'Europa', fecha_inicio: '1945-09-02', fecha_fin: '1939-09-01' }).validate(), /fecha final/);
  await assert.rejects(new Arma({ ...datosArma, especificaciones_tecnicas: { peso_cargado_kg: -1 } }).validate(), /minimum allowed value/);
});

test('CORS permite leer el catálogo desde Vite', async () => {
  mock.method(Arma, 'find', () => ({ sort: async () => [] }));
  const respuesta = await fetch(`${base}/api/armas`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.deepEqual((await respuesta.json()).data, []);
});

test('la búsqueda interpreta corchetes literalmente', async () => {
  let filtro;
  mock.method(Arma, 'find', value => { filtro = value; return { sort: async () => [] }; });
  const respuesta = await fetch(`${base}/api/armas/buscar?termino=%5B`);
  assert.equal(respuesta.status, 200);
  assert.equal(filtro.nombre.test('['), true);
  assert.equal(filtro.nombre.test('M1 Garand'), false);
});

test('IDs inválidos devuelven 400 y registros ausentes devuelven 404', async () => {
  assert.equal((await fetch(`${base}/api/armas/9/conflictos`)).status, 400);
  mock.method(Arma, 'findById', async () => null);
  assert.equal((await fetch(`${base}/api/armas/6713f1a0c9d8e20015a4b101/conflictos`)).status, 404);
});

test('no se puede crear una ficha sin sesión', async () => {
  const respuesta = await fetch(`${base}/api/armas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datosArma) });
  assert.equal(respuesta.status, 401);
});

test('login valida el hash y una sesión permite guardar y eliminar una ficha', async () => {
  const password_hash = await crearHash('clave-de-prueba');
  const admin = { email: 'admin@example.cl', password_hash, save: async () => {} };
  mock.method(Administrador, 'findOne', () => ({ select: async () => admin }));
  const iniciar = password => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password }) });
  assert.equal((await iniciar('incorrecta')).status, 401);
  const sesion = (await (await iniciar('clave-de-prueba')).json()).data;
  assert.ok(sesion.token);
  assert.equal(sesion.password_hash, undefined);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` };
  mock.method(Arma.prototype, 'save', async function () { return this; });
  mock.method(Conflicto, 'updateMany', async () => ({ modifiedCount: 0 }));
  const creada = await fetch(`${base}/api/armas`, { method: 'POST', headers, body: JSON.stringify(datosArma) });
  assert.equal(creada.status, 201);
  assert.equal((await creada.json()).data.especificaciones_tecnicas.calibre, '.30-06 Springfield');
  mock.method(Arma, 'findById', async () => new Arma(datosArma));
  const editada = await fetch(`${base}/api/armas/${datosArma._id}`, { method: 'PUT', headers, body: JSON.stringify({ descripcion: 'Ficha histórica revisada para la enciclopedia.' }) });
  assert.equal(editada.status, 200);
  assert.equal((await editada.json()).data.descripcion, 'Ficha histórica revisada para la enciclopedia.');
  mock.method(Arma, 'findByIdAndDelete', async () => new Arma(datosArma));
  assert.equal((await fetch(`${base}/api/armas/${datosArma._id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(`${base}/api/armas`, { method: 'POST', headers, body: JSON.stringify(datosArma) })).status, 401);
});

test('editar un país actualiza las copias extendidas en las armas', async () => {
  const pais = new Pais({ _id: '6713f1a0c9d8e20015a4b001', nombre: 'Estados Unidos', codigo_iso: 'US' });
  mock.method(Pais, 'findById', async () => pais);
  mock.method(Pais.prototype, 'save', async function () { return this; });
  let actualizacion;
  mock.method(Arma, 'updateMany', async (filtro, cambios) => { actualizacion = { filtro, cambios }; });
  await catalogoController('paises').actualizar({ params: { id: String(pais._id) }, body: { nombre: 'Estados Unidos de América' } }, { json: () => {} });
  assert.equal(String(actualizacion.filtro['pais_origen.id_pais']), String(pais._id));
  assert.equal(actualizacion.cambios.$set['pais_origen.nombre'], 'Estados Unidos de América');
});

test('editar un conflicto sincroniza su ficha extendida y conserva el rol histórico', async () => {
  const id = '6713f1a0c9d8e20015a4b201';
  const conflicto = new Conflicto({ _id: id, nombre_conflicto: 'Segunda Guerra Mundial', fecha_inicio: '1939-09-01', fecha_fin: '1945-09-02', teatro_operaciones: 'Global', armas_involucradas: [datosArma._id] });
  const arma = new Arma({ ...datosArma, eventos: [{ id_evento: id, nombre_conflicto: 'Nombre anterior', rol: 'Fusil de infantería', facciones_usuarias: ['Estados Unidos'] }] });
  mock.method(Conflicto, 'findById', async () => conflicto);
  mock.method(Conflicto.prototype, 'save', async function () { return this; });
  mock.method(Arma, 'countDocuments', async () => 1);
  mock.method(Arma, 'updateMany', async () => {});
  mock.method(Arma, 'find', async () => [arma]);
  mock.method(Arma.prototype, 'save', async function () { return this; });
  await catalogoController('conflictos').actualizar({ params: { id }, body: { teatro_operaciones: 'Europa y Pacífico' } }, { json: () => {} });
  assert.equal(arma.eventos[0].nombre_conflicto, 'Segunda Guerra Mundial');
  assert.equal(arma.eventos[0].teatro_operaciones, 'Europa y Pacífico');
  assert.equal(arma.eventos[0].rol, 'Fusil de infantería');
});

test('el reporte ejecuta una agregación con unión, filtros y mínimo posterior a la agrupación', async () => {
  let pipeline;
  const filas = [{ id_pais: '6713f1a0c9d8e20015a4b001', pais: 'Estados Unidos', total_armas: 2, anio_promedio: 1940, tipos: ['Rifle'], armas: [] }];
  mock.method(Arma, 'aggregate', async value => { pipeline = value; return filas; });
  const respuesta = await fetch(`${base}/api/reportes/armas-por-pais?anio_desde=1930&minimo=2&tipo=Rifle`);
  assert.equal(respuesta.status, 200);
  const body = await respuesta.json();
  assert.deepEqual(body.data, filas);
  assert.equal(body.cantidad, 1);
  assert.deepEqual(pipeline[0].$match, { activo_en_catalogo: true, anio_creacion: { $gte: 1930 }, tipo_arma: 'Rifle' });
  const union = pipeline.find(stage => stage.$lookup).$lookup;
  assert.equal(union.from, Pais.collection.name);
  assert.equal(union.localField, 'pais_origen.id_pais');
  assert.equal(union.foreignField, '_id');
  assert.equal(pipeline.find(stage => stage.$unwind).$unwind.preserveNullAndEmptyArrays, true);
  const grupo = pipeline.findIndex(stage => stage.$group);
  assert.deepEqual(pipeline[grupo].$group.total_armas, { $sum: 1 });
  assert.deepEqual(pipeline[grupo].$group.anio_promedio, { $avg: '$anio_creacion' });
  assert.deepEqual(pipeline[grupo + 1], { $match: { total_armas: { $gte: 2 } } });
});

test('el reporte rechaza parámetros inválidos y no acepta operadores del cliente', async () => {
  const aggregate = mock.method(Arma, 'aggregate', async () => []);
  for (const query of ['anio_desde=999', 'anio_desde=2101', 'anio_desde=1930.5', 'anio_desde=', 'anio_desde=abc', 'minimo=0', 'minimo=10001', 'minimo=-1', 'minimo=1&minimo=2', 'tipo=', 'tipo=Rifle&tipo=Pistola']) {
    const response = await fetch(`${base}/api/reportes/armas-por-pais?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).success, false);
  }
  assert.equal(aggregate.mock.callCount(), 0);
  const response = await fetch(`${base}/api/reportes/armas-por-pais?tipo=%7B%22%24ne%22%3Anull%7D`);
  assert.equal(response.status, 200);
  assert.equal(aggregate.mock.calls[0].arguments[0][0].$match.tipo_arma, '{"$ne":null}');
});

test('el reporte notifica errores de base de datos sin filtrar detalles internos', async () => {
  mock.method(Arma, 'aggregate', async () => { throw new Error('Detalle interno que no debe publicarse'); });
  const respuesta = await fetch(`${base}/api/reportes/armas-por-pais`);
  assert.equal(respuesta.status, 500);
  const body = await respuesta.json();
  assert.equal(body.success, false);
  assert.ok(!body.message.includes('Detalle interno'));
});
