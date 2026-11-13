import assert from 'node:assert/strict'
import test from 'node:test'
import { clearCacheByPrefix, getCachedValue, readThroughCache, setCachedValue } from '../src/utils/performanceCache.js'

test('cached values are reused by read-through requests', async () => {
  const key = `performance-test:${Date.now()}`
  let calls = 0
  const load = async () => {
    calls += 1
    return ['job']
  }

  assert.deepEqual(await readThroughCache(key, load), ['job'])
  assert.deepEqual(await readThroughCache(key, load), ['job'])
  assert.equal(calls, 1)
})

test('cache entries can be invalidated by prefix', () => {
  const prefix = `performance-test:${Date.now()}:`
  setCachedValue(`${prefix}jobs`, ['job'])
  setCachedValue(`${prefix}skills`, ['skill'])

  clearCacheByPrefix(prefix)

  assert.equal(getCachedValue(`${prefix}jobs`), null)
  assert.equal(getCachedValue(`${prefix}skills`), null)
})
