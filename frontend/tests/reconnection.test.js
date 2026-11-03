import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let server, App
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', plugins: [{
    name: 'app-hooks-test', enforce: 'pre',
    transform: (code, id) => id.replaceAll('\\', '/').endsWith('/src/App.jsx') ? code.replace("from 'react'", "from 'virtual:app-hooks-test'") : undefined,
    resolveId: id => id === 'virtual:app-hooks-test' ? '\0app-hooks-test' : undefined,
    load: id => id === '\0app-hooks-test' ? ['useState', 'useRef', 'useCallback', 'useEffect'].map(name => `export const ${name} = (...args) => globalThis.__appTestHooks.${name}(...args)`).join('\n') : undefined,
  }] })
  App = (await server.ssrLoadModule('/src/App.jsx')).default
})
after(async () => { await server?.close() })

function mount(t) {
  const previousWindow = globalThis.window
  globalThis.window = { location: { pathname: '/', search: '' }, history: { pushState() {} }, scrollTo() {}, addEventListener() {}, removeEventListener() {}, confirm: () => true }
  const slots = [], cleanups = []
  let cursor = 0, effects = []
  const slot = initial => slots[cursor++] ??= initial()
  globalThis.__appTestHooks = {
    useState(initial) { const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next }] },
    useRef(initial) { return slot(() => ({ current: initial })) },
    useCallback(callback) { return slot(() => ({ callback })).callback },
    useEffect(callback, deps) { const state = slot(() => ({})); if (!state.deps || deps.some((value, i) => !Object.is(value, state.deps[i]))) effects.push(() => { state.cleanup?.(); state.cleanup = callback(); state.deps = deps; if (!cleanups.includes(state)) cleanups.push(state) }) },
  }
  t.after(() => { cleanups.forEach(state => state.cleanup?.()); globalThis.window = previousWindow; delete globalThis.__appTestHooks })
  return () => { cursor = 0; effects = []; const tree = App(); effects.forEach(effect => effect()); return tree }
}
function find(tree, name) {
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.type === name || tree.type?.name === name) return tree
  return [tree.props?.children].flat(Infinity).map(child => find(child, name)).find(Boolean)
}
const settle = () => new Promise(resolve => setImmediate(resolve))
const reply = url => ({ ok: true, json: async () => ({ data: String(url).endsWith('/armas') ? [{ _id: 'server', nombre: 'Ficha del servidor', descripcion: 'Persistida', pais_origen: null }] : [] }) })

test('reconectar confirma cambios, conserva datos al cancelar o fallar e invalida la sesión demo al tener éxito', async t => {
  let reachable = false
  const fetch = t.mock.method(globalThis, 'fetch', async url => { if (!reachable) throw new Error('Sin conexión'); return reply(url) })
  const render = mount(t)
  render(); await settle()
  let tree = render()
  const login = () => find(tree, 'AdminLogin')
  find(tree, 'Home').props.navigate({ view: 'admin-login' }); tree = render()
  await login().props.onLogin('admin@synapse-militaria.cl', 'admin123'); tree = render()
  let admin = find(tree, 'AdminDashboard')
  const changed = { ...admin.props.weapons[0], nombre: 'Edición local' }
  await admin.props.onSave('weapons', changed); tree = render()
  const confirm = t.mock.method(window, 'confirm', () => false)
  await find(tree, 'aside').props.children[1].props.onClick(); tree = render()
  assert.equal(fetch.mock.callCount(), 3)
  assert.ok(find(tree, 'AdminDashboard').props.weapons.some(weapon => weapon.nombre === 'Edición local'))
  confirm.mock.mockImplementation(() => true)
  admin = find(tree, 'AdminDashboard')
  const retry = find(tree, 'aside').props.children[1].props.onClick()
  await assert.rejects(admin.props.onSave('weapons', changed), /comprobación de conexión/)
  await retry; tree = render()
  assert.ok(find(tree, 'AdminDashboard').props.weapons.some(weapon => weapon.nombre === 'Edición local'))
  reachable = true
  await find(tree, 'aside').props.children[1].props.onClick(); tree = render()
  assert.equal(find(tree, 'AdminDashboard'), undefined)
  assert.equal(find(tree, 'AdminLogin').props.mode, 'online')
  find(tree, 'AdminLogin').props.navigate({ view: 'home' }); tree = render()
  assert.equal(find(tree, 'Home').props.weapons[0].nombre, 'Ficha del servidor')
  assert.equal(confirm.mock.callCount(), 3)
})

test('ingresar en modo demo sin editar permite reconectar sin confirmación', async t => {
  let reachable = false
  t.mock.method(globalThis, 'fetch', async url => { if (!reachable) throw new Error('Sin conexión'); return reply(url) })
  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'admin-login' }); tree = render()
  await find(tree, 'AdminLogin').props.onLogin('admin@synapse-militaria.cl', 'admin123'); tree = render()
  const confirm = t.mock.method(window, 'confirm', () => { throw new Error('No debe pedir confirmación') })
  reachable = true
  await find(tree, 'aside').props.children[1].props.onClick(); tree = render()
  assert.equal(confirm.mock.callCount(), 0)
  assert.equal(find(tree, 'AdminLogin').props.mode, 'online')
})
