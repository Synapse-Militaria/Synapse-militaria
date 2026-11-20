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

function mockOnlineFetch(t, loginData) {
  return t.mock.method(globalThis, 'fetch', async url => ({
    ok: true,
    json: async () => ({
      data: String(url).endsWith('/auth/login') ? loginData : [],
    }),
  }))
}

test('en modo online un login con rol Usuario va al inicio, Nav recibe isAdmin false y no muestra AdminDashboard al navegar a admin', async t => {
  mockOnlineFetch(t, {
    token: 'token-simulado',
    email: 'usuario@ejemplo.cl',
    nombre: 'Juan',
    rol: 'Usuario',
    expiresAt: Date.now() + 60_000,
  })
  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'login' }); tree = render()
  await find(tree, 'AdminLogin').props.onLogin('usuario@ejemplo.cl', 'clave-de-prueba')
  tree = render()

  assert.ok(find(tree, 'Home'))
  assert.equal(find(tree, 'AdminDashboard'), undefined)
  assert.equal(find(tree, 'Nav').props.isAdmin, false)
  assert.equal(find(tree, 'Nav').props.session.nombre, 'Juan')
  assert.equal(find(tree, 'Nav').props.session.rol, 'Usuario')

  find(tree, 'Nav').props.navigate({ view: 'admin' }); tree = render()
  assert.equal(find(tree, 'AdminDashboard'), undefined)
  assert.equal(find(tree, 'AdminLogin'), undefined)
  assert.equal(find(tree, 'Nav').props.isAdmin, false)
  assert.equal(find(tree, 'h1').props.children, 'Tu cuenta no tiene permisos de administración')
})

test('en modo online un login con rol Administrador abre AdminDashboard y Nav recibe isAdmin true', async t => {
  mockOnlineFetch(t, {
    token: 'token-simulado',
    email: 'admin@ejemplo.cl',
    nombre: 'Ana',
    rol: 'Administrador',
    expiresAt: Date.now() + 60_000,
  })
  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'login' }); tree = render()
  await find(tree, 'AdminLogin').props.onLogin('admin@ejemplo.cl', 'clave-de-prueba')
  tree = render()

  assert.ok(find(tree, 'AdminDashboard'))
  assert.equal(find(tree, 'Nav').props.isAdmin, true)
  assert.equal(find(tree, 'Nav').props.session.nombre, 'Ana')
  assert.equal(find(tree, 'Nav').props.session.rol, 'Administrador')
})

test('el modo demostración sigue abriendo el panel con rol Administrador', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Sin conexión') })
  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'login' }); tree = render()
  find(tree, 'AdminLogin').props.onDemoLogin(); tree = render()

  assert.ok(find(tree, 'AdminDashboard'))
  assert.equal(find(tree, 'Nav').props.isAdmin, true)
  assert.equal(find(tree, 'Nav').props.session.nombre, 'Modo demostración')
  assert.equal(find(tree, 'Nav').props.session.rol, 'Administrador')
})
