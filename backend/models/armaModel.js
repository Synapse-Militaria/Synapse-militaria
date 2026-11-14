const mongoose = require('mongoose');

const texto = (required = false, maxlength = 500) => ({ type: String, trim: true, required, maxlength });
const numero = (min = 0, max = Number.MAX_SAFE_INTEGER) => ({ type: Number, min, max });
const url = {
  type: String,
  trim: true,
  validate: {
    validator: value => !value || /^(https?:\/\/|\/)[^\s]+$/i.test(value),
    message: 'La dirección debe comenzar con http://, https:// o /.',
  },
};
const referenciaSchema = new mongoose.Schema({
  codigo_cita: texto(),
  detalle_cita: texto(true, 4000),
  url_enlace: url,
  anio_publicacion: numero(1000, 2100),
  verificada: { type: Boolean, default: false },
});

const armaSchema = new mongoose.Schema({
  nombre: texto(true),
  designacion_oficial: texto(),
  tipo_arma: texto(true),
  anio_creacion: numero(1000, 2100),
  epoca_creacion: texto(),
  descripcion: texto(true, 12000),
  activo_en_catalogo: { type: Boolean, default: true },
  fabricante: texto(),
  anio_diseno: numero(1000, 2100),
  periodo_servicio: texto(),
  etiquetas: [String],
  especificaciones_tecnicas: {
    calibre: texto(),
    longitud_total_mm: numero(0),
    longitud_canon_mm: numero(0),
    peso_cargado_kg: numero(0),
    peso_sin_cargar_kg: numero(0),
    capacidad_cargador: numero(0),
    accion: texto(),
    modos_de_fuego: texto(),
    cadencia_tiro: texto(),
    alcance_efectivo: texto(),
  },
  pais_origen: {
    id_pais: { type: mongoose.Schema.Types.ObjectId, ref: 'Pais' },
    nombre: texto(),
    tipo_faccion: texto(),
    codigo_iso: texto(),
  },
  eventos: [{
    _id: false,
    id_evento: { type: mongoose.Schema.Types.ObjectId, ref: 'Conflicto' },
    nombre_conflicto: texto(),
    fecha_inicio: Date,
    fecha_fin: Date,
    teatro_operaciones: texto(),
    rol: texto(false, 2000),
    facciones_usuarias: [String],
    nota_historica: texto(false, 4000),
  }],
  multimedia: [{
    url_archivo: url,
    descripcion_imagen: texto(),
    tipo_archivo: texto(),
    es_portada: { type: Boolean, default: false },
  }],
  referencias: [referenciaSchema],
}, { collection: 'Armas', versionKey: false });

// Índices para los filtros de los reportes y las relaciones extendidas.
// La ganancia concreta requiere medir explain con un volumen representativo.
armaSchema.index({ activo_en_catalogo: 1, anio_creacion: 1 });
armaSchema.index({ activo_en_catalogo: 1, tipo_arma: 1, anio_creacion: 1 });
armaSchema.index({ 'pais_origen.id_pais': 1 });
armaSchema.index({ 'eventos.id_evento': 1 });

const paisSchema = new mongoose.Schema({
  nombre: texto(true),
  tipo_faccion: { type: String, enum: ['Estado', 'Imperio', 'Alianza Militar'], default: 'Estado' },
  codigo_iso: { type: String, trim: true, uppercase: true, maxlength: 3 },
  anio_fundacion: numero(0, 2100),
  existe_actualmente: { type: Boolean, default: true },
  bandera: texto(),
  region: texto(),
}, { collection: 'Paises_Facciones', versionKey: false });

const conflictoSchema = new mongoose.Schema({
  nombre_conflicto: texto(true),
  fecha_inicio: { type: Date, required: true },
  fecha_fin: Date,
  teatro_operaciones: texto(true),
  conflicto_finalizado: { type: Boolean, default: true },
  descripcion: texto(false, 6000),
  facciones: [String],
  imagen: url,
  armas_involucradas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Arma' }],
  referencias: [referenciaSchema],
}, { collection: 'Eventos_Conflictos', versionKey: false });

conflictoSchema.pre('validate', function () {
  if (this.fecha_fin && this.fecha_inicio && this.fecha_fin < this.fecha_inicio) {
    this.invalidate('fecha_fin', 'La fecha final no puede ser anterior al inicio.');
  }
});

module.exports = {
  Arma: mongoose.model('Arma', armaSchema),
  Pais: mongoose.model('Pais', paisSchema),
  Conflicto: mongoose.model('Conflicto', conflictoSchema),
};
