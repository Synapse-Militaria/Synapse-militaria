const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { Arma, Pais, Conflicto, Administrador } = require('../models/armaModel');

function errorHTTP(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function responderError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const validacion = ['ValidationError', 'CastError', 'StrictModeError'].includes(error.name);
  const status = error.status || (validacion || error.type === 'entity.parse.failed' ? 400 : error.code === 11000 ? 409 : 500);
  const message = status === 500 ? 'No se pudo completar la operación. Revisa la conexión con MongoDB.' : error.code === 11000 ? 'Ya existe un registro con estos datos.' : error.message;
  res.status(status).json({ success: false, message });
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
async function completarArma(arma) {
  if (arma.pais_origen?.id_pais) {
    const pais = await Pais.findById(arma.pais_origen.id_pais);
    if (!pais) throw errorHTTP(400, 'El país seleccionado ya no existe.');
    arma.pais_origen = { id_pais: pais._id, nombre: pais.nombre, tipo_faccion: pais.tipo_faccion, codigo_iso: pais.codigo_iso };
  }
  const eventos = [];
  for (const evento of arma.eventos) {
    if (!evento.id_evento) throw errorHTTP(400, 'Cada evento debe tener un conflicto asociado.');
    const conflicto = await Conflicto.findById(evento.id_evento);
    if (!conflicto) throw errorHTTP(400, 'Uno de los conflictos seleccionados ya no existe.');
    if (!eventos.some(item => String(item.id_evento) === String(conflicto._id))) eventos.push(copiarEvento(conflicto, evento));
  }
  arma.eventos = eventos;
}

async function sincronizarArma(arma) {
  const ids = arma.eventos.map(evento => evento.id_evento);
  await Conflicto.updateMany({ _id: { $nin: ids }, armas_involucradas: arma._id }, { $pull: { armas_involucradas: arma._id } });
  if (ids.length) await Conflicto.updateMany({ _id: { $in: ids } }, { $addToSet: { armas_involucradas: arma._id } });
}

async function validarArmas(conflicto) {
  const ids = [...new Set(conflicto.armas_involucradas.map(String))];
  if (ids.length && await Arma.countDocuments({ _id: { $in: ids } }) !== ids.length) {
    throw errorHTTP(400, 'Una de las armas seleccionadas ya no existe.');
  }
  conflicto.armas_involucradas = ids;
}

async function sincronizarConflicto(conflicto) {
  const ids = conflicto.armas_involucradas;
  await Arma.updateMany({ _id: { $nin: ids }, 'eventos.id_evento': conflicto._id }, { $pull: { eventos: { id_evento: conflicto._id } } });
  const armas = await Arma.find({ _id: { $in: ids } });
  for (const arma of armas) {
    const anterior = arma.eventos.find(evento => String(evento.id_evento) === String(conflicto._id));
    arma.eventos = arma.eventos.filter(evento => String(evento.id_evento) !== String(conflicto._id));
    arma.eventos.push(copiarEvento(conflicto, anterior));
    await arma.save();
  }
}

const scryptAsync = promisify(scrypt);
const sesiones = new Map();
const DURACION_SESION = 30 * 60 * 1000;

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

function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  const sesion = sesiones.get(token);
  if (!sesion || sesion.expiresAt <= Date.now()) {
    if (token) sesiones.delete(token);
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
  const admin = await Administrador.findOne({ email: email.trim().toLowerCase(), cuenta_activa: true }).select('+password_hash');
  if (!admin || !await verificarPassword(password, admin.password_hash)) throw errorHTTP(401, 'Credenciales inválidas. Acceso denegado.');
  for (const [token, sesion] of sesiones) if (sesion.expiresAt <= Date.now()) sesiones.delete(token);
  const token = randomBytes(32).toString('hex');
  const data = { token, email: admin.email, expiresAt: Date.now() + DURACION_SESION };
  sesiones.set(token, { email: admin.email, expiresAt: data.expiresAt });
  admin.ultimo_acceso = new Date();
  await admin.save();
  res.json({ success: true, data });
}

function logout(req, res) {
  sesiones.delete(req.token);
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
    const armas = await Arma.find({ nombre: new RegExp(escaparRegex(termino), 'i') }).sort({ nombre: 1 });
    res.json({ success: true, cantidad: armas.length, data: armas });
  },

  createArma: async (req, res) => {
    const arma = new Arma(req.body);
    await arma.validate();
    await completarArma(arma);
    await arma.save();
    await sincronizarArma(arma);
    res.status(201).json({ success: true, data: arma });
  },

  updateArma: async (req, res) => {
    const arma = await Arma.findById(req.params.id);
    if (!arma) throw errorHTTP(404, 'Arma no encontrada.');
    const { _id, ...cambios } = req.body || {};
    arma.set(cambios);
    await arma.validate();
    await completarArma(arma);
    await arma.save();
    await sincronizarArma(arma);
    res.json({ success: true, data: arma });
  },

  deleteArma: async (req, res) => {
    const arma = await Arma.findByIdAndDelete(req.params.id);
    if (!arma) throw errorHTTP(404, 'Arma no encontrada.');
    await Conflicto.updateMany({ armas_involucradas: arma._id }, { $pull: { armas_involucradas: arma._id } });
    res.json({ success: true, data: { _id: arma._id } });
  },
};

// Los dos catálogos comparten las mismas operaciones básicas.
function catalogoController(tipo) {
  const esPais = tipo === 'paises';
  const Modelo = esPais ? Pais : Conflicto;
  const nombre = esPais ? 'País o facción' : 'Conflicto';

  async function despuesDeGuardar(registro) {
    if (esPais) {
      await Arma.updateMany({ 'pais_origen.id_pais': registro._id }, { $set: {
        'pais_origen.nombre': registro.nombre,
        'pais_origen.tipo_faccion': registro.tipo_faccion,
        'pais_origen.codigo_iso': registro.codigo_iso,
      } });
    } else await sincronizarConflicto(registro);
  }

  return {
    listar: async (req, res) => {
      const data = await Modelo.find().sort(esPais ? { nombre: 1 } : { fecha_inicio: 1 });
      res.json({ success: true, cantidad: data.length, data });
    },
    crear: async (req, res) => {
      const registro = new Modelo(req.body);
      await registro.validate();
      if (!esPais) await validarArmas(registro);
      await registro.save();
      await despuesDeGuardar(registro);
      res.status(201).json({ success: true, data: registro });
    },
    actualizar: async (req, res) => {
      const registro = await Modelo.findById(req.params.id);
      if (!registro) throw errorHTTP(404, `${nombre} no encontrado.`);
      const { _id, ...cambios } = req.body || {};
      registro.set(cambios);
      await registro.validate();
      if (!esPais) await validarArmas(registro);
      await registro.save();
      await despuesDeGuardar(registro);
      res.json({ success: true, data: registro });
    },
    eliminar: async (req, res) => {
      const registro = await Modelo.findById(req.params.id);
      if (!registro) throw errorHTTP(404, `${nombre} no encontrado.`);
      const filtro = esPais ? { 'pais_origen.id_pais': registro._id } : { 'eventos.id_evento': registro._id };
      if (await Arma.exists(filtro)) throw errorHTTP(409, `${nombre} asociado a armamentos. Edita esas fichas antes de eliminarlo.`);
      await registro.deleteOne();
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
};
