import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { weapons, countries, conflicts, CATEGORIES, normalizeWeapon, normalizeCountry, normalizeConflict } from '../src/data/mockData.js'
import { weaponCsv, toDocument } from '../src/services/api.js'
import { demoCountryReport } from '../src/services/reports.js'

test('el catálogo mantiene las relaciones del modelo documental', () => {
  assert.equal(weapons.length, 27)
  assert.equal(countries.length, 8)
  assert.equal(conflicts.length, 12)
  for (const records of [weapons, countries, conflicts]) assert.equal(new Set(records.map(record => record._id)).size, records.length)
  for (const category of CATEGORIES.filter(category => category.value)) assert.ok(weapons.some(weapon => weapon.category === category.value), category.label)
  for (const conflict of conflicts) {
    assert.ok(conflict.armas_involucradas.length > 0, conflict.name)
    for (const id of conflict.armas_involucradas) assert.ok(weapons.find(weapon => weapon._id === id)?.eventos.some(event => event.id_evento === conflict._id))
  }
  for (const weapon of weapons) {
    assert.match(weapon._id, /^[a-f0-9]{24}$/)
    assert.ok(countries.some(country => country._id === weapon.pais_origen.id_pais))
    assert.ok(weapon.referencias.some(reference => /^https:\/\//.test(reference.url_enlace)), weapon.name)
    assert.ok(weapon.images.length > 0, weapon.name)
    for (const path of weapon.images) {
      if (path.startsWith('/images/')) {
        const bytes = readFileSync(new URL(`../public${path}`, import.meta.url))
        assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', `${weapon.name}: fotografía JPEG local`)
      } else {
        const url = new URL(path)
        assert.equal(url.protocol, 'https:')
        assert.equal(url.hostname, 'commons.wikimedia.org')
        assert.ok(url.pathname.startsWith('/wiki/Special:FilePath/'), `${weapon.name}: fotografía de archivo`)
      }
    }
    for (const event of weapon.eventos) {
      const conflict = conflicts.find(conflict => conflict._id === event.id_evento)
      assert.ok(conflict?.armas_involucradas.includes(weapon._id))
    }
  }
})

test('editar campos canónicos actualiza los alias del diseño', () => {
  const original = weapons[0]
  const edited = normalizeWeapon({ ...original, nombre: 'Nombre actualizado', descripcion: 'Descripción actualizada', especificaciones_tecnicas: { calibre: 'Calibre actualizado' } })
  assert.equal(edited.name, 'Nombre actualizado')
  assert.equal(edited.description, 'Descripción actualizada')
  assert.equal(edited.specs.Calibre, 'Calibre actualizado')
  assert.equal(normalizeCountry({ ...countries[0], nombre: 'País actualizado' }).name, 'País actualizado')
  assert.equal(normalizeWeapon({ _id: original._id, nombre: 'M1 Garand' }).images.length, 0)
})

test('el CSV conserva tildes, comillas, saltos de línea y los campos anidados', () => {
  const record = { ...weapons[0], descripcion: 'Texto "citado", con coma\ny otra línea' }
  const csv = weaponCsv(record)
  assert.ok(csv.startsWith('\uFEFF"campo","valor"'))
  assert.ok(csv.includes('"Texto ""citado"", con coma\ny otra línea"'))
  assert.ok(csv.includes('especificaciones_tecnicas.calibre'))
  assert.ok(csv.includes('eventos.0.nombre_conflicto'))
  assert.ok(csv.includes('referencias.0.url_enlace'))
  assert.ok(csv.includes('multimedia.0.url_archivo'))
})

test('la API recibe campos documentales y el CSV protege fórmulas de planilla', () => {
  const document = toDocument(weapons[0])
  assert.ok(document.nombre)
  assert.equal(document.name, undefined)
  assert.equal(document.images, undefined)
  assert.ok(document.especificaciones_tecnicas.peso_sin_cargar_kg)
  assert.ok(weaponCsv({ nombre: '=1+1' }).includes("'=1+1"))
})

test('los campos canónicos nulos no recuperan valores de alias anteriores', () => {
  const conflict = normalizeConflict({ ...conflicts[0], fecha_inicio: null, fecha_fin: null, conflicto_finalizado: false })
  assert.equal(conflict.fecha_inicio, null)
  assert.equal(conflict.startYear, null)
  assert.equal(conflict.fecha_fin, null)
  assert.equal(conflict.endYear, null)

  const weapon = normalizeWeapon({ ...weapons[0], anio_creacion: null, anio_diseno: null, especificaciones_tecnicas: null })
  assert.equal(weapon.yearIntroduced, null)
  assert.equal(weapon.yearDesigned, null)
  assert.deepEqual(weapon.specs, {})
  assert.deepEqual(normalizeWeapon({ ...weapons[0], especificaciones_tecnicas: {} }).specs, {})
})

let server
const props = { weapons, countries, conflicts, navigate: () => {}, onLogout: () => {}, mode: 'demo' }

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
})
after(async () => { await server?.close() })

