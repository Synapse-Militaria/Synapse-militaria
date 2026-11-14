const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const neon = require('../neon');
const { firmarToken } = require('../config/jwt');
const { app } = require('../app');
const { Arma, Conflicto, Pais } = require('../models/armaModel');
const { catalogoController, crearHash, completarArma, ejecutarConTransaccion, armas, auth } = require('../controllers/armaController');
const { insertarSiNoExiste, sincronizarRelacionesIniciales, incorporarAmpliaciones } = require('../seed');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
const estadoConexion = mongoose.connection._readyState;
afterEach(() => {
  mock.restoreAll();
  mongoose.connection._readyState = estadoConexion;
});

function conexionTransaccional() {
  const session = { withTransaction: async accion => accion(), endSession: async () => {} };
  mongoose.connection._readyState = 1;
  mock.method(mongoose, 'startSession', async () => session);
  return session;
}

test('el seed incorpora armas nuevas a los conflictos usando las relaciones guardadas', async () => {
  const arma = '6713f1a0c9d8e20015a4b110';
  const conflicto = '6713f1a0c9d8e20015a4b205';
  const consultas = [];
  mock.method(Arma, 'find', filtro => {
    assert.deepEqual(filtro, { _id: { $in: [arma] } });
    return { select: () => ({ lean: async () => [{ _id: arma, eventos: [{ id_evento: conflicto }, { id_evento: conflicto }] }] }) };
  });
  mock.method(Conflicto, 'updateOne', async (filtro, cambio) => consultas.push({ filtro, cambio }));
  await sincronizarRelacionesIniciales([arma]);
  assert.deepEqual(consultas, [{ filtro: { _id: conflicto }, cambio: { $addToSet: { armas_involucradas: { $each: [arma] } } } }]);
});

test('la ampliación usa el conflicto guardado y respeta eliminaciones posteriores del administrador', async () => {
  const id = '6713f1a0c9d8e20015a4b108';
  const evento = { id_evento: '6713f1a0c9d8e20015a4b206', nombre_conflicto: 'Nombre inicial', rol: 'Infantería', facciones_usuarias: ['República'], nota_historica: 'Nota de la ampliación' };
  const conflicto = { _id: evento.id_evento, nombre_conflicto: 'Nombre revisado', fecha_inicio: new Date('1936-07-17'), fecha_fin: new Date('1939-04-01'), teatro_operaciones: 'Teatro revisado' };
  const referencia = { codigo_cita: 'REF-850', detalle_cita: 'Colección del museo' };
  const previo = { id_evento: '6713f1a0c9d8e20015a4b201', rol: 'Editado desde el panel' };
  const arma = { nombre: 'Nombre editado', eventos: [previo], referencias: [] };
  const migraciones = new Map();
  mock.method(mongoose.connection, 'collection', nombre => {
    assert.equal(nombre, 'Migraciones_Catalogo');
    return {
      findOne: async filtro => migraciones.get(filtro._id),
      updateOne: async (filtro, cambio) => migraciones.set(filtro._id, cambio.$setOnInsert),
    };
  });
  mock.method(Conflicto, 'findById', async () => conflicto);
  const actualizaciones = mock.method(Arma, 'updateOne', async (filtro, cambio) => {
    assert.equal(filtro._id, id);
    if (cambio.$push.eventos && !arma.eventos.some(item => item.id_evento === filtro['eventos.id_evento'].$ne)) arma.eventos.push(cambio.$push.eventos);
    if (cambio.$push.referencias && !arma.referencias.some(item => item.codigo_cita === filtro['referencias.codigo_cita'].$ne)) arma.referencias.push(cambio.$push.referencias);
  });
  const ampliacion = { [id]: { eventos: [evento], referencias: [referencia] } };
  await incorporarAmpliaciones(ampliacion);
  assert.equal(arma.nombre, 'Nombre editado');
  assert.equal(arma.eventos[0], previo);
  assert.deepEqual(arma.eventos[1], {
    id_evento: conflicto._id, nombre_conflicto: conflicto.nombre_conflicto,
    fecha_inicio: conflicto.fecha_inicio, fecha_fin: conflicto.fecha_fin, teatro_operaciones: conflicto.teatro_operaciones,
    rol: evento.rol, facciones_usuarias: evento.facciones_usuarias, nota_historica: evento.nota_historica,
  });
  assert.equal(arma.referencias.length, 1);
  assert.ok(migraciones.has(`ampliacion-2026-11-02-${id}`));
  arma.eventos = [previo];
  arma.referencias = [];
  await incorporarAmpliaciones(ampliacion);
  assert.deepEqual(arma.eventos, [previo]);
  assert.deepEqual(arma.referencias, []);
  assert.equal(actualizaciones.mock.callCount(), 2);
});

