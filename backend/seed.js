const mongoose = require('mongoose');
const conectarDB = require('./config/database');
const { Arma, Conflicto, Pais, Administrador } = require('./models/armaModel');
const { crearHash, completarArma, copiarEvento } = require('./controllers/armaController');

async function insertarSiNoExiste(Modelo, datos, preparar) {
  for (const dato of datos) {
    if (preparar && await Modelo.exists({ _id: dato._id })) continue;
    // El modelo descarta los alias visuales; el seed conserva los registros previos.
    const documento = new Modelo(dato);
    if (preparar) await preparar(documento);
    await documento.validate();
    await Modelo.updateOne({ _id: documento._id }, { $setOnInsert: documento.toObject() }, { upsert: true });
  }
}

async function sincronizarRelacionesIniciales(idsArmas) {
  // Usa las fichas guardadas para respetar las relaciones editadas desde el panel.
  const armas = await Arma.find({ _id: { $in: idsArmas } }).select('_id eventos.id_evento').lean();
  const porConflicto = new Map();
  for (const arma of armas) {
    for (const evento of arma.eventos) {
      const id = String(evento.id_evento);
      if (!porConflicto.has(id)) porConflicto.set(id, new Set());
      porConflicto.get(id).add(String(arma._id));
    }
  }
  for (const [id, armas] of porConflicto) {
    await Conflicto.updateOne({ _id: id }, { $addToSet: { armas_involucradas: { $each: [...armas] } } });
  }
}

async function incorporarAmpliaciones(enriquecimientos = {}) {
  if (!Object.keys(enriquecimientos).length) return;
  const migraciones = mongoose.connection.collection('Migraciones_Catalogo');
  for (const [id, cambios] of Object.entries(enriquecimientos)) {
    const migracion = `ampliacion-2026-11-02-${id}`;
    if (await migraciones.findOne({ _id: migracion })) continue;
    for (const evento of cambios.eventos || []) {
      const conflicto = await Conflicto.findById(evento.id_evento);
      if (!conflicto) throw new Error('No existe uno de los conflictos de la ampliación del catálogo.');
      await Arma.updateOne({ _id: id, 'eventos.id_evento': { $ne: evento.id_evento } }, { $push: { eventos: copiarEvento(conflicto, evento) } });
    }
    for (const referencia of cambios.referencias || []) {
      await Arma.updateOne({ _id: id, 'referencias.codigo_cita': { $ne: referencia.codigo_cita } }, { $push: { referencias: referencia } });
    }
    // Los filtros anteriores permiten reanudar una carga interrumpida sin duplicados.
    // Tras completarla, el seed respeta las eliminaciones hechas desde el panel.
    await migraciones.updateOne({ _id: migracion }, { $setOnInsert: { completada_en: new Date() } }, { upsert: true });
  }
}

async function validarCatalogo({ weapons, countries, conflicts }) {
  for (const [Modelo, datos] of [[Pais, countries], [Conflicto, conflicts], [Arma, weapons]]) {
    const ids = datos.map(dato => String(dato._id));
    if (new Set(ids).size !== ids.length) throw new Error(`Hay identificadores repetidos en ${Modelo.collection.name}.`);
    for (const dato of datos) await new Modelo(dato).validate();
  }
  for (const arma of weapons) {
    if (!countries.some(pais => pais._id === arma.pais_origen.id_pais)) throw new Error(`País inexistente en ${arma.nombre}.`);
    for (const evento of arma.eventos) {
      const conflicto = conflicts.find(item => item._id === evento.id_evento);
      if (!conflicto || !conflicto.armas_involucradas.includes(arma._id)) throw new Error(`Relación incompleta de conflictos en ${arma.nombre}.`);
    }
  }
  for (const conflicto of conflicts) {
    for (const id of conflicto.armas_involucradas) {
      const arma = weapons.find(item => item._id === id);
      if (!arma || !arma.eventos.some(evento => evento.id_evento === conflicto._id)) throw new Error(`Relación incompleta de armas en ${conflicto.nombre_conflicto}.`);
    }
  }
}

async function seed() {
  const datos = await import('../frontend/src/data/mockData.js');
  await validarCatalogo(datos);
  const { weapons, countries, conflicts, weaponEnrichments } = datos;
  if (process.argv.includes('--check')) {
    console.log(`Catálogo validado sin conexión a MongoDB: ${weapons.length} armas, ${countries.length} países y ${conflicts.length} conflictos.`);
    return;
  }
  await conectarDB();
  await insertarSiNoExiste(Pais, countries);
  // Las relaciones se completan después con los eventos de las fichas persistidas.
  await insertarSiNoExiste(Conflicto, conflicts.map(conflicto => ({ ...conflicto, armas_involucradas: [] })));
  await insertarSiNoExiste(Arma, weapons, completarArma);
  await incorporarAmpliaciones(weaponEnrichments);
  await sincronizarRelacionesIniciales(weapons.map(arma => arma._id));
  const email = (process.env.ADMIN_EMAIL || 'admin@synapse-militaria.cl').trim().toLowerCase();
  if (!await Administrador.exists({ email })) {
    await Administrador.create({ email, password_hash: await crearHash(process.env.ADMIN_PASSWORD || 'admin123'), rol: 'Administrador General' });
  }
  console.log(`Catálogo inicial actualizado: ${weapons.length} armas, ${countries.length} países y ${conflicts.length} conflictos. Se conservaron los datos existentes y se añadieron las nuevas relaciones.`);
}

if (require.main === module) {
  seed().catch(error => {
    console.error('No se pudo completar el seed:', error.message);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { validarCatalogo, insertarSiNoExiste, sincronizarRelacionesIniciales, incorporarAmpliaciones };
