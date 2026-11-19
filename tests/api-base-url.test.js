import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveApiBaseUrl } from '../src/utils/apiBaseUrl.js'

const browserLocation = {
  origin: 'https://app.example.test',
  protocol: 'https:',
  hostname: 'app.example.test',
}

test('configured API base takes precedence and removes trailing slashes', () => {
  assert.equal(resolveApiBaseUrl({
    apiBaseUrl: 'https://api.example.test/',
    aiApiUrl: 'https://legacy.example.test',
    location: browserLocation,
  }), 'https://api.example.test')
})

test('development API fallback uses the same origin for Vite proxying', () => {
  assert.equal(resolveApiBaseUrl({
    isDevelopment: true,
    location: { protocol: 'http:', hostname: '192.168.1.20', origin: 'http://192.168.1.20:5173' },
  }), 'http://192.168.1.20:5173')
})

test('development uses the Vite proxy even when a production API URL is configured', () => {
  assert.equal(resolveApiBaseUrl({
    apiBaseUrl: 'https://api.example.test',
    isDevelopment: true,
    location: { protocol: 'http:', hostname: '192.168.1.20', origin: 'http://192.168.1.20:5173' },
  }), 'http://192.168.1.20:5173')
})

test('production uses the documented same-origin API route and never localhost', () => {
  assert.equal(resolveApiBaseUrl({ location: browserLocation }), browserLocation.origin)
  assert.equal(resolveApiBaseUrl({
    apiBaseUrl: 'http://localhost:4000',
    location: browserLocation,
  }), '')
})

test('production rejects insecure API URLs and accepts the legacy configured URL', () => {
  assert.equal(resolveApiBaseUrl({
    apiBaseUrl: 'http://api.example.test',
    location: browserLocation,
  }), '')
  assert.equal(resolveApiBaseUrl({
    aiApiUrl: 'https://api.example.test/',
    location: browserLocation,
  }), 'https://api.example.test')
})
