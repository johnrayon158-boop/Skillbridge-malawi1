import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import process from 'node:process'
import test from 'node:test'

process.env.VERCEL = '1'
process.env.NODE_ENV = 'test'
process.env.VERCEL_URL = 'skillbridge-test.vercel.app'

const { default: handleVercelRequest } = await import('../api/index.js')

test('Vercel shared API function routes nested Career Assistant endpoints', async (context) => {
  const server = http.createServer((req, res) => {
    void handleVercelRequest(req, res)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const health = await fetch(`${baseUrl}/api?__skillbridge_path=health`, {
    headers: {
      Origin: 'https://skillbridge-test.vercel.app',
      'X-SkillBridge-Request-Id': 'SB-VERCEL-TEST',
    },
  })
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://skillbridge-test.vercel.app')
  assert.equal(health.headers.get('x-skillbridge-request-id'), 'SB-VERCEL-TEST')
  assert.equal((await health.json()).data.status, 'ok')

  const chat = await fetch(`${baseUrl}/api?__skillbridge_path=ai/career-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello' }),
  })
  assert.equal(chat.status, 401)
  assert.match(chat.headers.get('x-skillbridge-request-id'), /^SB-[A-Z0-9-]+$/)

  const history = await fetch(`${baseUrl}/api?__skillbridge_path=ai/career-chat/conversations&studentId=student-1`)
  assert.equal(history.status, 401)

  const recommendations = await fetch(`${baseUrl}/api?__skillbridge_path=ai/career-recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(recommendations.status, 401)

  const unknown = await fetch(`${baseUrl}/api?__skillbridge_path=__unknown`)
  assert.equal(unknown.status, 404)
})
