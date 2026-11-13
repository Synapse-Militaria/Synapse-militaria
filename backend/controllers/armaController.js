const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const { Arma, Pais, Conflicto, Administrador, Sesion } = require('../models/armaModel');

function errorHTTP(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function responderError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const validacion = ['ValidationError', 'CastError', 'StrictModeError'].includes(error.name);
  const status = error.status || (validacion || error.type === 'entity.parse.failed' ? 400 : error.code === 11000 ? 409 : 500);
  // En producción, los errores 500 nunca exponen detalles internos ni stack traces.
  const enProduccion = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  const message = status === 500
    ? (enProduccion ? 'Error interno del servidor.' : 'No se pudo completar la operación. Revisa la conexión con MongoDB.')
    : error.code === 11000 ? 'Ya existe un registro con estos datos.' : error.message;
  res.status(status).json({ success: false, message });
}

const entornoPruebas = () => process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
const opcionesSesion = session => session ? { session } : {};

async function ejecutarConTransaccion(accion) {
  if (mongoose.connection.readyState !== 1) {
    if (entornoPruebas()) return accion(null);
    throw errorHTTP(503, 'No hay conexión con MongoDB para guardar los cambios.');
  }
  let session;
  try {
    session = await mongoose.startSession();
    let resultado;
    await session.withTransaction(async () => {
      resultado = await accion(session);
    });
    return resultado;
  } catch (error) {
    const sinSoporte = /Transaction numbers are only allowed on a replica set member or mongos|Transactions are not supported by this deployment|Current topology does not support sessions/i.test(error.message || '');
    // Un standalone rechaza la operación transaccional. Solo las pruebas pueden reintentar sin sesión.
    if (entornoPruebas() && sinSoporte) return accion(null);
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

function copiarEvento(conflicto, anterior = {}) {
  return {
    id_evento: conflicto._id,
    nombre_conflicto: conflicto.nombre_conflicto,
    fecha_inicio: conflicto.fecha_inicio,
    fecha_fin: conflicto.fecha_fin,
    teatro_operaciones: conflicto.teatro_operaciones,
    rol: anterior.rol || '',
    facciones_usuarias: anterior.facciones_usuarias || [],
    nota_historica: anterior.nota_historica || '',
  };
}

// Las referencias extendidas copian los datos visibles del registro original.
async function completarArma(arma, session = null) {
  if (arma.pais_origen?.id_pais) {
    const pais = await Pais.findById(arma.pais_origen.id_pais, null, opcionesSesion(session));
    if (!pais) throw errorHTTP(400, 'El país seleccionado ya no existe.');
    arma.pais_origen = { id_pais: pais._id, nombre: pais.nombre, tipo_faccion: pais.tipo_faccion, codigo_iso: pais.codigo_iso };
  }
  const eventos = [];
  for (const evento of arma.eventos) {
    if (!evento.id_evento) throw errorHTTP(400, 'Cada evento debe tener un conflicto asociado.');
    const conflicto = await Conflicto.findById(evento.id_evento, null, opcionesSesion(session));
    if (!conflicto) throw errorHTTP(400, 'Uno de los conflictos seleccionados ya no existe.');
    if (!eventos.some(item => String(item.id_evento) === String(conflicto._id))) eventos.push(copiarEvento(conflicto, evento));
  }
  arma.eventos = eventos;
}

async function sincronizarArma(arma, session = null) {
  const ids = arma.eventos.map(evento => evento.id_evento);
  await Conflicto.updateMany({ _id: { $nin: ids }, armas_involucradas: arma._id }, { $pull: { armas_involucradas: arma._id } }, opcionesSesion(session));
  if (ids.length) await Conflicto.updateMany({ _id: { $in: ids } }, { $addToSet: { armas_involucradas: arma._id } }, opcionesSesion(session));
}

async function validarArmas(conflicto, session = null) {
  const ids = [...new Set(conflicto.armas_involucradas.map(String))];
  if (ids.length && await Arma.countDocuments({ _id: { $in: ids } }, opcionesSesion(session)) !== ids.length) {
    throw errorHTTP(400, 'Una de las armas seleccionadas ya no existe.');
  }
  conflicto.armas_involucradas = ids;
}

async function sincronizarConflicto(conflicto, session = null) {
  const ids = conflicto.armas_involucradas;
  const opts = opcionesSesion(session);
  await Arma.updateMany({ _id: { $nin: ids }, 'eventos.id_evento': conflicto._id }, { $pull: { eventos: { id_evento: conflicto._id } } }, opts);
  const armas = await Arma.find({ _id: { $in: ids } }, null, opts);
  const operaciones = [];
  for (const arma of armas) {
    const anterior = arma.eventos.find(evento => String(evento.id_evento) === String(conflicto._id));
    arma.eventos = arma.eventos.filter(evento => String(evento.id_evento) !== String(conflicto._id));
    arma.eventos.push(copiarEvento(conflicto, anterior));
    await arma.validate();
    operaciones.push({ updateOne: { filter: { _id: arma._id }, update: { $set: { eventos: arma.eventos.toObject() } } } });
  }
  if (operaciones.length) await Arma.bulkWrite(operaciones, opts);
}

const scryptAsync = promisify(scrypt);
const sesiones = new Map();
const DURACION_SESION = 30 * 60 * 1000;
const hashToken = token => createHash('sha256').update(token).digest('hex');

function limpiarSesiones() {
  for (const [token, sesion] of sesiones) if (sesion.expiresAt <= Date.now()) sesiones.delete(token);
}

function almacenamientoSesiones() {
  if (mongoose.connection.readyState === 1) return 'mongo';
  if (entornoPruebas()) return 'memoria';
  throw errorHTTP(503, 'No hay conexión con MongoDB para comprobar la sesión.');
}

async function crearHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verificarPassword(password, hash) {
  const [algoritmo, salt, key] = String(hash || '').split(':');
  if (algoritmo !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(key || '')) return false;
  const actual = await scryptAsync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}

async function autenticar(req, res, next) {
  limpiarSesiones();
  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.match(/^Bearer ([a-f0-9]{64})$/i)?.[1] : null;
  if (!token) return next(errorHTTP(401, 'La sesión venció. Inicia sesión nuevamente.'));
  const token_hash = hashToken(token);
  const enMongo = almacenamientoSesiones() === 'mongo';
  const sesion = enMongo
    ? await Sesion.findOne({ token_hash, expiresAt: { $gt: new Date() } })
    : sesiones.get(token_hash);
  if (!sesion || Number(sesion.expiresAt) <= Date.now() || (enMongo && !await Administrador.exists({ _id: sesion.id_admin, cuenta_activa: true }))) {
    if (!enMongo) sesiones.delete(token_hash);
    return next(errorHTTP(401, 'La sesión venció. Inicia sesión nuevamente.'));
  }
  req.admin = sesion;
  req.token = token;
  next();
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 200) {
    throw errorHTTP(400, 'Ingresa un correo y una contraseña válidos.');
  }
  const almacenamiento = almacenamientoSesiones();
  const admin = await Administrador.findOne({ email: email.trim().toLowerCase(), cuenta_activa: true }).select('+password_hash');
  if (!admin || !await verificarPassword(password, admin.password_hash)) throw errorHTTP(401, 'Credenciales inválidas. Acceso denegado.');
  limpiarSesiones();
  const token = randomBytes(32).toString('hex');
  const data = { token, email: admin.email, expiresAt: Date.now() + DURACION_SESION };
  admin.ultimo_acceso = new Date();
  await admin.save();
  if (almacenamiento === 'mongo') {
    await Sesion.create({ token_hash: hashToken(token), id_admin: admin._id, email: admin.email, expiresAt: new Date(data.expiresAt) });
  } else sesiones.set(hashToken(token), { email: admin.email, expiresAt: data.expiresAt });
  res.json({ success: true, data });
}

async function logout(req, res) {
  limpiarSesiones();
  const token_hash = hashToken(req.token);
  if (almacenamientoSesiones() === 'mongo') await Sesion.deleteOne({ token_hash });
  else sesiones.delete(token_hash);
  res.json({ success: true, data: null });
}

function recuperar(req, res) {
  const email = req.body?.email;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw errorHTTP(400, 'Ingresa un correo electrónico válido.');
  res.json({ success: true, data: { simulado: true, message: 'Solicitud registrada como simulación académica. Este proyecto todavía no envía correos ni cambia contraseñas.' } });
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ArmaController = {
  getArmas: async (req, res) => {
    const armas = await Arma.find().sort({ nombre: 1 });
    res.json({ success: true, cantidad: armas.length, data: armas });
  },

  getArma: async (req, res) => {
    const arma = await Arma.findById(req.params.id);
    if (!arma) throw errorHTTP(404, 'Arma no encontrada.');
    res.json({ success: true, data: arma });
  },

  getConflictos: async (req, res) => {
    const arma = await Arma.findById(req.params.id);
    if (!arma) throw errorHTTP(404, 'Arma no encontrada.');
    res.json({ success: true, data: arma.eventos });
  },

  buscarArmas: async (req, res) => {
    const termino = typeof req.query.termino === 'string' ? req.query.termino.trim() : '';
    if (!termino || termino.length > 150) throw errorHTTP(400, 'Ingresa un término de búsqueda de 1 a 150 caracteres.');
    const vocales = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' };
    const terminoPlano = termino.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const patron = escaparRegex(terminoPlano).replace(/[aeioun]/g, letra => vocales[letra]);
    const regex = new RegExp(patron, 'i');
    const campos = ['nombre', 'designacion_oficial', 'descripcion', 'etiquetas', 'especificaciones_tecnicas.calibre', 'pais_origen.nombre', 'eventos.nombre_conflicto'];
    const armas = await Arma.find({ $or: campos.map(campo => ({ [campo]: regex })) }).sort({ nombre: 1 });
    res.json({ success: true, cantidad: armas.length, data: armas });
  },

  createArma: async (req, res) => {
    const arma = await ejecutarConTransaccion(async session => {
      const nueva = new Arma(req.body);
      await nueva.validate();
      await completarArma(nueva, session);
      await nueva.save(opcionesSesion(session));
      await sincronizarArma(nueva, session);
      return nueva;
    });
    res.status(201).json({ success: true, data: arma });
  },

  updateArma: async (req, res) => {
    const arma = await ejecutarConTransaccion(async session => {
      const existente = await Arma.findById(req.params.id, null, opcionesSesion(session));
      if (!existente) throw errorHTTP(404, 'Arma no encontrada.');
      const { _id, ...cambios } = req.body || {};
      existente.set(cambios);
      await existente.validate();
      await completarArma(existente, session);
      await existente.save(opcionesSesion(session));
      await sincronizarArma(existente, session);
      return existente;
    });
    res.json({ success: true, data: arma });
  },

  deleteArma: async (req, res) => {
    const arma = await ejecutarConTransaccion(async session => {
      const eliminada = await Arma.findByIdAndDelete(req.params.id, opcionesSesion(session));
      if (!eliminada) throw errorHTTP(404, 'Arma no encontrada.');
      await Conflicto.updateMany({ armas_involucradas: eliminada._id }, { $pull: { armas_involucradas: eliminada._id } }, opcionesSesion(session));
      return eliminada;
    });
    res.json({ success: true, data: { _id: arma._id } });
  },
};

// Los dos catálogos comparten las mismas operaciones básicas.
function catalogoController(tipo) {
  const esPais = tipo === 'paises';
  const Modelo = esPais ? Pais : Conflicto;
  const nombre = esPais ? 'País o facción' : 'Conflicto';

  async function despuesDeGuardar(registro, session) {
    if (esPais) {
      await Arma.updateMany({ 'pais_origen.id_pais': registro._id }, { $set: {
        'pais_origen.nombre': registro.nombre,
        'pais_origen.tipo_faccion': registro.tipo_faccion,
        'pais_origen.codigo_iso': registro.codigo_iso,
      } }, opcionesSesion(session));
    } else await sincronizarConflicto(registro, session);
  }

  return {
    listar: async (req, res) => {
      const data = await Modelo.find().sort(esPais ? { nombre: 1 } : { fecha_inicio: 1 });
      res.json({ success: true, cantidad: data.length, data });
    },
    obtener: async (req, res) => {
      const registro = await Modelo.findById(req.params.id);
      if (!registro) throw errorHTTP(404, `${nombre} no encontrado.`);
      res.json({ success: true, data: registro });
    },
    crear: async (req, res) => {
      const registro = await ejecutarConTransaccion(async session => {
        const nuevo = new Modelo(req.body);
        await nuevo.validate();
        if (!esPais) await validarArmas(nuevo, session);
        await nuevo.save(opcionesSesion(session));
        await despuesDeGuardar(nuevo, session);
        return nuevo;
      });
      res.status(201).json({ success: true, data: registro });
    },
    actualizar: async (req, res) => {
      const registro = await ejecutarConTransaccion(async session => {
        const existente = await Modelo.findById(req.params.id, null, opcionesSesion(session));
        if (!existente) throw errorHTTP(404, `${nombre} no encontrado.`);
        const { _id, ...cambios } = req.body || {};
        existente.set(cambios);
        await existente.validate();
        if (!esPais) await validarArmas(existente, session);
        await existente.save(opcionesSesion(session));
        await despuesDeGuardar(existente, session);
        return existente;
      });
      res.json({ success: true, data: registro });
    },
    eliminar: async (req, res) => {
      const registro = await ejecutarConTransaccion(async session => {
        const existente = await Modelo.findById(req.params.id, null, opcionesSesion(session));
        if (!existente) throw errorHTTP(404, `${nombre} no encontrado.`);
        const filtro = esPais ? { 'pais_origen.id_pais': existente._id } : { 'eventos.id_evento': existente._id };
        if (await Arma.exists(filtro, opcionesSesion(session))) throw errorHTTP(409, `${nombre} asociado a armamentos. Edita esas fichas antes de eliminarlo.`);
        await existente.deleteOne(opcionesSesion(session));
        return existente;
      });
      res.json({ success: true, data: { _id: registro._id } });
    },
  };
}

// LEFT JOIN, WHERE, GROUP BY y HAVING de la propuesta relacional.
// Los parámetros se convierten a escalares: nunca se aceptan filtros MongoDB del cliente.
function enteroConsulta(valor, nombre, minimo, maximo, defecto) {
  if (valor === undefined) return defecto;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) throw errorHTTP(400, `${nombre} debe ser un número entero entre ${minimo} y ${maximo}.`);
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) throw errorHTTP(400, `${nombre} debe estar entre ${minimo} y ${maximo}.`);
  return numero;
}