test('una ampliación interrumpida se reanuda sin duplicar eventos ni marcarse antes de terminar', async () => {
  const id = '6713f1a0c9d8e20015a4b108';
  const evento = { id_evento: '6713f1a0c9d8e20015a4b206', rol: 'Infantería' };
  const referencia = { codigo_cita: 'REF-850', detalle_cita: 'Colección del museo' };
  const arma = { eventos: [], referencias: [] };
  let completada = false;
  let interrumpir = true;
  mock.method(mongoose.connection, 'collection', () => ({
    findOne: async () => completada ? { completada_en: new Date() } : null,
    updateOne: async () => { completada = true; },
  }));
  mock.method(Conflicto, 'findById', async () => ({ _id: evento.id_evento, nombre_conflicto: 'Conflicto vigente' }));
  mock.method(Arma, 'updateOne', async (filtro, cambio) => {
    if (cambio.$push.eventos && !arma.eventos.some(item => item.id_evento === filtro['eventos.id_evento'].$ne)) arma.eventos.push(cambio.$push.eventos);
    if (cambio.$push.referencias) {
      if (interrumpir) { interrumpir = false; throw new Error('Interrupción simulada'); }
      if (!arma.referencias.some(item => item.codigo_cita === filtro['referencias.codigo_cita'].$ne)) arma.referencias.push(cambio.$push.referencias);
    }
  });
  const ampliacion = { [id]: { eventos: [evento], referencias: [referencia] } };
  await assert.rejects(incorporarAmpliaciones(ampliacion), /Interrupción simulada/);
  assert.equal(completada, false);
  assert.equal(arma.eventos.length, 1);
  await incorporarAmpliaciones(ampliacion);
  assert.equal(completada, true);
  assert.equal(arma.eventos.length, 1);
  assert.equal(arma.referencias.length, 1);
});

