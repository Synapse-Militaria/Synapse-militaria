import { useCallback, useEffect, useState } from 'react'
import Nav from './components/Nav'
import Home from './pages/Home'
import Encyclopedia from './pages/Encyclopedia'
import WeaponDetail from './pages/WeaponDetail'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import QueryReports from './pages/QueryReports'
import { weapons, countries, conflicts, normalizeWeapon, normalizeCountry, normalizeConflict } from './data/mockData'
import { loadCatalog, request, toDocument } from './services/api'

const initialCatalog = { weapons, countries, conflicts }
const normalizers = { weapons: normalizeWeapon, countries: normalizeCountry, conflicts: normalizeConflict }
const endpoints = { weapons: 'armas', countries: 'paises', conflicts: 'conflictos' }

function readPage() {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  if (pathname === '/') return { view: 'home' }
  if (pathname === '/enciclopedia') return { view: 'encyclopedia', search: params.get('q') || '', category: params.get('categoria') || '', conflict: params.get('conflicto') || '' }
  if (pathname === '/consultas') return { view: 'queries' }
  if (pathname.startsWith('/arma/')) {
    try { return { view: 'weapon', id: decodeURIComponent(pathname.slice(6)) } }
    catch { return { view: 'not-found' } }
  }
  if (pathname === '/admin/login') return { view: 'admin-login' }
  if (pathname === '/admin') return { view: 'admin' }
  return { view: 'not-found' }
}

function pageUrl(page) {
  if (page.view === 'home') return '/'
  if (page.view === 'weapon') return `/arma/${encodeURIComponent(page.id)}`
  if (page.view === 'admin-login') return '/admin/login'
  if (page.view === 'admin') return '/admin'
  if (page.view === 'queries') return '/consultas'
  const params = new URLSearchParams()
  if (page.search) params.set('q', page.search)
  if (page.category) params.set('categoria', page.category)
  if (page.conflict) params.set('conflicto', page.conflict)
  return `/enciclopedia${params.size ? `?${params}` : ''}`
}

function prepareCatalog(data) {
  const countries = data.countries.map(normalizeCountry)
  const conflicts = data.conflicts.map(normalizeConflict)
  const weapons = data.weapons.map(raw => {
    const fallback = initialCatalog.weapons.find(w => w.nombre.toLowerCase() === raw.nombre?.toLowerCase()) || {}
    const merged = { ...fallback, ...raw, especificaciones_tecnicas: { ...fallback.especificaciones_tecnicas, ...raw.especificaciones_tecnicas } }
    const country = countries.find(c => c._id === raw.pais_origen?.id_pais || c.nombre === raw.pais_origen?.nombre)
    if (country) merged.pais_origen = { id_pais: country._id, nombre: country.nombre, tipo_faccion: country.tipo_faccion, codigo_iso: country.codigo_iso }
    merged.eventos = (merged.eventos || []).map(event => {
      const conflict = conflicts.find(c => c._id === event.id_evento || c.nombre_conflicto === event.nombre_conflicto)
      return conflict ? { ...event, id_evento: conflict._id, nombre_conflicto: conflict.nombre_conflicto, fecha_inicio: conflict.fecha_inicio, fecha_fin: conflict.fecha_fin, teatro_operaciones: conflict.teatro_operaciones } : event
    })
    return normalizeWeapon(merged)
  })
  return { weapons, countries, conflicts }
}

function makeId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Se actualizan también las copias extendidas descritas en el informe.
function updateCatalog(catalog, collection, record) {
  const item = normalizers[collection](record)
  const next = { ...catalog, [collection]: [...catalog[collection].filter(r => r._id !== item._id), item] }
  if (collection === 'countries') {
    next.weapons = next.weapons.map(w => w.pais_origen?.id_pais === item._id
      ? normalizeWeapon({ ...w, pais_origen: { id_pais: item._id, nombre: item.nombre, tipo_faccion: item.tipo_faccion, codigo_iso: item.codigo_iso } }) : w)
  }
  if (collection === 'weapons') {
    next.conflicts = next.conflicts.map(c => normalizeConflict({ ...c, armas_involucradas: [
      ...(c.armas_involucradas || []).filter(id => id !== item._id),
      ...(item.eventos.some(e => e.id_evento === c._id) ? [item._id] : []),
    ] }))
  }
  if (collection === 'conflicts') {
    next.weapons = next.weapons.map(w => {
      const previous = w.eventos.find(e => e.id_evento === item._id)
      const eventos = w.eventos.filter(e => e.id_evento !== item._id)
      if (item.armas_involucradas.includes(w._id)) eventos.push({ ...previous, id_evento: item._id, nombre_conflicto: item.nombre_conflicto, fecha_inicio: item.fecha_inicio, fecha_fin: item.fecha_fin, teatro_operaciones: item.teatro_operaciones, rol: previous?.rol || '', facciones_usuarias: previous?.facciones_usuarias || [] })
      return normalizeWeapon({ ...w, eventos })
    })
  }
  return next
}

