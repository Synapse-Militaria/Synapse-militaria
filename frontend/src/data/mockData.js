import { additionalCountries, additionalConflicts, buildAdditionalWeapons, buildWeaponEnrichments } from './catalogExpansion.js'
import { catalogImages } from './catalogImages.js'
import { catalogImagesExtra } from './catalogImagesExtra.js'

const archiveImages = { ...catalogImages, ...catalogImagesExtra }

// Los nombres en español son los que se guardan en MongoDB.
// Los alias permiten conservar los componentes del diseño de Figma.
const categoryByType = {
  Rifle: 'rifle', Fusil: 'rifle', Pistola: 'pistol', Subfusil: 'submachine-gun',
  Ametralladora: 'machine-gun', Artillería: 'artillery',
  'Arma blanca': 'melee', Lanzador: 'launcher', 'Vehículo blindado': 'tank',
}
const typeByCategory = Object.fromEntries(Object.entries(categoryByType).map(([type, category]) => [category, type]))
const flags = { US: '🇺🇸', SU: 'SU', DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', BE: '🇧🇪', JP: '🇯🇵', CN: '🇨🇳' }

function idOf(value) {
  return String(value?.$oid ?? value ?? '')
}

function dateOf(value) {
  return value?.$date ?? value ?? null
}

function yearOf(date) {
  if (!date) return null
  const year = Number(String(date).slice(0, 4))
  return Number.isFinite(year) ? year : null
}

export function normalizeCountry(raw = {}) {
  const id = idOf(raw._id ?? raw.id)
  const nombre = raw.nombre ?? raw.name ?? ''
  const codigo_iso = raw.codigo_iso ?? ''
  const bandera = raw.bandera ?? raw.flag ?? flags[codigo_iso] ?? '◈'
  return {
    ...raw, _id: id, nombre, codigo_iso,
    tipo_faccion: raw.tipo_faccion ?? 'Estado',
    anio_fundacion: raw.anio_fundacion ?? null,
    existe_actualmente: raw.existe_actualmente ?? true,
    bandera, region: raw.region ?? '',
    id, name: nombre, flag: bandera,
  }
}

export function normalizeConflict(raw = {}) {
  const id = idOf(raw._id ?? raw.id)
  const nombre_conflicto = raw.nombre_conflicto ?? raw.name ?? ''
  const fecha_inicio = dateOf(raw.fecha_inicio !== undefined ? raw.fecha_inicio : (raw.startYear ? `${raw.startYear}-01-01` : null))
  const fecha_fin = dateOf(raw.fecha_fin !== undefined ? raw.fecha_fin : (raw.endYear ? `${raw.endYear}-12-31` : null))
  const teatro_operaciones = raw.teatro_operaciones ?? raw.theater ?? ''
  const descripcion = raw.descripcion ?? raw.description ?? ''
  const facciones = raw.facciones ?? raw.factions ?? []
  const imagen = raw.imagen ?? raw.image ?? ''
  return {
    ...raw, _id: id, nombre_conflicto, fecha_inicio, fecha_fin, teatro_operaciones,
    conflicto_finalizado: raw.conflicto_finalizado ?? Boolean(fecha_fin),
    armas_involucradas: (raw.armas_involucradas ?? []).map(idOf),
    referencias: raw.referencias ?? [], descripcion, facciones, imagen,
    id, name: nombre_conflicto, startYear: yearOf(fecha_inicio), endYear: yearOf(fecha_fin),
    theater: teatro_operaciones, description: descripcion, factions: facciones, image: imagen,
  }
}

export function normalizeWeapon(raw = {}) {
  const id = idOf(raw._id ?? raw.id)
  const nombre = raw.nombre ?? raw.name ?? ''
  const designacion_oficial = raw.designacion_oficial ?? raw.designation ?? ''
  const tipo_arma = raw.tipo_arma ?? typeByCategory[raw.category] ?? 'Rifle'
  const category = categoryByType[tipo_arma] ?? raw.category ?? 'rifle'
  const anio_creacion = raw.anio_creacion !== undefined ? raw.anio_creacion : raw.yearIntroduced ?? null
  const descripcion = raw.descripcion ?? raw.longDescription ?? raw.description ?? ''
  const fabricante = raw.fabricante ?? raw.manufacturer ?? ''
  const anio_diseno = raw.anio_diseno !== undefined ? raw.anio_diseno : raw.yearDesigned ?? anio_creacion
  const periodo_servicio = raw.periodo_servicio ?? raw.yearsInService ?? ''
  const etiquetas = raw.etiquetas ?? raw.tags ?? []
  const pais = raw.pais_origen ?? { id_pais: raw.countryId ?? '', nombre: '' }
  const pais_origen = { ...pais, id_pais: idOf(pais.id_pais) }
  const especificaciones_tecnicas = raw.especificaciones_tecnicas ?? {}
  const eventos = (raw.eventos ?? raw.conflictos ?? raw.conflicts ?? []).map(event => ({
    ...event,
    id_evento: idOf(event.id_evento ?? event.conflictId),
    nombre_conflicto: event.nombre_conflicto ?? event.name ?? '',
    fecha_inicio: dateOf(event.fecha_inicio), fecha_fin: dateOf(event.fecha_fin),
    teatro_operaciones: event.teatro_operaciones ?? '',
    rol: event.rol ?? event.role ?? '',
    facciones_usuarias: event.facciones_usuarias ?? event.factions ?? [],
    nota_historica: event.nota_historica ?? event.notes ?? '',
  }))
  const multimedia = (raw.multimedia ?? raw.images ?? []).map((item, index) => (
    typeof item === 'string' ? {
      url_archivo: item, descripcion_imagen: nombre, tipo_archivo: 'imagen/jpeg', es_portada: index === 0,
    } : { ...item, descripcion_imagen: item.descripcion_imagen ?? nombre }
  ))
  const referencias = (raw.referencias ?? raw.references ?? []).map((ref, index) => ({
    ...ref,
    codigo_cita: ref.codigo_cita ?? `REF-${index + 1}`,
    detalle_cita: ref.detalle_cita ?? ref.title ?? '',
    url_enlace: ref.url_enlace ?? ref.url ?? '',
    anio_publicacion: ref.anio_publicacion ?? ref.year ?? null,
    verificada: ref.verificada ?? false,
  }))

  const labels = {
    calibre: ['Calibre', ''], longitud_total_mm: ['Longitud total', ' mm'],
    longitud_canon_mm: ['Longitud cañón', ' mm'], peso_cargado_kg: ['Peso cargado', ' kg'],
    peso_sin_cargar_kg: ['Peso sin cargar', ' kg'], capacidad_cargador: ['Capacidad de alimentación', ''],
    accion: ['Acción', ''], modos_de_fuego: ['Modos de fuego', ''],
    cadencia_tiro: ['Cadencia de tiro', ''], alcance_efectivo: ['Alcance efectivo', ''],
  }
  const specs = {}
  for (const [key, [label, unit]] of Object.entries(labels)) {
    const value = especificaciones_tecnicas[key]
    if (value !== undefined && value !== null && value !== '') specs[label] = `${Array.isArray(value) ? value.join(', ') : value}${unit}`
  }
  // Compatibilidad con las fichas de la primera versión de Figma.
  if (raw.especificaciones_tecnicas === undefined) Object.assign(specs, raw.specs ?? {})

  return {
    ...raw, _id: id, nombre, designacion_oficial, tipo_arma, anio_creacion,
    epoca_creacion: raw.epoca_creacion ?? '', descripcion,
    activo_en_catalogo: raw.activo_en_catalogo ?? true,
    especificaciones_tecnicas, pais_origen, eventos, multimedia, referencias,
    fabricante, anio_diseno, periodo_servicio, etiquetas,
    id, name: nombre, designation: designacion_oficial, category,
    countryId: pais_origen.id_pais, manufacturer: fabricante,
    yearDesigned: anio_diseno, yearIntroduced: anio_creacion, yearsInService: periodo_servicio,
    description: descripcion.split('\n')[0], longDescription: descripcion, specs,
    conflicts: eventos.map(event => ({ conflictId: event.id_evento, role: event.rol, factions: event.facciones_usuarias, notes: event.nota_historica })),
    images: [...multimedia].sort((a, b) => Number(Boolean(b.es_portada)) - Number(Boolean(a.es_portada))).map(item => item.url_archivo).filter(Boolean),
    references: referencias.map((ref, index) => ({ id: idOf(ref._id ?? ref.id_referencia ?? ref.id ?? index), title: ref.detalle_cita, url: ref.url_enlace, year: ref.anio_publicacion })),
    tags: etiquetas,
  }
}

// Datos iniciales para presentar el proyecto cuando MongoDB no está disponible.
// Las medidas corresponden a las variantes indicadas; pueden variar según fabricante.
const oid = suffix => `6713f1a0c9d8e20015a4b${suffix}`

export const countries = [
  { _id: oid('001'), nombre: 'Estados Unidos', tipo_faccion: 'Estado', codigo_iso: 'US', anio_fundacion: 1776, existe_actualmente: true, bandera: '🇺🇸', region: 'América del Norte' },
  { _id: oid('002'), nombre: 'Unión Soviética', tipo_faccion: 'Estado', codigo_iso: 'SU', anio_fundacion: 1922, existe_actualmente: false, bandera: 'SU', region: 'Europa y Asia' },
  { _id: oid('003'), nombre: 'Alemania', tipo_faccion: 'Estado', codigo_iso: 'DE', anio_fundacion: 1871, existe_actualmente: true, bandera: '🇩🇪', region: 'Europa' },
  { _id: oid('004'), nombre: 'Reino Unido', tipo_faccion: 'Estado', codigo_iso: 'GB', anio_fundacion: 1801, existe_actualmente: true, bandera: '🇬🇧', region: 'Europa' },
  ...additionalCountries,
].map(normalizeCountry)

const conflictRecords = [
  { _id: oid('201'), nombre_conflicto: 'Segunda Guerra Mundial', fecha_inicio: '1939-09-01', fecha_fin: '1945-09-02', teatro_operaciones: 'Europa, África, Asia y el Pacífico', descripcion: 'Conflicto mundial entre los Aliados y las potencias del Eje. El catálogo reúne una selección de armas de infantería y vehículos empleados durante este periodo.', facciones: ['Aliados', 'Eje'], imagen: '/images/t34.jpg' },
  { _id: oid('202'), nombre_conflicto: 'Guerra de Corea', fecha_inicio: '1950-06-25', fecha_fin: '1953-07-27', teatro_operaciones: 'Península de Corea', descripcion: 'Guerra entre Corea del Norte y Corea del Sur, con intervención de fuerzas de la ONU y de China. La fecha de término corresponde al armisticio de 1953, no a un tratado de paz.', facciones: ['Corea del Sur y fuerzas de la ONU', 'Corea del Norte y China'], imagen: '/images/m1garand.jpg' },
  { _id: oid('203'), nombre_conflicto: 'Guerra de Vietnam', fecha_inicio: '1955-11-01', fecha_fin: '1975-04-30', teatro_operaciones: 'Sudeste Asiático', descripcion: 'Conflicto que enfrentó a Vietnam del Norte y el Viet Cong con Vietnam del Sur y sus aliados. Se emplearon armas de diferentes procedencias y generaciones.', facciones: ['Vietnam del Norte y Viet Cong', 'Vietnam del Sur y Estados Unidos'], imagen: '/images/ak47.jpg' },
  { _id: oid('204'), nombre_conflicto: 'Guerra Soviético-Afgana', fecha_inicio: '1979-12-24', fecha_fin: '1989-02-15', teatro_operaciones: 'Afganistán', descripcion: 'Intervención militar soviética en apoyo del gobierno afgano frente a grupos muyahidines. Las fechas corresponden a la intervención soviética y su retirada.', facciones: ['Unión Soviética y gobierno afgano', 'Muyahidines afganos'], imagen: '/images/ak47.jpg' },
  { _id: oid('205'), nombre_conflicto: 'Primera Guerra Mundial', fecha_inicio: '1914-07-28', fecha_fin: '1918-11-11', teatro_operaciones: 'Europa, Oriente Medio y África', descripcion: 'Conflicto entre las potencias de la Entente y los Imperios Centrales. La fecha de término indicada corresponde al armisticio del frente occidental.', facciones: ['Entente', 'Imperios Centrales'], imagen: '/images/m1911.jpg' },
  ...additionalConflicts,
]

function event(conflictSuffix, rol, facciones_usuarias, nota_historica = '') {
  const conflict = conflictRecords.find(item => item._id === oid(conflictSuffix))
  return {
    id_evento: conflict._id, nombre_conflicto: conflict.nombre_conflicto,
    fecha_inicio: conflict.fecha_inicio, fecha_fin: conflict.fecha_fin,
    teatro_operaciones: conflict.teatro_operaciones, rol, facciones_usuarias, nota_historica,
  }
}

function reference(suffix, detalle_cita, url_enlace) {
  return { _id: oid(suffix), codigo_cita: `REF-${suffix}`, detalle_cita, url_enlace, anio_publicacion: null, verificada: true }
}

function media(suffix, filename, descripcion_imagen, es_portada = true) {
  const archive = archiveImages[filename]
  return { _id: oid(suffix), url_archivo: archive?.url ?? `/images/${filename}`, descripcion_imagen: archive?.caption ?? descripcion_imagen, tipo_archivo: 'imagen/jpeg', es_portada }
}

function weapon(record) {
  const country = countries.find(item => item._id === record.pais_origen)
  return normalizeWeapon({
    activo_en_catalogo: true,
    ...record,
    pais_origen: { id_pais: country._id, nombre: country.nombre, tipo_faccion: country.tipo_faccion, codigo_iso: country.codigo_iso },
    especificaciones_tecnicas: {
      calibre: '', longitud_total_mm: null, longitud_canon_mm: null,
      peso_cargado_kg: null, capacidad_cargador: null, accion: '',
      modos_de_fuego: '', cadencia_tiro: '', alcance_efectivo: '',
      ...record.especificaciones_tecnicas,
    },
  })
}

const initialWeapons = [
  weapon({
    _id: oid('102'), nombre: 'AK-47', designacion_oficial: 'Avtomat Kalashnikova', tipo_arma: 'Rifle',
    anio_creacion: 1949, anio_diseno: 1947, epoca_creacion: 'Guerra Fría', pais_origen: oid('002'),
    fabricante: 'Izhmash y otros arsenales soviéticos', periodo_servicio: 'Desde 1949; diversas variantes',
    descripcion: 'Fusil de asalto soviético diseñado por Mijaíl Kaláshnikov y adoptado en 1949. Su difusión internacional lo convirtió en una de las armas más reconocibles de la Guerra Fría.\n\nEl AK utiliza el cartucho intermedio 7,62 × 39 mm y un sistema de gases con pistón de carrera larga. Su diseño buscó facilitar la producción y el uso en condiciones exigentes. La familia incluye numerosas versiones; el AKM de 1959 es una modernización distinta.\n\nEsta ficha presenta el AK de culata fija. La fotografía corresponde a un ejemplar de tipo II; las dimensiones y el peso cambian entre variantes. No se atribuye su uso a la Segunda Guerra Mundial ni a la Guerra de Corea.',
    especificaciones_tecnicas: { calibre: '7,62 × 39 mm', longitud_total_mm: 870, longitud_canon_mm: 415, peso_sin_cargar_kg: 3.8, capacidad_cargador: 30, accion: 'Toma de gases; cerrojo rotatorio', modos_de_fuego: 'Semiautomático y automático', cadencia_tiro: 'Aprox. 600 disparos/min', alcance_efectivo: 'Aprox. 300 m' },
    eventos: [event('203', 'Fusil de infantería del Ejército de Vietnam del Norte y del Viet Cong', ['Vietnam del Norte', 'Viet Cong'], 'Se emplearon armas soviéticas y variantes fabricadas en otros países.'), event('204', 'Arma de infantería empleada por distintas fuerzas', ['Fuerzas afganas', 'Muyahidines'], 'En el conflicto coexistieron variantes AK, AKM y otros modelos de la familia.')],
    multimedia: [media('501', 'ak47.jpg', 'AK-47 soviético de tipo II, vista lateral')],
    referencias: [reference('601', 'Royal Armouries. Dillon AK (PR.5428), colección y procedencia de un AK usado en Vietnam.', 'https://royalarmouries.org/objects-and-stories/up-close-online-exhibition/dillon-ak47')],
    etiquetas: ['fusil de asalto', 'soviético', 'guerra fría', '7,62', 'AK'],
  }),
  weapon({
    _id: oid('101'), nombre: 'M1 Garand', designacion_oficial: 'Rifle, Caliber .30, M1', tipo_arma: 'Rifle',
    anio_creacion: 1936, anio_diseno: 1932, epoca_creacion: 'Periodo de Entreguerras', pais_origen: oid('001'),
    fabricante: 'Springfield Armory, Winchester y otros', periodo_servicio: '1936–1957 como fusil principal de EE. UU.',
    descripcion: 'Fusil semiautomático estadounidense diseñado por John C. Garand. Su adopción en 1936 permitió equipar de forma amplia a la infantería con un arma que se recargaba automáticamente entre disparos.\n\nUtiliza el cartucho .30-06 Springfield y un peine en bloque de ocho cartuchos. Fue uno de los fusiles principales de las fuerzas estadounidenses durante la Segunda Guerra Mundial y la Guerra de Corea.\n\nSu fabricación se repartió entre Springfield Armory y otros fabricantes. Fue reemplazado gradualmente por el M14 como arma principal, aunque continuó en otras funciones y en servicio en distintos países.',
    especificaciones_tecnicas: { calibre: '.30-06 Springfield (7,62 × 63 mm)', longitud_total_mm: 1107, longitud_canon_mm: 609, peso_sin_cargar_kg: 4.3, capacidad_cargador: 8, accion: 'Toma de gases; cerrojo rotatorio', modos_de_fuego: 'Semiautomático', cadencia_tiro: 'Aprox. 40–50 disparos/min (práctica)', alcance_efectivo: 'Aprox. 460 m' },
    eventos: [event('201', 'Fusil de dotación de la infantería estadounidense', ['Estados Unidos'], 'Empleado en los teatros europeo y del Pacífico.'), event('202', 'Fusil de dotación de las fuerzas estadounidenses', ['Estados Unidos', 'Fuerzas de la ONU'])],
    multimedia: [media('502', 'm1garand.jpg', 'M1 Garand de la colección del National Museum of the Marine Corps')],
    referencias: [reference('602', 'Smithsonian Institution. United States M1 Rifle, registro nmah_418516.', 'https://www.si.edu/object/united-states-m1-rifle:nmah_418516')],
    etiquetas: ['semiautomático', 'estadounidense', 'segunda guerra mundial', '.30-06', 'Garand'],
  }),
  weapon({
    _id: oid('103'), nombre: 'Karabiner 98k', designacion_oficial: 'Karabiner 98 kurz', tipo_arma: 'Rifle',
    anio_creacion: 1935, anio_diseno: 1935, epoca_creacion: 'Periodo de Entreguerras', pais_origen: oid('003'),
    fabricante: 'Mauser y otros fabricantes alemanes', periodo_servicio: '1935–1945 en las fuerzas alemanas',
    descripcion: 'Fusil de cerrojo alemán adoptado en 1935. Fue el arma larga habitual de la infantería alemana durante la Segunda Guerra Mundial.\n\nEl Karabiner 98k deriva de la familia Mauser 98. Utiliza munición de 7,92 × 57 mm y un depósito interno de cinco cartuchos. Su mecanismo requiere accionar el cerrojo manualmente después de cada disparo.\n\nSe produjo en diferentes fábricas, con variaciones de acabado y materiales durante la guerra. Algunos ejemplares se adaptaron para el uso de miras ópticas.',
    especificaciones_tecnicas: { calibre: '7,92 × 57 mm Mauser', longitud_total_mm: 1110, longitud_canon_mm: 600, peso_sin_cargar_kg: 3.9, capacidad_cargador: 5, accion: 'Cerrojo giratorio Mauser 98', modos_de_fuego: 'Repetición manual', cadencia_tiro: 'Aprox. 10–15 disparos/min (práctica)', alcance_efectivo: 'Aprox. 500 m' },
    eventos: [event('201', 'Fusil de infantería de las fuerzas alemanas', ['Alemania'], 'Utilizado en Europa y el norte de África, entre otros teatros.')],
    multimedia: [media('503', 'kar98k.jpg', 'Karabiner 98k conservado por el Armémuseum de Suecia')],
    referencias: [reference('603', 'Armémuseum. Kar 98K, inventario AM.021488; fotografía y registro del objeto en Wikimedia Commons.', 'https://commons.wikimedia.org/wiki/File:Kar_98K_-_AM.021488.jpg')],
    etiquetas: ['cerrojo', 'Mauser', 'alemán', 'segunda guerra mundial', '7,92'],
  }),
  weapon({
    _id: oid('104'), nombre: 'MP40', designacion_oficial: 'Maschinenpistole 40', tipo_arma: 'Subfusil',
    anio_creacion: 1940, anio_diseno: 1940, epoca_creacion: 'Segunda Guerra Mundial', pais_origen: oid('003'),
    fabricante: 'Erma Werke, Steyr y C. G. Haenel', periodo_servicio: 'Desde 1940; uso principal alemán en 1940–1945',
    descripcion: 'Subfusil alemán de 9 mm desarrollado como una simplificación de la MP38. Empleó piezas estampadas y subconjuntos para reducir el tiempo y el costo de fabricación.\n\nFuncionaba por retroceso simple, desde cerrojo abierto y únicamente en fuego automático. La culata metálica plegable facilitaba su transporte por tripulaciones de vehículos y otras unidades.\n\nSu empleo se asocia a suboficiales y tropas especializadas. No reemplazó al fusil de cerrojo como arma general de toda la infantería alemana.',
    especificaciones_tecnicas: { calibre: '9 × 19 mm Parabellum', longitud_total_mm: 833, longitud_canon_mm: 251, peso_sin_cargar_kg: 4, capacidad_cargador: 32, accion: 'Retroceso simple; cerrojo abierto', modos_de_fuego: 'Automático', cadencia_tiro: 'Aprox. 500–550 disparos/min', alcance_efectivo: 'Aprox. 100–200 m' },
    eventos: [event('201', 'Subfusil para suboficiales, paracaidistas y tropas motorizadas', ['Alemania'])],
    multimedia: [media('504', 'mp40.jpg', 'MP40, colección de Springfield Armory'), media('514', 'mp40-right.jpg', 'MP40, vista del lado derecho', false)],
    referencias: [reference('604', 'Australian War Memorial. MP40 Submachine Gun, registro REL24838.', 'https://www.awm.gov.au/collection/C315270')],
    etiquetas: ['subfusil', 'alemán', 'segunda guerra mundial', '9 mm', 'culata plegable'],
  }),
  weapon({
    _id: oid('105'), nombre: 'Colt M1911', designacion_oficial: 'Pistol, Caliber .45, Automatic, M1911', tipo_arma: 'Pistola',
    anio_creacion: 1911, anio_diseno: 1911, epoca_creacion: 'Primera Guerra Mundial', pais_origen: oid('001'),
    fabricante: 'Colt, Springfield Armory y otros', periodo_servicio: 'Desde 1911; reemplazo general por la M9 en la década de 1980',
    descripcion: 'Pistola semiautomática diseñada por John M. Browning y adoptada por el Ejército de Estados Unidos en 1911. Utiliza el cartucho .45 ACP y un cargador de siete cartuchos.\n\nLa familia M1911 sirvió como arma corta militar durante gran parte del siglo XX. La variante M1911A1 incorporó cambios ergonómicos y se empleó ampliamente en la Segunda Guerra Mundial y conflictos posteriores.\n\nLas fotografías de esta ficha muestran una M1911A1 conservada por Springfield Armory. Se indica la variante para distinguirla del modelo original de 1911.',
    especificaciones_tecnicas: { calibre: '.45 ACP (11,43 × 23 mm)', longitud_total_mm: 216, longitud_canon_mm: 127, peso_sin_cargar_kg: 1.1, capacidad_cargador: 7, accion: 'Corto retroceso; acción simple', modos_de_fuego: 'Semiautomático', cadencia_tiro: 'Depende del tirador; no es automática', alcance_efectivo: 'Aprox. 50 m' },
    eventos: [event('205', 'Pistola de servicio de las fuerzas estadounidenses', ['Estados Unidos']), event('201', 'Arma corta de dotación, especialmente en la variante M1911A1', ['Estados Unidos']), event('202', 'Pistola de servicio', ['Estados Unidos']), event('203', 'Arma corta de oficiales, tripulaciones y otras unidades', ['Estados Unidos'])],
    multimedia: [media('505', 'm1911.jpg', 'M1911A1 de la colección de Springfield Armory'), media('515', 'm1911-left.jpg', 'M1911A1, vista lateral izquierda', false)],
    referencias: [reference('605', 'Smithsonian Institution. Colt U.S. Model 1911 Pistol, registro nmah_1291794.', 'https://www.si.edu/object/colt-us-model-1911-pistol:nmah_1291794')],
    etiquetas: ['pistola', 'Browning', '.45 ACP', 'estadounidense', 'primera guerra mundial'],
  }),
  weapon({
    _id: oid('106'), nombre: 'MG42', designacion_oficial: 'Maschinengewehr 42', tipo_arma: 'Ametralladora',
    anio_creacion: 1942, anio_diseno: 1942, epoca_creacion: 'Segunda Guerra Mundial', pais_origen: oid('003'),
    fabricante: 'Großfuß, Mauser, Steyr y otros', periodo_servicio: '1942–1945 en Alemania; diseños derivados posteriores',
    descripcion: 'Ametralladora alemana de propósito general introducida en 1942. Su fabricación mediante piezas de acero estampado redujo el trabajo necesario frente a la MG34.\n\nLa MG42 utilizaba alimentación por cinta y un mecanismo de corto retroceso con bloqueo por rodillos. Podía emplearse con bípode para apoyo de infantería o con trípode en posiciones de fuego.\n\nSu elevada cadencia exigía administrar la munición y el calentamiento. El diseño influyó en ametralladoras de posguerra; esos modelos derivados deben distinguirse de la MG42 original.',
    especificaciones_tecnicas: { calibre: '7,92 × 57 mm Mauser', longitud_total_mm: 1220, longitud_canon_mm: 530, peso_sin_cargar_kg: 11.6, capacidad_cargador: 50, accion: 'Corto retroceso; bloqueo por rodillos', modos_de_fuego: 'Automático', cadencia_tiro: 'Aprox. 1200 disparos/min; varía según configuración', alcance_efectivo: 'Aprox. 800 m con bípode; mayor con trípode' },
    eventos: [event('201', 'Ametralladora de apoyo de la infantería alemana', ['Alemania'], 'La capacidad indicada corresponde a un tramo de cinta de 50 cartuchos, no a un cargador de caja.')],
    multimedia: [media('506', 'mg42.jpg', 'MG42 expuesta en un museo, fotografía de Phanatic')],
    referencias: [reference('606', 'Royal Armouries. MG42 Machine Gun (PR.13309), fabricación y contexto histórico.', 'https://royalarmouries.org/objects-and-stories/up-close-online-exhibition/mg42-machine-gun')],
    etiquetas: ['ametralladora', 'alemán', 'segunda guerra mundial', 'alimentación por cinta', '7,92'],
  }),
  weapon({
    _id: oid('107'), nombre: 'T-34/85', designacion_oficial: 'Tanque medio T-34-85', tipo_arma: 'Vehículo blindado',
    anio_creacion: 1944, anio_diseno: 1943, epoca_creacion: 'Segunda Guerra Mundial', pais_origen: oid('002'),
    fabricante: 'Fábricas soviéticas; producción posterior en Polonia y Checoslovaquia', periodo_servicio: 'Desde 1944; uso posterior en numerosos países',
    descripcion: 'Tanque medio soviético de la familia T-34, equipado con un cañón de 85 mm y una torreta para tres tripulantes. Entró en producción durante la última etapa de la Segunda Guerra Mundial.\n\nEl T-34/85 respondió a la necesidad de mejorar el armamento y la organización de la tripulación del T-34 anterior. Mantuvo la base mecánica general y amplió la torreta para separar mejor las funciones de mando, puntería y carga.\n\nSe empleó en el avance soviético hacia Alemania y posteriormente en Corea. Esta ficha corresponde a la variante de 85 mm, no al T-34/76 de 1940; sus medidas no son intercambiables.',
    especificaciones_tecnicas: { calibre: '85 mm (cañón principal ZiS-S-53)', longitud_total_mm: 8150, peso_cargado_kg: 32000, capacidad_cargador: 55, accion: 'Vehículo de orugas; motor diésel V-2', modos_de_fuego: 'Cañón de carga manual y ametralladoras auxiliares', cadencia_tiro: 'Variable según la tripulación y el armamento', alcance_efectivo: 'Depende de la munición y del objetivo' },
    eventos: [event('201', 'Tanque medio del Ejército Rojo en la etapa final de la guerra', ['Unión Soviética'], 'La variante T-34/85 se empleó desde 1944.'), event('202', 'Tanque de las fuerzas norcoreanas', ['Corea del Norte'], 'El Tank Museum conserva un ejemplar capturado en Corea en 1950.')],
    multimedia: [media('507', 't34.jpg', 'T-34/85 conservado en un museo, fotografía de Radomil')],
    referencias: [reference('607', 'The Tank Museum. T-34/85, historia del vehículo y ficha de colección.', 'https://tankmuseum.org/tank-nuts/tank-collection/t-34-85/')],
    etiquetas: ['tanque', 'blindado', 'soviético', 'segunda guerra mundial', '85 mm'],
  }),
  weapon({
    _id: oid('108'), nombre: 'Mosin-Nagant M91/30', designacion_oficial: 'Fusil modelo 1891/30', tipo_arma: 'Rifle',
    anio_creacion: 1930, anio_diseno: 1930, epoca_creacion: 'Periodo de Entreguerras', pais_origen: oid('002'),
    fabricante: 'Arsenales de Tula e Izhevsk', periodo_servicio: 'Desde 1930; sustitución gradual durante la posguerra',
    descripcion: 'Fusil soviético de cerrojo que modernizó el Mosin-Nagant de 1891. La variante M91/30 fue una de las armas de infantería más utilizadas por el Ejército Rojo durante la Segunda Guerra Mundial.\n\nConservó el cartucho 7,62 × 54 mm R y el depósito interno de cinco cartuchos. Se fabricaron versiones de infantería y de francotirador con diferentes conjuntos de mira óptica.\n\nLos ejemplares de francotirador fueron distribuidos también durante la posguerra y aparecen documentados en Corea y Vietnam. El modelo 91/30 no participó en la Primera Guerra Mundial: esa relación corresponde al M1891 original.',
    especificaciones_tecnicas: { calibre: '7,62 × 54 mm R', longitud_total_mm: 1232, longitud_canon_mm: 729, peso_sin_cargar_kg: 4, capacidad_cargador: 5, accion: 'Cerrojo giratorio', modos_de_fuego: 'Repetición manual', cadencia_tiro: 'Aprox. 10 disparos/min (práctica)', alcance_efectivo: 'Aprox. 500 m; depende de la versión y la mira' },
    eventos: [event('201', 'Fusil de infantería y base de versiones de francotirador', ['Unión Soviética']), event('202', 'Fusil suministrado como ayuda militar soviética', ['Corea del Norte', 'China']), event('203', 'Uso de ejemplares de francotirador', ['Vietnam del Norte'])],
    multimedia: [media('508', 'mosin.jpg', 'Mosin-Nagant M91/30, perfil fotografiado por Josiah Purtlebaugh')],
    referencias: [reference('608', 'Australian War Memorial. Mosin Nagant M1891/30PU Sniper Rifle, registro REL/10150.', 'https://www.awm.gov.au/collection/C238955')],
    etiquetas: ['cerrojo', 'soviético', 'francotirador', 'segunda guerra mundial', '7,62'],
  }),
  weapon({
    _id: oid('109'), nombre: 'StG 44', designacion_oficial: 'Sturmgewehr 44', tipo_arma: 'Rifle',
    anio_creacion: 1944, anio_diseno: 1942, epoca_creacion: 'Segunda Guerra Mundial', pais_origen: oid('003'),
    fabricante: 'C. G. Haenel, Sauer y Steyr', periodo_servicio: '1944–1945 en las fuerzas alemanas; uso posterior limitado',
    descripcion: 'Fusil de asalto alemán que utilizó el cartucho intermedio 7,92 × 33 mm Kurz. La denominación StG 44 se adoptó durante la fase final de la Segunda Guerra Mundial.\n\nEl diseño se desarrolló a partir de los programas MKb 42 y MP43/MP44. Combinó fuego semiautomático y automático con un cargador extraíble de treinta cartuchos.\n\nEl uso de un cartucho intermedio buscó un equilibrio entre el alcance del fusil y el control en fuego automático. Su influencia histórica se relaciona con el desarrollo de la categoría de fusiles de asalto, sin equiparar sus piezas o mecanismo con otros modelos posteriores.',
    especificaciones_tecnicas: { calibre: '7,92 × 33 mm Kurz', longitud_total_mm: 940, longitud_canon_mm: 419, peso_sin_cargar_kg: 4.6, capacidad_cargador: 30, accion: 'Toma de gases; cerrojo basculante', modos_de_fuego: 'Semiautomático y automático', cadencia_tiro: 'Aprox. 500–600 disparos/min', alcance_efectivo: 'Aprox. 300 m' },
    eventos: [event('201', 'Fusil de asalto de unidades de infantería alemanas', ['Alemania'], 'Se empleó en los últimos años del conflicto, junto a sus denominaciones anteriores MP43 y MP44.')],
    multimedia: [media('509', 'stg44.jpg', 'StG 44 de la colección de Springfield Armory'), media('519', 'stg44-left.jpg', 'StG 44, vista lateral izquierda', false)],
    referencias: [reference('609', 'Australian War Memorial. StG44 Assault Rifle, registro RELAWM29292.001.', 'https://www.awm.gov.au/collection/C1081085')],
    etiquetas: ['fusil de asalto', 'alemán', 'segunda guerra mundial', '7,92 Kurz', 'Sturmgewehr'],
  }),
]

export const weaponEnrichments = Object.fromEntries(Object.entries(buildWeaponEnrichments({ event, reference })).map(([suffix, additions]) => [oid(suffix), additions]))

export const weapons = [
  ...initialWeapons.map(arma => {
    const additions = weaponEnrichments[arma._id]
    return additions ? normalizeWeapon({ ...arma, eventos: [...arma.eventos, ...(additions.eventos || [])], referencias: [...arma.referencias, ...(additions.referencias || [])] }) : arma
  }),
  ...buildAdditionalWeapons({ weapon, event, reference, media }),
]

export const conflicts = conflictRecords.map(record => normalizeConflict({
  ...record, conflicto_finalizado: true,
  imagen: archiveImages[record.imagen?.replace('/images/', '')]?.url ?? record.imagen,
  armas_involucradas: weapons.filter(arma => arma.eventos.some(item => item.id_evento === record._id)).map(arma => arma._id),
  referencias: record.referencias ?? [],
}))

export const CATEGORIES = [
  { value: '', label: 'Todos' }, { value: 'rifle', label: 'Rifles' },
  { value: 'pistol', label: 'Pistolas' }, { value: 'submachine-gun', label: 'Subfusiles' },
  { value: 'machine-gun', label: 'Ametralladoras' }, { value: 'tank', label: 'Vehículos blindados' },
  { value: 'artillery', label: 'Artillería' }, { value: 'launcher', label: 'Lanzadores' },
  { value: 'melee', label: 'Arma blanca' },
]