test('el seed prepara solo armas nuevas con los países y conflictos persistidos', async () => {
  const existente = { ...datosArma, nombre: 'Nombre editado por el administrador' };
  const nuevo = { ...datosArma, _id: '6713f1a0c9d8e20015a4b110',
    pais_origen: { id_pais: '6713f1a0c9d8e20015a4b004', nombre: 'Nombre inicial' },
    eventos: [{ id_evento: '6713f1a0c9d8e20015a4b201', nombre_conflicto: 'Nombre inicial', rol: 'Infantería', nota_historica: 'Nota conservada' }],
  };
  const pais = { _id: nuevo.pais_origen.id_pais, nombre: 'País revisado', tipo_faccion: 'Estado', codigo_iso: 'GB' };
  const conflicto = { _id: nuevo.eventos[0].id_evento, nombre_conflicto: 'Conflicto revisado', fecha_inicio: new Date('1939-09-01'), fecha_fin: new Date('1945-09-02'), teatro_operaciones: 'Teatro revisado' };
  const guardadas = new Map([[existente._id, existente]]);
  mock.method(Arma, 'exists', async filtro => guardadas.has(filtro._id));
  const paisConsultado = mock.method(Pais, 'findById', async () => pais);
  mock.method(Conflicto, 'findById', async () => conflicto);
  mock.method(Arma, 'updateOne', async (filtro, cambio) => {
    const id = String(filtro._id);
    if (!guardadas.has(id)) guardadas.set(id, cambio.$setOnInsert);
  });
  await insertarSiNoExiste(Arma, [datosArma, nuevo], completarArma);
  assert.equal(guardadas.get(existente._id), existente);
  const insertada = guardadas.get(nuevo._id);
  assert.equal(insertada.pais_origen.nombre, pais.nombre);
  assert.equal(insertada.pais_origen.codigo_iso, pais.codigo_iso);
  assert.equal(insertada.eventos[0].nombre_conflicto, conflicto.nombre_conflicto);
  assert.deepEqual(insertada.eventos[0].fecha_inicio, conflicto.fecha_inicio);
  assert.equal(insertada.eventos[0].teatro_operaciones, conflicto.teatro_operaciones);
  assert.equal(insertada.eventos[0].rol, nuevo.eventos[0].rol);
  assert.equal(insertada.eventos[0].nota_historica, nuevo.eventos[0].nota_historica);
  await insertarSiNoExiste(Arma, [datosArma, nuevo], completarArma);
  assert.equal(paisConsultado.mock.callCount(), 1);
  assert.equal(guardadas.get(nuevo._id), insertada);
});

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
  assert.equal(filtro.$or[0].nombre.test('['), true);
  assert.equal(filtro.$or[0].nombre.test('M1 Garand'), false);
});

test('la búsqueda cubre siete campos, ignora tildes y no interpreta operadores regex', async () => {
  let filtro;
  mock.method(Arma, 'find', value => { filtro = value; return { sort: async () => [] }; });
  assert.equal((await fetch(`${base}/api/armas/buscar?termino=CANON`)).status, 200);
  assert.deepEqual(filtro.$or.map(rama => Object.keys(rama)[0]), ['nombre', 'designacion_oficial', 'descripcion', 'etiquetas', 'especificaciones_tecnicas.calibre', 'pais_origen.nombre', 'eventos.nombre_conflicto']);
  for (const rama of filtro.$or) assert.ok(Object.values(rama)[0].test('Cañón histórico'));
  await fetch(`${base}/api/armas/buscar?termino=${encodeURIComponent('7,62 (M1).+')}`);
  const regex = filtro.$or[0].nombre;
  assert.ok(regex.test('7,62 (M1).+'));
  assert.ok(!regex.test('7,62 M1xxx'));
});

test('los catálogos individuales devuelven el documento o un error 404', async () => {
  for (const [tipo, Modelo] of [['paises', Pais], ['conflictos', Conflicto]]) {
    const registro = { _id: datosArma._id, nombre: 'Registro de prueba' };
    mock.method(Modelo, 'findById', async () => registro);
    let respuesta;
    await catalogoController(tipo).obtener({ params: { id: registro._id } }, { json: data => { respuesta = data; } });
    assert.deepEqual(respuesta, { success: true, data: registro });
    mock.method(Modelo, 'findById', async () => null);
    await assert.rejects(catalogoController(tipo).obtener({ params: { id: registro._id } }, { json: () => {} }), error => error.status === 404);
  }
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
  const admin = { id: 7, email: 'admin@example.cl', password_hash, rol: 'Administrador General', cuenta_activa: true };
  let ultimoAccesoActualizado = 0;
  mock.method(neon, 'query', async (sql, params) => {
    if (sql.includes('WHERE u.email = $1')) {
      return { rows: params[0] === admin.email && admin.cuenta_activa ? [{ id: admin.id, email: admin.email, password_hash: admin.password_hash, rol: admin.rol }] : [] };
    }
    if (sql.includes('UPDATE usuarios SET ultimo_acceso')) {
      assert.deepEqual(params, [admin.id]);
      ultimoAccesoActualizado += 1;
      return { rowCount: 1 };
    }
    if (sql.includes('WHERE u.id = $1')) {
      return { rows: params[0] === admin.id && admin.cuenta_activa ? [{ id: admin.id, email: admin.email, rol: admin.rol }] : [] };
    }
    throw new Error(`Consulta no esperada: ${sql}`);
  });
  const iniciar = (email, password) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const claveIncorrecta = await iniciar(admin.email, 'incorrecta');
  assert.equal(claveIncorrecta.status, 401);
  const correoInexistente = await iniciar('inexistente@example.cl', 'clave-de-prueba');
  assert.equal(correoInexistente.status, 401);
  assert.equal((await claveIncorrecta.json()).message, (await correoInexistente.json()).message);
  assert.equal(ultimoAccesoActualizado, 0);
  const sesion = (await (await iniciar(`  ${admin.email.toUpperCase()} `, 'clave-de-prueba')).json()).data;
  assert.equal(ultimoAccesoActualizado, 1);
  assert.ok(sesion.token);
  assert.equal(sesion.email, admin.email);
  assert.ok(Number.isFinite(sesion.expiresAt));
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
  const cierre = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(cierre.status, 200);
  assert.deepEqual(await cierre.json(), { success: true, data: null });
});

