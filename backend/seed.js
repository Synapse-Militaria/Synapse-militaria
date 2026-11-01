const mongoose = require('mongoose');
const conectarDB = require('./config/database');
const { Arma, Conflicto, Pais, Administrador } = require('./models/armaModel');
const { crearHash } = require('./controllers/armaController');

async function insertarSiNoExiste(Modelo, datos) {
  for (const dato of datos) {
    // El modelo descarta los alias visuales; el seed conserva los registros previos.
    const documento = new Modelo(dato);
    await documento.validate();
    await Modelo.updateOne({ _id: documento._id }, { $setOnInsert: documento.toObject() }, { upsert: true });
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
  const { weapons, countries, conflicts } = datos;
  if (process.argv.includes('--check')) {
    console.log(`Catálogo validado sin conexión a MongoDB: ${weapons.length} armas, ${countries.length} países y ${conflicts.length} conflictos.`);
    return;
  }
  await conectarDB();
  await insertarSiNoExiste(Pais, countries);
  await insertarSiNoExiste(Conflicto, conflicts);
  await insertarSiNoExiste(Arma, weapons);
  const email = (process.env.ADMIN_EMAIL || 'admin@synapse-militaria.cl').trim().toLowerCase();
  if (!await Administrador.exists({ email })) {
    await Administrador.create({ email, password_hash: await crearHash(process.env.ADMIN_PASSWORD || 'admin123'), rol: 'Administrador General' });
  }
  console.log('Datos iniciales agregados. Los documentos que ya existían no fueron reemplazados.');
}

if (require.main === module) {
  seed().catch(error => {
    console.error('No se pudo completar el seed:', error.message);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { validarCatalogo };
