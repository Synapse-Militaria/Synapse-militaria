import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { weapons, countries, conflicts } from '../src/data/mockData.js'
import { weaponCsv, toDocument } from '../src/services/api.js'
import { csvCell, toCsv } from '../src/services/csv.js'
import { demoCountryReport } from '../src/services/reports.js'
import { reportCsv, reportCsvFilename, REPORT_CSV_HEADERS } from '../src/services/reportCsv.js'

const HEADER_LINE = '﻿"pais","total_armas_pais","anio_promedio_pais","tipos_pais","arma","anio_creacion","id_arma"'

const lines = csv => csv.split('\r\n')

const sampleRows = [
  {
    id_pais: 'p1', pais: 'Estados Unidos', total_armas: 2, anio_promedio: 1935.5, tipos: ['Rifle', 'Ametralladora'],
    armas: [{ id: 'a1', nombre: 'M1 Garand', anio_creacion: 1936 }, { id: 'a2', nombre: 'Browning M1919', anio_creacion: 1935 }],
  },
  {
    id_pais: null, pais: 'Sin país asociado', total_armas: 1, anio_promedio: null, tipos: ['Pistola'],
    armas: [{ id: 'a3', nombre: 'Pistola "Especial", modelo 2', anio_creacion: 1950 }],
  },
]

test('reportCsv devuelve solo los encabezados cuando no hay filas', () => {
  assert.equal(reportCsv([]), HEADER_LINE)
  assert.deepEqual(REPORT_CSV_HEADERS, ['pais', 'total_armas_pais', 'anio_promedio_pais', 'tipos_pais', 'arma', 'anio_creacion', 'id_arma'])
})

test('reportCsv genera una fila por arma con los datos del país repetidos', () => {
  const csv = reportCsv(sampleRows)
  const [header, ...body] = lines(csv)
  assert.equal(header, HEADER_LINE)
  assert.equal(body.length, 3)
  assert.equal(body[0], '"Estados Unidos","2","1935.5","Ametralladora | Rifle","M1 Garand","1936","a1"')
  assert.equal(body[1], '"Estados Unidos","2","1935.5","Ametralladora | Rifle","Browning M1919","1935","a2"')
  assert.doesNotMatch(csv, /[^\r]\n/, 'solo usa saltos CRLF')
})

test('reportCsv no modifica el orden de los tipos de la fila original', () => {
  const rows = structuredClone(sampleRows)
  reportCsv(rows)
  assert.deepEqual(rows[0].tipos, ['Rifle', 'Ametralladora'])
})

test('el grupo "Sin país asociado" sale igual que los demás y anio_promedio null queda vacío', () => {
  const last = lines(reportCsv(sampleRows)).at(-1)
  assert.equal(last, '"Sin país asociado","1","","Pistola","Pistola ""Especial"", modelo 2","1950","a3"')
})

test('reportCsv escapa comillas, comas y saltos de línea', () => {
  const rows = [{ id_pais: 'p', pais: 'Reino, "Unido"', total_armas: 1, anio_promedio: 1900, tipos: ['A,B'], armas: [{ id: 'x', nombre: 'Línea 1\nLínea 2', anio_creacion: 1900 }] }]
  const csv = reportCsv(rows)
  assert.ok(csv.endsWith('\r\n"Reino, ""Unido""","1","1900","A,B","Línea 1\nLínea 2","1900","x"'))
})

test('reportCsv antepone apóstrofo a valores que empiezan con = + @ -', () => {
  const rows = [{
    id_pais: 'p', pais: '=HYPERLINK("http://x")', total_armas: 4, anio_promedio: -50, tipos: ['+tipo', '@tipo'],
    armas: [
      { id: '-id', nombre: '+SUM(A1)', anio_creacion: 1900 },
      { id: 'b', nombre: '@cmd', anio_creacion: 1901 },
      { id: 'c', nombre: '-2+3', anio_creacion: 1902 },
      { id: 'd', nombre: 'Normal = seguro', anio_creacion: 1903 },
    ],
  }]
  const body = lines(reportCsv(rows)).slice(1)
  assert.equal(body[0], `"'=HYPERLINK(""http://x"")","4","'-50","'+tipo | @tipo","'+SUM(A1)","1900","'-id"`)
  assert.ok(body[1].includes(`"'@cmd"`))
  assert.ok(body[2].includes(`"'-2+3"`))
  assert.ok(body[3].includes('"Normal = seguro"'))
  assert.equal(csvCell('@x'), `"'@x"`)
  assert.equal(csvCell(null), '""')
})

