import { toCsv, downloadText } from './csv.js'

export function resolverApiUrl(env) {
  if (env?.VITE_API_URL) return env.VITE_API_URL.replace(/\/$/, '')
  return env?.PROD ? '/api' : 'http://localhost:3000/api'
}

export function resolverTimeout(env) {
  const valor = Number(env?.VITE_API_TIMEOUT_MS)
  return Number.isFinite(valor) && valor > 0 ? valor : 15000
}

const API_URL = resolverApiUrl(import.meta.env ?? {})
const TIMEOUT_MS = resolverTimeout(import.meta.env ?? {})

export async function request(path, { method = 'GET', body, token, signal } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json()
    if (!response.ok) {
      const error = new Error(result.message || 'No se pudo completar la operación.')
      error.status = response.status
      throw error
    }
    return result.data
  } catch (error) {
    if (error.status) throw error
    throw new Error('No se pudo conectar con el servidor. Revisa que el backend esté iniciado.', { cause: error })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function loadCatalog() {
  const [weapons, conflicts, countries] = await Promise.all([
    request('/armas'), request('/conflictos'), request('/paises'),
  ])
  return { weapons, conflicts, countries }
}

export function toDocument(record) {
  // Los alias en inglés son solo para las vistas de Figma; MongoDB recibe el modelo del informe.
  const fields = ['_id', 'nombre', 'designacion_oficial', 'tipo_arma', 'anio_creacion', 'epoca_creacion',
    'descripcion', 'activo_en_catalogo', 'especificaciones_tecnicas', 'pais_origen', 'eventos',
    'multimedia', 'referencias', 'fabricante', 'anio_diseno', 'periodo_servicio', 'etiquetas',
    'nombre_conflicto', 'fecha_inicio', 'fecha_fin', 'teatro_operaciones', 'conflicto_finalizado',
    'armas_involucradas', 'facciones', 'imagen', 'tipo_faccion', 'codigo_iso', 'anio_fundacion',
    'existe_actualmente', 'bandera', 'region']
  return Object.fromEntries(fields.filter(key => record[key] !== undefined).map(key => [key, record[key]]))
}

function flatten(value, prefix = '', rows = []) {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, rows)
  } else rows.push([prefix, value ?? ''])
  return rows
}

export function weaponCsv(weapon) {
  return toCsv([['campo', 'valor'], ...flatten(toDocument(weapon))])
}

export function downloadCsv(weapon) {
  downloadText(weaponCsv(weapon), `synapse-${weapon.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`)
}