test('editar un país actualiza las copias extendidas en las armas', async () => {
  const session = conexionTransaccional();
  const pais = new Pais({ _id: '6713f1a0c9d8e20015a4b001', nombre: 'Estados Unidos', codigo_iso: 'US' });
  mock.method(Pais, 'findById', async (_id, _projection, opts) => { assert.equal(opts.session, session); return pais; });
  mock.method(Pais.prototype, 'save', async function (opts) { assert.equal(opts.session, session); return this; });
  let actualizacion;
  mock.method(Arma, 'updateMany', async (filtro, cambios, opts) => { assert.equal(opts.session, session); actualizacion = { filtro, cambios }; });
  await catalogoController('paises').actualizar({ params: { id: String(pais._id) }, body: { nombre: 'Estados Unidos de América' } }, { json: () => {} });
  assert.equal(String(actualizacion.filtro['pais_origen.id_pais']), String(pais._id));
  assert.equal(actualizacion.cambios.$set['pais_origen.nombre'], 'Estados Unidos de América');
});

test('editar un conflicto sincroniza su ficha extendida y conserva el rol histórico', async () => {
  const session = conexionTransaccional();
  const id = '6713f1a0c9d8e20015a4b201';
  const conflicto = new Conflicto({ _id: id, nombre_conflicto: 'Segunda Guerra Mundial', fecha_inicio: '1939-09-01', fecha_fin: '1945-09-02', teatro_operaciones: 'Global', armas_involucradas: [datosArma._id] });
  const arma = new Arma({ ...datosArma, eventos: [{ id_evento: id, nombre_conflicto: 'Nombre anterior', rol: 'Fusil de infantería', facciones_usuarias: ['Estados Unidos'] }] });
  mock.method(Conflicto, 'findById', async (_id, _projection, opts) => { assert.equal(opts.session, session); return conflicto; });
  mock.method(Conflicto.prototype, 'save', async function (opts) { assert.equal(opts.session, session); return this; });
  mock.method(Arma, 'countDocuments', async (_filter, opts) => { assert.equal(opts.session, session); return 1; });
  mock.method(Arma, 'updateMany', async (_filter, _update, opts) => { assert.equal(opts.session, session); });
  mock.method(Arma, 'find', async (_filter, _projection, opts) => { assert.equal(opts.session, session); return [arma]; });
  const guardarIndividual = mock.method(Arma.prototype, 'save', async function () { return this; });
  const lotes = mock.method(Arma, 'bulkWrite', async (_operations, opts) => { assert.equal(opts.session, session); return {}; });
  await catalogoController('conflictos').actualizar({ params: { id }, body: { teatro_operaciones: 'Europa y Pacífico' } }, { json: () => {} });
  assert.equal(arma.eventos[0].nombre_conflicto, 'Segunda Guerra Mundial');
  assert.equal(arma.eventos[0].teatro_operaciones, 'Europa y Pacífico');
  assert.equal(arma.eventos[0].rol, 'Fusil de infantería');
  assert.equal(guardarIndividual.mock.callCount(), 0);
  assert.equal(lotes.mock.callCount(), 1);
  assert.equal(lotes.mock.calls[0].arguments[0].length, 1);
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

test('un fallo al sincronizar aborta la transacción y no vuelve a guardar sin sesión', async () => {
  const session = conexionTransaccional();
  let guardadas = [];
  let abortada = false;
  let finalizada = false;
  session.withTransaction = async accion => {
    const anterior = [...guardadas];
    try { return await accion(); }
    catch (error) { guardadas = anterior; abortada = true; throw error; }
  };
  session.endSession = async () => { finalizada = true; };
  mock.method(Pais, 'findById', async (_id, _projection, opts) => {
    assert.equal(opts.session, session);
    return { _id: '6713f1a0c9d8e20015a4b001', nombre: 'Estados Unidos' };
  });
  mock.method(Conflicto, 'findById', async (id, _projection, opts) => {
    assert.equal(opts.session, session);
    return { _id: id, nombre_conflicto: 'Conflicto revisado' };
  });
  const guardar = mock.method(Arma.prototype, 'save', async function (opts) {
    assert.equal(opts.session, session);
    guardadas.push(this);
    return this;
  });
  mock.method(Conflicto, 'updateMany', async (_filter, _update, opts) => {
    assert.equal(opts.session, session);
    throw new Error('Fallo simulado al sincronizar');
  });
  let respuestaEnviada = false;
  await assert.rejects(armas.createArma({ body: {
    ...datosArma, pais_origen: { id_pais: '6713f1a0c9d8e20015a4b001' },
    eventos: [{ id_evento: '6713f1a0c9d8e20015a4b201' }],
  } }, { status: () => { respuestaEnviada = true; } }), /Fallo simulado/);
  assert.equal(abortada, true);
  assert.equal(finalizada, true);
  assert.equal(guardar.mock.callCount(), 1);
  assert.equal(guardadas.length, 0);
  assert.equal(respuestaEnviada, false);
});

test('solo las pruebas permiten fallback cuando el primer acceso detecta MongoDB standalone', async () => {
  const session = conexionTransaccional();
  const llamadas = [];
  const resultado = await ejecutarConTransaccion(async actual => {
    llamadas.push(actual);
    if (actual) throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 });
    return 'Compatible con prueba standalone';
  });
  assert.equal(resultado, 'Compatible con prueba standalone');
  assert.deepEqual(llamadas, [session, null]);
});

