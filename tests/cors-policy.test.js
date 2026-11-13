import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { applyCorsPolicy, createCorsPolicy } from '../server/corsPolicy.js'
import { buildSecurityOverview } from '../src/utils/securityOverview.js'

async function createCorsTestServer(policy) {
  const server = http.createServer((req, res) => {
    const result = applyCorsPolicy(req, res, policy)
    if (!result.allowed) {
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: result.message }))
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  }
}

test('production CORS allows an exact configured origin and rejects unapproved origins', async (context) => {
  const policy = createCorsPolicy({
    environment: 'production',
    allowedOrigins: 'https://frontend.example.test',
    developmentOrigins: 'http://localhost:5173',
  })
  const { server, baseUrl } = await createCorsTestServer(policy)
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const approved = await fetch(`${baseUrl}/api/test`, {
    headers: { Origin: 'https://frontend.example.test' },
  })
  assert.equal(approved.status, 200)
  assert.equal(approved.headers.get('access-control-allow-origin'), 'https://frontend.example.test')
  assert.match(approved.headers.get('vary'), /Origin/)
  assert.equal(approved.headers.get('access-control-allow-credentials'), null)

  const rejected = await fetch(`${baseUrl}/api/test`, {
    headers: { Origin: 'https://unapproved.example.test' },
  })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.headers.get('access-control-allow-origin'), null)
})

test('approved preflight returns the supported methods and headers', async (context) => {
  const policy = createCorsPolicy({
    environment: 'production',
    allowedOrigins: 'https://frontend.example.test',
  })
  const { server, baseUrl } = await createCorsTestServer(policy)
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const response = await fetch(`${baseUrl}/api/test`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://frontend.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://frontend.example.test')
  assert.match(response.headers.get('access-control-allow-methods'), /GET, POST, DELETE, OPTIONS/)
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization, Content-Type/)
  assert.match(response.headers.get('vary'), /Access-Control-Request-Headers/)
})

test('preflight rejects unsupported methods and request headers', async (context) => {
  const policy = createCorsPolicy({
    environment: 'production',
    allowedOrigins: 'https://frontend.example.test',
  })
  const { server, baseUrl } = await createCorsTestServer(policy)
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const unsupportedMethod = await fetch(`${baseUrl}/api/test`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://frontend.example.test',
      'Access-Control-Request-Method': 'PUT',
    },
  })
  assert.equal(unsupportedMethod.status, 403)

  const unsupportedHeader = await fetch(`${baseUrl}/api/test`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://frontend.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-unapproved-header',
    },
  })
  assert.equal(unsupportedHeader.status, 403)
})

test('development origins are enabled only in development mode', () => {
  const development = createCorsPolicy({ environment: 'development' })
  const production = createCorsPolicy({ environment: 'production' })

  assert.equal(development.allowsOrigin('http://localhost:5173'), true)
  assert.equal(development.allowsOrigin('http://localhost:5179'), true)
  assert.equal(production.allowsOrigin('http://localhost:5173'), false)
  assert.equal(production.allowsOrigin('https://custom-development.example.test'), false)
  assert.throws(() => createCorsPolicy({
    environment: 'production',
    allowedOrigins: 'https://frontend.example.test/path',
  }), /Invalid CORS origin configuration/)
})

test('security overview displays the runtime CORS configuration', () => {
  const policy = createCorsPolicy({
    environment: 'production',
    allowedOrigins: 'https://frontend.example.test',
  })
  const overview = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    corsConfiguration: policy.publicConfiguration(),
  })
  const cors = overview.checks.find((check) => check.key === 'api')

  assert.equal(cors.status, 'Restricted origin allowlist')
  assert.match(cors.description, /https:\/\/frontend\.example\.test/)
  assert.match(cors.description, /Requests with unapproved Origin headers are rejected/)
})
