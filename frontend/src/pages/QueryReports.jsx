import { useEffect, useMemo, useState } from 'react'
import { request } from '../services/api'
import { demoCountryReport } from '../services/reports'
import { downloadText } from '../services/csv'
import { reportCsv, reportCsvFilename } from '../services/reportCsv'

const initialFilters = { anio_desde: '1900', minimo: '1', tipo: '' }

export default function QueryReports({ mode, weapons, countries, navigate }) {
  const [filters, setFilters] = useState(initialFilters)
  const [query, setQuery] = useState(initialFilters)
  const [result, setResult] = useState({ status: 'loading', data: [], error: '' })
  const demo = useMemo(() => demoCountryReport(weapons, countries, query), [weapons, countries, query])
  const types = [...new Set(weapons.map(weapon => weapon.tipo_arma))].sort()

  useEffect(() => {
    if (mode !== 'online') return
    let active = true
    const params = new URLSearchParams({ anio_desde: query.anio_desde, minimo: query.minimo })
    if (query.tipo) params.set('tipo', query.tipo)
    request(`/reportes/armas-por-pais?${params}`)
      .then(data => { if (active) setResult({ status: 'success', data, error: '' }) })
      .catch(error => { if (active) setResult({ status: 'error', data: [], error: error.message }) })
    return () => { active = false }
  }, [mode, query])

  function runQuery(event) {
    event.preventDefault()
    setResult({ status: 'loading', data: [], error: '' })
    setQuery({ ...filters })
  }

  const busy = mode === 'loading' || (mode === 'online' && result.status === 'loading')
  const rows = mode === 'demo' ? demo : result.data
  const exportCsv = () => downloadText(reportCsv(rows), reportCsvFilename(query))
  const inputClass = 'w-full bg-background border border-border px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:border-primary'

  return <main className="min-h-screen pt-14">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-primary mb-3">Consultas del catálogo</p>
      <h1 className="font-heading text-3xl sm:text-4xl uppercase mb-4">Armas por país de origen</h1>
      <p className="text-secondary-foreground max-w-3xl mb-6">Compara la cantidad de armas y su año promedio de creación. Selecciona un año inicial y una categoría; el mínimo de armas se aplica después de agrupar por país.</p>
      <p role="status" className="font-mono text-sm text-primary mb-8">{mode === 'demo' ? 'Modo de presentación sin conexión. Resultados calculados con datos locales; no se ejecutó MongoDB.' : mode === 'online' ? 'Conectado a la API. La consulta y la agrupación se ejecutan en MongoDB.' : 'Comprobando conexión con la API…'}</p>

      <form onSubmit={runQuery} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-end mb-9">
        <label className="block text-sm">Año de creación desde
          <input type="number" min="1000" max="2100" step="1" required value={filters.anio_desde} onChange={event => setFilters({ ...filters, anio_desde: event.target.value })} className={`mt-2 ${inputClass}`} />
        </label>
        <label className="block text-sm">Tipo de arma
          <select value={filters.tipo} onChange={event => setFilters({ ...filters, tipo: event.target.value })} className={`mt-2 ${inputClass}`}><option value="">Todos los tipos</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select>
        </label>
        <label className="block text-sm">Mínimo de armas por país
          <input type="number" min="1" max="10000" step="1" required value={filters.minimo} onChange={event => setFilters({ ...filters, minimo: event.target.value })} className={`mt-2 ${inputClass}`} />
        </label>
        <button disabled={busy} type="submit" className="bg-primary text-primary-foreground px-4 py-3 font-mono text-xs uppercase tracking-wide disabled:opacity-50">{busy ? 'Consultando…' : 'Ejecutar consulta'}</button>
      </form>

      {mode === 'online' && result.error && <p role="alert" className="text-red-400 border border-red-400/40 p-4 mb-6">{result.error} Vuelve a ejecutar la consulta cuando el servicio esté disponible.</p>}
      {busy ? <p role="status" className="text-muted-foreground py-8">Consultando armas y países…</p> : !result.error || mode === 'demo' ? <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p role="status" className="font-mono text-xs text-muted-foreground">{rows.length} países con coincidencias · Desde {query.anio_desde} · Mínimo {query.minimo} armas · {query.tipo || 'Todos los tipos'}</p>
          <button type="button" onClick={exportCsv} disabled={busy || rows.length === 0} className="border border-primary text-primary px-4 py-2 font-mono text-xs uppercase tracking-wide hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary">Descargar CSV<span className="sr-only"> del reporte de armas por país</span></button>
        </div>
        {rows.length === 0 ? <p className="border border-border p-8 text-center text-secondary-foreground">No hay países que cumplan estos filtros. Reduce el mínimo o cambia el año inicial.</p> : <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Cantidad de armas agrupada por país y filtros aplicados</caption>
            <thead className="bg-card text-muted-foreground font-mono text-xs uppercase"><tr><th scope="col" className="p-4">País</th><th scope="col" className="p-4 text-center">Armas</th><th scope="col" className="p-4 text-center">Año promedio</th><th scope="col" className="p-4">Tipos</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id_pais || 'sin-pais'} className="border-t border-border align-top"><th scope="row" className="p-4 font-normal"><span className="font-heading text-lg">{row.pais}</span><ul className="mt-2 space-y-1">{row.armas.map(weapon => <li key={weapon.id}><button className="text-primary underline text-xs" onClick={() => navigate({ view: 'weapon', id: weapon.id })}>{weapon.nombre} ({weapon.anio_creacion})</button></li>)}</ul></th><td className="p-4 text-center font-mono">{row.total_armas}</td><td className="p-4 text-center font-mono">{row.anio_promedio ?? 'Sin dato'}</td><td className="p-4">{row.tipos.slice().sort().join(', ')}</td></tr>)}</tbody>
          </table>
        </div>}
      </> : null}

      <details className="mt-9 border-t border-border pt-5 text-sm text-secondary-foreground">
        <summary className="cursor-pointer font-mono text-primary">Equivalencias de la consulta</summary>
        <p className="mt-4">El catálogo de países se une mediante LEFT JOIN, equivalente a $lookup y $unwind. Los filtros WHERE usan $match con igualdad y $gte; GROUP BY se transforma en $group; COUNT y AVG usan $sum y $avg; HAVING aplica otro $match al total agrupado.</p>
        <p className="mt-3">El país se obtiene desde Paises_Facciones. Los registros sin país asociado se conservan en un grupo propio. Solo se incluyen armas activas con año de creación informado.</p>
      </details>
    </div>
  </main>
}
