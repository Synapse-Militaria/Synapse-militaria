const mongoose = require('mongoose');
const conectarDB = require('./config/database');
const neon = require('./neon');
const { Arma, Conflicto, Pais } = require('./models/armaModel');
const { crearHash, completarArma, copiarEvento } = require('./controllers/armaController');

const ROL_ADMIN_INICIAL = 'Administrador General';
const LARGO_MINIMO_CLAVE = 12;
const LARGO_MAXIMO_CLAVE = 128;

// Muestra solo la primera letra del correo y su dominio (por ejemplo, a***@dominio.cl).
function ocultarEmail(email) {
  const [usuario, dominio] = email.split('@');
  return `${usuario.slice(0, 1)}***@${dominio}`;
}

function problemasDeCuenta(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'ADMIN_EMAIL no tiene un formato de correo válido.';
  if (password.toLowerCase() === 'admin123') return 'ADMIN_PASSWORD no puede ser admin123.';
  if (password.length < LARGO_MINIMO_CLAVE || password.length > LARGO_MAXIMO_CLAVE) {
    return `ADMIN_PASSWORD debe tener entre ${LARGO_MINIMO_CLAVE} y ${LARGO_MAXIMO_CLAVE} caracteres.`;
  }
  const usuario = email.split('@')[0];
  if (password.toLowerCase().includes(usuario)) return 'ADMIN_PASSWORD no puede contener la parte del correo antes de la @.';
  return null;
}

// Crea la cuenta de Administrador General en PostgreSQL (Neon). Todos usan la misma
// base de Neon, así que nunca se crea una cuenta con contraseña por defecto.
async function crearAdministradorInicial() {
  const emailEnv = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!emailEnv || !emailEnv.trim() || !password) {
    console.warn('No se creó la cuenta de administrador: define ADMIN_EMAIL y ADMIN_PASSWORD (12 caracteres o más) en el .env o en las variables de entorno y vuelve a ejecutar el seed.');
    return { estado: 'omitida', motivo: 'faltan-variables' };
  }
  const email = emailEnv.trim().toLowerCase();
  const problema = problemasDeCuenta(email, password);
  if (problema) {
    console.warn(`No se creó la cuenta de administrador: ${problema}`);
    return { estado: 'omitida', motivo: 'datos-invalidos' };
  }
  if (!neon.pool) {
    console.warn('No se creó la cuenta de administrador: falta NEON_URI, la cuenta se guarda en PostgreSQL (Neon).');
    return { estado: 'omitida', motivo: 'sin-neon' };
  }

  let roles;
  try {
    roles = await neon.query('SELECT id FROM roles WHERE nombre = $1', [ROL_ADMIN_INICIAL]);
  } catch {
    throw new Error('No se pudo consultar PostgreSQL (Neon) para crear la cuenta de administrador. Revisa NEON_URI y la conexión.');
  }
  if (!roles.rows.length) {
    throw new Error(`No existe el rol '${ROL_ADMIN_INICIAL}' en la tabla roles. Primero hay que aplicar database/schema.sql en Neon.`);
  }

  const passwordHash = await crearHash(password);
  let resultado;
  try {
    resultado = await neon.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES ('Administrador', $1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, passwordHash, roles.rows[0].id]
    );
  } catch {
    throw new Error('No se pudo crear la cuenta de administrador en PostgreSQL (Neon). Revisa NEON_URI y la conexión.');
  }

  if (resultado.rows.length) {
    console.log(`Cuenta de administrador ${ocultarEmail(email)} creada en PostgreSQL con el rol ${ROL_ADMIN_INICIAL}.`);
    return { estado: 'creada' };
  }
  console.log(`La cuenta de administrador ${ocultarEmail(email)} ya existía en PostgreSQL; no se cambió su contraseña.`);
  return { estado: 'existente' };
}

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
  console.log(`Catálogo inicial actualizado: ${weapons.length} armas, ${countries.length} países y ${conflicts.length} conflictos. Se conservaron los datos existentes y se añadieron las nuevas relaciones.`);
  await crearAdministradorInicial();
}

if (require.main === module) {
  seed().catch(error => {
    console.error('No se pudo completar el seed:', error.message);
    process.exitCode = 1;
  }).finally(async () => {
    await mongoose.disconnect().catch(() => {});
    if (neon.pool) await neon.pool.end().catch(() => {});
  });
}

module.exports = { validarCatalogo, insertarSiNoExiste, sincronizarRelacionesIniciales, incorporarAmpliaciones, crearAdministradorInicial };
