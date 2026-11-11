import { toCsv } from './csv.js'

// RF07: listado cruzado del reporte de armas por país, con una fila por arma.
export const REPORT_CSV_HEADERS = ['pais', 'total_armas_pais', 'anio_promedio_pais', 'tipos_pais', 'arma', 'anio_creacion', 'id_arma']

export function reportCsv(rows) {
  const lines = rows.flatMap(row => {
    const tipos = (row.tipos ?? []).slice().sort().join(' | ')
    return (row.armas ?? []).map(weapon => [
      row.pais, row.total_armas, row.anio_promedio ?? '', tipos,
      weapon.nombre, weapon.anio_creacion ?? '', weapon.id ?? '',
    ])
  })
  return toCsv([REPORT_CSV_HEADERS, ...lines])
}

function slug(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function reportCsvFilename({ anio_desde, minimo, tipo }) {
  return `synapse-reporte-paises-desde-${slug(anio_desde)}-min-${slug(minimo)}-${slug(tipo) || 'todos'}.csv`
}
