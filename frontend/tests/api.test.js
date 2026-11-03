import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from '../src/services/api.js'

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

test('el timeout permite cuatro segundos de latencia y vence a los seis segundos', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const signal = pendingFetch(t)
  const result = request('/armas')
  t.mock.timers.tick(4000)
  assert.equal(signal().aborted, false)
  t.mock.timers.tick(1999)
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
  t.mock.timers.tick(6000)
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