test('el servidor real no degrada a escrituras sin transacción', async () => {
  conexionTransaccional();
  const previo = { NODE_ENV: process.env.NODE_ENV, NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT };
  process.env.NODE_ENV = 'production';
  delete process.env.NODE_TEST_CONTEXT;
  let llamadas = 0;
  try {
    await assert.rejects(ejecutarConTransaccion(async () => {
      llamadas++;
      throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
    }), /Transaction numbers/);
    assert.equal(llamadas, 1);
  } finally {
    for (const [nombre, valor] of Object.entries(previo)) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  }
});

test('login y autenticar usan Postgres y JWT, actualizan ultimo_acceso y logout no consulta bases', async () => {
  const password_hash = await crearHash('clave-persistente');
  const usuario = { id: 15, email: 'persistente@example.cl', password_hash, rol: 'Administrador' };
  const consultas = [];
  mock.method(neon, 'query', async (sql, params) => {
    consultas.push({ sql, params });
    if (sql.includes('WHERE u.email = $1')) return { rows: [usuario] };
    if (sql.includes('UPDATE usuarios SET ultimo_acceso')) return { rowCount: 1 };
    if (sql.includes('WHERE u.id = $1')) return { rows: [{ id: usuario.id, email: usuario.email, rol: 'Administrador General' }] };
    throw new Error(`Consulta no esperada: ${sql}`);
  });
  let respuesta;
  await auth.login({ body: { email: usuario.email, password: 'clave-persistente' } }, { json: data => { respuesta = data; } });
  assert.equal(consultas.length, 2);
  assert.match(consultas[1].sql, /UPDATE usuarios SET ultimo_acceso = now\(\) WHERE id = \$1/);
  assert.deepEqual(consultas[1].params, [usuario.id]);
  const req = { headers: { authorization: `Bearer ${respuesta.data.token}` } };
  let error;
  await auth.autenticar(req, {}, value => { error = value; });
  assert.equal(error, undefined);
  assert.deepEqual(req.admin, { id: usuario.id, email: usuario.email, rol: 'Administrador General' });
  const antesLogout = consultas.length;
  await auth.logout(req, { json: data => { respuesta = data; } });
  assert.equal(consultas.length, antesLogout);
  assert.deepEqual(respuesta, { success: true, data: null });
});