export default function App() {
  const [page, setPage] = useState(readPage)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [mode, setMode] = useState('loading')
  const [session, setSession] = useState(null)
  const [sessionMessage, setSessionMessage] = useState('')

  const navigate = useCallback(to => {
    window.history.pushState({}, '', pageUrl(to))
    setPage(to)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    const onPopState = () => setPage(readPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let active = true
    loadCatalog().then(data => {
      if (!active) return
      setCatalog(prepareCatalog(data))
      setMode('online')
    }).catch(() => { if (active) setMode('demo') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!session) return
    let timer
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setSession(null)
        setSessionMessage('La sesión terminó por inactividad. Vuelve a ingresar.')
        navigate({ view: 'admin-login' })
      }, Math.min(15 * 60 * 1000, session.expiresAt - Date.now()))
    }
    resetTimer()
    const events = ['pointerdown', 'keydown', 'scroll']
    events.forEach(name => window.addEventListener(name, resetTimer))
    return () => { clearTimeout(timer); events.forEach(name => window.removeEventListener(name, resetTimer)) }
  }, [session, navigate])

  async function handleLogin(email, password) {
    setSessionMessage('')
    if (mode === 'loading') throw new Error('Espera un momento mientras se comprueba la conexión.')
    if (mode === 'online') {
      const data = await request('/auth/login', { method: 'POST', body: { email, password } })
      setSession({ ...data, expiresAt: Number(new Date(data.expiresAt)) })
    } else {
      if (email !== 'admin@synapse-militaria.cl' || password !== 'admin123') throw new Error('Credenciales inválidas. Acceso denegado.')
      setSession({ email, token: null, expiresAt: Date.now() + 30 * 60 * 1000 })
    }
    navigate({ view: 'admin' })
  }

  function handleLogout() {
    if (session?.token) request('/auth/logout', { method: 'POST', token: session.token }).catch(() => {})
    setSession(null)
    navigate({ view: 'home' })
  }

  async function saveRecord(collection, raw) {
    let record = toDocument(raw)
    if (mode === 'online') {
      try {
        record = await request(`/${endpoints[collection]}${record._id ? `/${record._id}` : ''}`, { method: record._id ? 'PUT' : 'POST', body: record, token: session?.token })
      } catch (error) {
        if (error.status === 401) { setSession(null); setSessionMessage('Tu sesión expiró. Vuelve a ingresar.') }
        throw error
      }
    } else record = { ...record, _id: record._id || makeId() }
    setCatalog(current => updateCatalog(current, collection, record))
    return normalizers[collection](record)
  }

  async function deleteRecord(collection, id) {
    if (collection !== 'weapons' && catalog.weapons.some(w => collection === 'countries' ? w.pais_origen.id_pais === id : w.eventos.some(e => e.id_evento === id))) {
      throw new Error('Este registro está asociado a un arma. Modifica primero la ficha del arma.')
    }
    if (mode === 'online') {
      try { await request(`/${endpoints[collection]}/${id}`, { method: 'DELETE', token: session?.token }) }
      catch (error) {
        if (error.status === 401) { setSession(null); setSessionMessage('Tu sesión expiró. Vuelve a ingresar.') }
        throw error
      }
    }
    setCatalog(current => {
      const next = { ...current, [collection]: current[collection].filter(r => r._id !== id) }
      if (collection === 'weapons') next.conflicts = current.conflicts.map(c => normalizeConflict({ ...c, armas_involucradas: c.armas_involucradas.filter(weaponId => weaponId !== id) }))
      return next
    })
  }

  const publicCatalog = { ...catalog, weapons: catalog.weapons.filter(w => w.activo_en_catalogo !== false) }
  return <div className="min-h-screen bg-background text-foreground">
    <a className="skip-link font-mono text-sm" href="#contenido">Saltar al contenido</a>
    <Nav page={page} navigate={navigate} isAdmin={Boolean(session)} onLogout={handleLogout} />
    <div id="contenido">
      {page.view === 'home' && <Home navigate={navigate} {...publicCatalog} />}
      {page.view === 'encyclopedia' && <Encyclopedia key={pageUrl(page)} navigate={navigate} initialSearch={page.search} initialCategory={page.category} initialConflict={page.conflict} {...publicCatalog} />}
      {page.view === 'queries' && <QueryReports mode={mode} navigate={navigate} {...publicCatalog} />}
      {page.view === 'weapon' && <WeaponDetail key={page.id} id={page.id} navigate={navigate} mode={mode} {...(session ? catalog : publicCatalog)} />}
      {(page.view === 'admin-login' || (page.view === 'admin' && !session)) && <AdminLogin navigate={navigate} onLogin={handleLogin} mode={mode} message={sessionMessage} />}
      {page.view === 'admin' && session && <AdminDashboard navigate={navigate} onLogout={handleLogout} {...catalog} onSave={saveRecord} onDelete={deleteRecord} mode={mode} />}
      {page.view === 'not-found' && <main className="pt-32 px-6 text-center"><h1 className="font-heading text-3xl uppercase mb-6">Página no encontrada</h1><button className="text-primary underline" onClick={() => navigate({ view: 'home' })}>Volver al inicio</button></main>}
    </div>
  </div>
}
