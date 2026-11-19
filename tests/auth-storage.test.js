import assert from 'node:assert/strict'
import test from 'node:test'
import { createRememberMeStorage } from '../src/utils/authStorage.js'

function createStorage() {
  const values = new Map()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

test('remember me stores sessions in local storage', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  const storage = createRememberMeStorage({ localStorage, sessionStorage })
  storage.setRememberMe(true)
  storage.setItem('auth-token', 'remembered')

  assert.equal(localStorage.getItem('auth-token'), 'remembered')
  assert.equal(sessionStorage.getItem('auth-token'), null)
})

test('unchecked remember me stores only in session storage', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  const storage = createRememberMeStorage({ localStorage, sessionStorage })
  storage.setRememberMe(false)
  storage.setItem('auth-token', 'temporary')

  assert.equal(sessionStorage.getItem('auth-token'), 'temporary')
  assert.equal(localStorage.getItem('auth-token'), null)
})

test('session reads fall back to existing local sessions and sign-out clears both stores', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  const storage = createRememberMeStorage({ localStorage, sessionStorage })
  localStorage.setItem('auth-token', 'previous')
  storage.setRememberMe(false)
  assert.equal(storage.getItem('auth-token'), 'previous')

  sessionStorage.setItem('auth-token', 'current')
  assert.equal(storage.getItem('auth-token'), 'current')
  storage.removeItem('auth-token')
  assert.equal(localStorage.getItem('auth-token'), null)
  assert.equal(sessionStorage.getItem('auth-token'), null)
})

test('switching a session to temporary storage removes its previous persistent copy', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  const storage = createRememberMeStorage({ localStorage, sessionStorage })
  storage.setItem('auth-token', 'persistent')
  storage.setRememberMe(false)
  storage.setItem('auth-token', 'temporary')

  assert.equal(localStorage.getItem('auth-token'), null)
  assert.equal(sessionStorage.getItem('auth-token'), 'temporary')
})

test('a restored temporary session stays temporary when the auth client refreshes it', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  sessionStorage.setItem('auth-token', 'restored')
  const storage = createRememberMeStorage({ localStorage, sessionStorage })

  assert.equal(storage.getItem('auth-token'), 'restored')
  storage.setItem('auth-token', 'refreshed')

  assert.equal(sessionStorage.getItem('auth-token'), 'refreshed')
  assert.equal(localStorage.getItem('auth-token'), null)
})