test('reportCsv exporta exactamente las filas del reporte local', () => {
  const rows = demoCountryReport(weapons, countries, { anio_desde: '1900', minimo: '1', tipo: '' })
  const body = lines(reportCsv(rows)).slice(1)
  assert.equal(body.length, rows.reduce((total, row) => total + row.armas.length, 0))
  for (const row of rows) for (const weapon of row.armas) assert.ok(body.some(line => line.includes(`"${weapon.id}"`) && line.startsWith(csvCell(row.pais))), weapon.nombre)
})

test('el nombre del archivo refleja los filtros sin tildes ni espacios', () => {
  assert.equal(reportCsvFilename({ anio_desde: '1900', minimo: '1', tipo: '' }), 'synapse-reporte-paises-desde-1900-min-1-todos.csv')
  assert.equal(reportCsvFilename({ anio_desde: '1935', minimo: '2', tipo: 'Subfusil Ligero' }), 'synapse-reporte-paises-desde-1935-min-2-subfusil-ligero.csv')
  assert.equal(reportCsvFilename({ anio_desde: '1900', minimo: '1', tipo: 'Artillería / Cañón' }), 'synapse-reporte-paises-desde-1900-min-1-artilleria-canon.csv')
})

// Copia congelada de la implementación anterior de weaponCsv para detectar cualquier cambio de salida.
function legacyWeaponCsv(weapon) {
  const flatten = (value, prefix = '', rows = []) => {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, rows)
    } else rows.push([prefix, value ?? ''])
    return rows
  }
  const quote = value => {
    let text = String(value)
    if (/^[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return '﻿' + [['campo', 'valor'], ...flatten(toDocument(weapon))].map(row => row.map(quote).join(',')).join('\r\n')
}

test('weaponCsv mantiene exactamente la salida anterior', () => {
  const edge = { nombre: '=1+1', anio_creacion: null, descripcion: 'a "b", c\nd', etiquetas: ['-x', '+y', '@z'], especificaciones_tecnicas: {} }
  assert.equal(weaponCsv(edge), '﻿"campo","valor"\r\n"nombre","\'=1+1"\r\n"anio_creacion",""\r\n"descripcion","a ""b"", c\nd"\r\n"etiquetas.0","\'-x"\r\n"etiquetas.1","\'+y"\r\n"etiquetas.2","\'@z"')
  for (const weapon of [...weapons, edge]) assert.equal(weaponCsv(weapon), legacyWeaponCsv(weapon), weapon.nombre)
  assert.equal(toCsv([['campo', 'valor']]), '﻿"campo","valor"')
})

let server
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
})
after(async () => { await server?.close() })

async function renderQueryReports(extra = {}) {
  const { default: QueryReports } = await server.ssrLoadModule('/src/pages/QueryReports.jsx')
  return renderToStaticMarkup(createElement(QueryReports, { weapons, countries, conflicts, navigate: () => {}, mode: 'demo', ...extra }))
}

const csvButton = page => page.match(/<button[^>]*>Descargar CSV<span[^>]*> del reporte de armas por país<\/span><\/button>/)?.[0]

test('la pantalla de consultas ofrece el botón Descargar CSV habilitado cuando hay filas', async () => {
  const button = csvButton(await renderQueryReports())
  assert.ok(button, 'el botón existe junto al estado del resultado')
  assert.doesNotMatch(button, /disabled=""/)
  assert.match(button, /type="button"/)
})

test('el botón Descargar CSV queda deshabilitado si no hay filas', async () => {
  const button = csvButton(await renderQueryReports({ weapons: [] }))
  assert.ok(button)
  assert.match(button, /disabled=""/)
})
