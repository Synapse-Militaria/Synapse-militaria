import test from 'node:test'
import assert from 'node:assert/strict'
import { request, resolverApiUrl, resolverTimeout } from '../src/services/api.js'

function pendingFetch(t) {
  let signal
  t.mock.method(globalThis, 'fetch', (url, options) => {
    signal = options.signal
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason)
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  })
  return () => signal
}

test('el timeout permite cuatro segundos de latencia y vence a los quince segundos', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const signal = pendingFetch(t)
  const result = request('/armas')
  t.mock.timers.tick(4000)
  assert.equal(signal().aborted, false)
  t.mock.timers.tick(10999)
  assert.equal(signal().aborted, false)
  const rejected = assert.rejects(result, /No se pudo conectar/)
  t.mock.timers.tick(1)
  assert.equal(signal().aborted, true)
  await rejected
})

test('el timeout sigue funcionando cuando hay una señal externa', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const signal = pendingFetch(t)
  const external = new AbortController()
  const result = request('/armas', { signal: external.signal })
  const rejected = assert.rejects(result, /No se pudo conectar/)
  t.mock.timers.tick(15000)
  assert.equal(signal().aborted, true)
  assert.equal(external.signal.aborted, false)
  await rejected
})

test('la cancelación externa aborta la solicitud antes del timeout', async t => {
  const signal = pendingFetch(t)
  const external = new AbortController()
  const result = request('/armas', { signal: external.signal })
  const rejected = assert.rejects(result, error => error.cause?.message === 'Cancelación solicitada')
  external.abort(new Error('Cancelación solicitada'))
  assert.equal(signal().aborted, true)
  await rejected
})

// --- Pruebas de resolverApiUrl ---

test('resolverApiUrl usa VITE_API_URL cuando está definida', () => {
  assert.equal(resolverApiUrl({ VITE_API_URL: 'https://custom.example.com/api' }), 'https://custom.example.com/api')
})

test('resolverApiUrl quita la barra final de VITE_API_URL', () => {
  assert.equal(resolverApiUrl({ VITE_API_URL: 'https://custom.example.com/api/' }), 'https://custom.example.com/api')
})

test('resolverApiUrl devuelve /api en producción sin VITE_API_URL', () => {
  assert.equal(resolverApiUrl({ PROD: true }), '/api')
})

test('resolverApiUrl devuelve localhost en desarrollo sin VITE_API_URL', () => {
  assert.equal(resolverApiUrl({ PROD: false }), 'http://localhost:3000/api')
})

test('resolverApiUrl devuelve localhost con env vacío', () => {
  assert.equal(resolverApiUrl({}), 'http://localhost:3000/api')
})

// --- Pruebas de resolverTimeout ---

test('resolverTimeout devuelve 15000 ms por defecto', () => {
  assert.equal(resolverTimeout({}), 15000)
})

test('resolverTimeout acepta un valor configurado válido', () => {
  assert.equal(resolverTimeout({ VITE_API_TIMEOUT_MS: '8000' }), 8000)
})

test('resolverTimeout ignora valores inválidos y usa el predeterminado', () => {
  assert.equal(resolverTimeout({ VITE_API_TIMEOUT_MS: 'abc' }), 15000)
  assert.equal(resolverTimeout({ VITE_API_TIMEOUT_MS: '0' }), 15000)
  assert.equal(resolverTimeout({ VITE_API_TIMEOUT_MS: '-500' }), 15000)
})
