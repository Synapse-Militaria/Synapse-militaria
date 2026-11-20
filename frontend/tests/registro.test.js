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

test('en modo online onRegister envía POST a /auth/registro sin rol, inicia sesión como Usuario y navega al inicio', async t => {
  let registerRequest = null
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/auth/registro')) {
      registerRequest = { url, options }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            token: 'token-simulado',
            email: 'nueva@ejemplo.cl',
            nombre: 'María',
            rol: 'Usuario',
            expiresAt: Date.now() + 60_000,
          },
        }),
      }
    }
    return { ok: true, json: async () => ({ data: [] }) }
  })

  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'register' }); tree = render()
  await find(tree, 'Register').props.onRegister('María', 'nueva@ejemplo.cl', 'clave-segura-1234')
  tree = render()

  assert.ok(registerRequest)
  assert.equal(registerRequest.options.method, 'POST')
  const body = JSON.parse(registerRequest.options.body)
  assert.deepEqual(body, { nombre: 'María', email: 'nueva@ejemplo.cl', password: 'clave-segura-1234' })
  assert.equal('rol' in body, false)
  assert.ok(find(tree, 'Home'))
  assert.equal(find(tree, 'Nav').props.isAdmin, false)
  assert.equal(find(tree, 'Nav').props.session.nombre, 'María')
  assert.equal(find(tree, 'Nav').props.session.rol, 'Usuario')
})

test('si la API responde 409 onRegister falla con ese mensaje y no crea la sesión', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('/auth/registro')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({ message: 'Ya existe una cuenta con ese correo.' }),
      }
    }
    return { ok: true, json: async () => ({ data: [] }) }
  })

  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'register' }); tree = render()
  await assert.rejects(
    find(tree, 'Register').props.onRegister('María', 'duplicado@ejemplo.cl', 'clave-segura-1234'),
    /Ya existe una cuenta con ese correo\./,
  )
  tree = render()

  assert.equal(find(tree, 'Nav').props.session, null)
  assert.equal(find(tree, 'Nav').props.isAdmin, false)
  assert.ok(find(tree, 'Register'))
})

test('en modo demo onRegister falla por falta de conexión y no llama a /auth/registro', async t => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url))
    throw new Error('Sin conexión')
  })

  const render = mount(t)
  render(); await settle()
  let tree = render()
  find(tree, 'Home').props.navigate({ view: 'register' }); tree = render()
  await assert.rejects(
    find(tree, 'Register').props.onRegister('María', 'nueva@ejemplo.cl', 'clave-segura-1234'),
    /No hay conexión con el servidor/,
  )
  tree = render()

  assert.equal(urls.some(url => url.endsWith('/auth/registro')), false)
  assert.equal(find(tree, 'Nav').props.session, null)
})