const reportes = {
  armasPorPais: async (req, res) => {
    const anioDesde = enteroConsulta(req.query.anio_desde, 'anio_desde', 1000, 2100, 1000);
    const minimo = enteroConsulta(req.query.minimo, 'minimo', 1, 10000, 1);
    const tipo = req.query.tipo;
    if (tipo !== undefined && (typeof tipo !== 'string' || !tipo.trim() || tipo.length > 500)) throw errorHTTP(400, 'tipo debe ser un texto de 1 a 500 caracteres.');
    const filtro = { activo_en_catalogo: true, anio_creacion: { $gte: anioDesde }, ...(tipo ? { tipo_arma: tipo.trim() } : {}) };
    const data = await Arma.aggregate([
      { $match: filtro },
      { $lookup: { from: 'Paises_Facciones', localField: 'pais_origen.id_pais', foreignField: '_id', as: 'pais' } },
      { $unwind: { path: '$pais', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: { $ifNull: ['$pais._id', null] },
        pais: { $first: { $ifNull: ['$pais.nombre', 'Sin país asociado'] } },
        total_armas: { $sum: 1 },
        anio_promedio: { $avg: '$anio_creacion' },
        tipos: { $addToSet: '$tipo_arma' },
        armas: { $push: { id: '$_id', nombre: '$nombre', anio_creacion: '$anio_creacion' } },
      } },
      { $match: { total_armas: { $gte: minimo } } },
      { $sort: { total_armas: -1, pais: 1 } },
      { $project: { _id: 0, id_pais: '$_id', pais: 1, total_armas: 1, anio_promedio: { $round: ['$anio_promedio', 1] }, tipos: 1, armas: 1 } },
    ]);
    res.json({ success: true, cantidad: data.length, data });
  },
};

module.exports = {
  reportes,
  armas: ArmaController,
  auth: { login, logout, recuperar, autenticar },
  catalogoController,
  errorHTTP,
  responderError,
  crearHash,
  completarArma,
  copiarEvento,
  ejecutarConTransaccion,
};