async function render(page, extra = {}) {
  const { default: Component } = await server.ssrLoadModule(`/src/pages/${page}.jsx`)
  return renderToStaticMarkup(createElement(Component, { ...props, ...extra }))
}

test('inicio y enciclopedia presentan las fichas del catálogo', async () => {
  const home = await render('Home')
  assert.ok(home.includes('Armamento Destacado'))
  for (const conflict of conflicts) assert.ok(home.includes(conflict.name), conflict.name)
  const catalog = await render('Encyclopedia')
  for (const weapon of weapons) assert.ok(catalog.includes(weapon.nombre))
})

test('cada conflicto filtra armas y todas las categorías ofrecen resultados', async () => {
  for (const conflict of conflicts) {
    const page = await render('Encyclopedia', { initialConflict: conflict._id })
    assert.ok(!page.includes('No se encontraron armas con estos filtros'), conflict.name)
    const titles = [...page.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(match => match[1])
    for (const weapon of weapons) {
      assert.equal(titles.includes(weapon.name), conflict.armas_involucradas.includes(weapon._id), `${conflict.name}: ${weapon.name}`)
    }
  }
  for (const category of CATEGORIES.filter(category => category.value)) {
    const page = await render('Encyclopedia', { initialCategory: category.value })
    assert.ok(!page.includes('No se encontraron armas con estos filtros'), category.label)
  }
})

test('la búsqueda sin coincidencias muestra la acción de restablecer', async () => {
  const empty = await render('Encyclopedia', { initialSearch: 'sin-coincidencias-123' })
  assert.ok(empty.includes('No se encontraron armas con estos filtros'))
  assert.ok(empty.includes('Restablecer parámetros de búsqueda'))
})

test('el catálogo y la ficha toleran país y eventos ausentes', async () => {
  const weapon = { ...weapons[0], pais_origen: null, countryId: '', eventos: null, conflicts: null }
  const catalog = await render('Encyclopedia', { weapons: [weapon], initialSearch: weapon.name })
  assert.ok(catalog.includes(weapon.name))
  assert.ok(catalog.includes('0 conflictos'))
  const detail = await render('WeaponDetail', { weapons: [weapon], id: weapon._id })
  assert.ok(detail.includes('Sin país asignado'))
  assert.ok(detail.includes('No hay conflictos registrados.'))
})

test('cada ficha incluye sus secciones y ambas exportaciones', async () => {
  for (const weapon of weapons) {
    const detail = await render('WeaponDetail', { id: weapon._id })
    for (const text of ['Descripción histórica', 'Especificaciones técnicas', 'Galería multimedia', 'Fuentes y referencias', 'Línea de tiempo', 'Descargar PDF', 'Descargar CSV']) assert.ok(detail.includes(text), `${weapon.nombre}: ${text}`)
  }
  assert.ok((await render('WeaponDetail', { id: 'inexistente' })).includes('Armamento no encontrado'))
})

test('login usa correo y no muestra credenciales; panel tiene cuatro pestañas', async () => {
  const login = await render('AdminLogin')
  assert.ok(login.includes('type="email"'))
  assert.ok(!login.includes('admin123'))
  assert.ok(!login.includes('admin@synapse-militaria.cl'))
  const panel = await render('AdminDashboard')
  for (const label of ['Armamentos', 'Conflictos', 'Países / Facciones', 'Referencias']) assert.ok(panel.includes(label))
})

test('una ruta con codificación inválida muestra página no encontrada', async () => {
  const previousWindow = globalThis.window
  globalThis.window = { location: { pathname: '/arma/%E0%A4%A', search: '' } }
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const page = renderToStaticMarkup(createElement(App))
    assert.ok(page.includes('Página no encontrada'))
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('el reporte local conserva el LEFT JOIN y aplica el mínimo tras filtrar y agrupar', () => {
  const items = [
    { _id: 'a', nombre: 'A', activo_en_catalogo: true, anio_creacion: 1930, tipo_arma: 'Rifle', pais_origen: { id_pais: 'p', nombre: 'Nombre antiguo' } },
    { _id: 'b', nombre: 'B', activo_en_catalogo: true, anio_creacion: 1940, tipo_arma: 'Rifle', pais_origen: { id_pais: 'p' } },
    { _id: 'c', nombre: 'C', activo_en_catalogo: true, anio_creacion: 1950, tipo_arma: 'Pistola', pais_origen: { id_pais: 'inexistente' } },
    { _id: 'd', nombre: 'D', activo_en_catalogo: false, anio_creacion: 1950, tipo_arma: 'Rifle', pais_origen: { id_pais: 'p' } },
    { _id: 'e', nombre: 'E', activo_en_catalogo: true, anio_creacion: null, tipo_arma: 'Rifle', pais_origen: { id_pais: 'p' } },
  ]
  const master = [{ _id: 'p', nombre: 'País vigente' }]
  const rows = demoCountryReport(items, master, { anio_desde: '1930', minimo: '1', tipo: '' })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].pais, 'País vigente')
  assert.equal(rows[0].total_armas, 2)
  assert.equal(rows[0].anio_promedio, 1935)
  assert.deepEqual(rows[0].armas.map(item => item.id), ['a', 'b'])
  assert.equal(rows[1].pais, 'Sin país asociado')
  assert.equal(demoCountryReport(items, master, { anio_desde: '1930', minimo: '2', tipo: 'Rifle' }).length, 1)
  assert.equal(demoCountryReport(items, master, { anio_desde: '1940', minimo: '2', tipo: 'Rifle' }).length, 0)
  const tiedAverage = [1930, 1930, 1930, 1931].map((year, index) => ({ ...items[0], _id: String(index), anio_creacion: year }))
  assert.equal(demoCountryReport(tiedAverage, master, { anio_desde: '1900', minimo: '1', tipo: '' })[0].anio_promedio, 1930.2)
})

test('la pantalla de consultas identifica el modo local y presenta la tabla y equivalencias', async () => {
  const page = await render('QueryReports')
  for (const text of ['Armas por país de origen', 'Modo de presentación sin conexión', 'no se ejecutó MongoDB', 'Ejecutar consulta', 'Año promedio', 'LEFT JOIN', 'GROUP BY', 'HAVING']) assert.ok(page.includes(text), text)
  assert.ok(!page.includes('La consulta y la agrupación se ejecutan en MongoDB.'))
})

test('el catálogo combina año desde y hasta e informa rangos invertidos', async () => {
  const page = await render('Encyclopedia', { initialYearFrom: '1936', initialYearTo: '1936' })
  assert.ok(page.includes('M1 Garand'))
  assert.ok(!page.includes('Mosin-Nagant'))
  assert.ok(!page.includes('StG 44'))
  const invalid = await render('Encyclopedia', { initialYearFrom: '1940', initialYearTo: '1930' })
  assert.ok(invalid.includes('El año inicial debe ser menor o igual al final.'))
  assert.ok(invalid.includes('No se encontraron armas con estos filtros'))
})
