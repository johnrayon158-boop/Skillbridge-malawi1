import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function getAvailablePort() {
  const listener = net.createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const { port } = listener.address()
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve())
  })
  return port
}

test('API enforces production CORS, handles preflight, and reports its runtime policy', async (context) => {
  const port = await getAvailablePort()
  const child = spawn(process.execPath, [path.join(projectRoot, 'server', 'index.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AI_API_PORT: String(port),
      CORS_ALLOWED_ORIGINS: 'https://frontend.example.test',
      CORS_DEV_ORIGINS: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  })

  const baseUrl = `http://127.0.0.1:${port}`
  let ready = false
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  assert.equal(ready, true, `API should start successfully. Output: ${output}`)

  const approved = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'https://frontend.example.test' },
  })
  assert.equal(approved.status, 200)
  assert.equal(approved.headers.get('access-control-allow-origin'), 'https://frontend.example.test')
  const health = await approved.json()
  assert.deepEqual(health.data.cors.allowedOrigins, ['https://frontend.example.test'])
  assert.equal(health.data.rateLimiting.enabled, true)
  assert.equal(typeof health.data.rateLimiting.distributed, 'boolean')
  assert.equal(typeof health.data.rateLimiting.operational, 'boolean')

  const rejected = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'https://unapproved.example.test' },
  })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.headers.get('access-control-allow-origin'), null)

  const preflight = await fetch(`${baseUrl}/api/ai/job-match`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://frontend.example.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://frontend.example.test')
  assert.match(preflight.headers.get('access-control-allow-methods'), /GET, POST, DELETE, OPTIONS/)
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization, Content-Type/)
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null)
})

test('API returns 429 with Retry-After after the per-IP chat quota is exceeded', async (context) => {
  const port = await getAvailablePort()
  const child = spawn(process.execPath, [path.join(projectRoot, 'server', 'index.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      RATE_LIMIT_STORAGE: 'memory',
      AI_API_PORT: String(port),
      CORS_DEV_ORIGINS: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  })

  const baseUrl = `http://127.0.0.1:${port}`
  let ready = false
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  assert.equal(ready, true, `API should start successfully. Output: ${output}`)

  let lastResponse
  for (let request = 0; request < 31; request += 1) {
    lastResponse = await fetch(`${baseUrl}/api/ai/career-chat`, { method: 'POST' })
  }
  assert.equal(lastResponse.status, 429)
  assert.ok(Number(lastResponse.headers.get('retry-after')) >= 1)
  assert.equal(lastResponse.headers.get('ratelimit-remaining'), '0')
  const payload = await lastResponse.json()
  assert.equal(payload.statusCode, 429)
  assert.equal(payload.retryAfterSeconds, Number(lastResponse.headers.get('retry-after')))
  assert.doesNotMatch(JSON.stringify(payload), /127\.0\.0\.1|access token|password/i)
})