test('token vencido o con otra clave, cuenta desactivada, rol sin permiso y caída de Postgres responden 401, 403 y 503', async () => {
  const previo = process.env.JWT_SECRET;
  const clave = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET = clave;
  try {
    let estadoCuenta = { id: 21, email: 'admin@example.cl', rol: 'Administrador', activa: true, disponible: true };
    const consulta = mock.method(neon, 'query', async () => {
      if (!estadoCuenta.disponible) throw new Error('connect ECONNREFUSED host-interno:5432');
      if (!estadoCuenta.activa) return { rows: [] };
      return { rows: [{ id: estadoCuenta.id, email: estadoCuenta.email, rol: estadoCuenta.rol }] };
    });
    const ahora = Math.floor(Date.now() / 1000);
    const vencido = jwt.sign({ email: estadoCuenta.email, rol: 'Administrador', iat: ahora - 3600, exp: ahora - 60 }, clave, { algorithm: 'HS256', subject: '21' });
    const otraClave = jwt.sign({ email: estadoCuenta.email, rol: 'Administrador' }, crypto.randomBytes(48).toString('hex'), { algorithm: 'HS256', subject: '21', expiresIn: 1800 });

    for (const tokenInvalido of [vencido, otraClave, 'no-es-jwt']) {
      let error;
      await auth.autenticar({ headers: { authorization: `Bearer ${tokenInvalido}` } }, {}, value => { error = value; });
      assert.equal(error.status, 401);
    }
    assert.equal(consulta.mock.callCount(), 0);

    const { token } = firmarToken({ id: estadoCuenta.id, email: estadoCuenta.email, rol: 'Administrador' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    estadoCuenta.activa = false;
    assert.equal((await fetch(`${base}/api/armas`, { method: 'POST', headers, body: JSON.stringify(datosArma) })).status, 401);

    estadoCuenta.activa = true;
    estadoCuenta.rol = 'Usuario';
    const prohibido = await fetch(`${base}/api/armas`, { method: 'POST', headers, body: JSON.stringify(datosArma) });
    assert.equal(prohibido.status, 403);
    assert.equal((await prohibido.json()).message, 'No tienes permiso para esta acción.');

    estadoCuenta.disponible = false;
    const sinConexionAuth = await fetch(`${base}/api/armas`, { method: 'POST', headers, body: JSON.stringify(datosArma) });
    assert.equal(sinConexionAuth.status, 503);
    assert.ok(!(await sinConexionAuth.text()).includes('host-interno'));

    const sinConexionLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.cl', password: 'clave' }) });
    assert.equal(sinConexionLogin.status, 503);
    assert.ok(!(await sinConexionLogin.text()).includes('host-interno'));
  } finally {
    if (previo === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previo;
  }
});

test('multimedia acepta el MIME estándar y los valores históricos del seed', async () => {
  for (const tipo_archivo of ['image/jpeg', 'imagen/jpeg', 'imagen']) {
    const arma = new Arma({ ...datosArma, multimedia: [{ ...datosArma.multimedia[0], tipo_archivo }] });
    await arma.validate();
    assert.equal(arma.multimedia[0].tipo_archivo, tipo_archivo);
  }
});
