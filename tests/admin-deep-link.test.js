import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, preview } from 'vite'

const projectRoot = path.resolve(import.meta.dirname, '..')
const adminPaths = [
  '/admin',
  '/admin/users',
  '/admin/jobs',
  '/admin/skills',
  '/admin/careers',
  '/admin/assessments',
  '/admin/learning',
  '/admin/analytics',
  '/admin/settings',
]

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

test('Cloudflare admin rewrites support direct navigation and refresh without capturing APIs or assets', async () => {
  const redirectRules = await readFile(path.join(projectRoot, 'public', '_redirects'), 'utf8')
  assert.match(redirectRules, /^\/admin \/index\.html 200$/m)
  assert.match(redirectRules, /^\/admin\/\* \/index\.html 200$/m)
  assert.doesNotMatch(redirectRules, /^\/(?:\*|api\/\*)\s/m)

  const routesSource = await readFile(path.join(projectRoot, 'src', 'routes', 'AppRoutes.jsx'), 'utf8')
  for (const route of adminPaths.slice(1)) {
    assert.ok(
      routesSource.includes(`<Route path="${route}" element={<RoleRoute allowedRoles={['admin']}>`),
      `${route} should remain protected by the admin role route`,
    )
  }
  assert.ok(routesSource.includes('<Route path="/admin" element={<RoleRoute allowedRoles={'))

  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'skillbridge-admin-routing-'))
  let server
  try {
    await build({
      configFile: path.join(projectRoot, 'vite.config.js'),
      root: projectRoot,
      build: { outDir: outputDirectory, emptyOutDir: true },
    })
    assert.equal(await readFile(path.join(outputDirectory, '_redirects'), 'utf8'), redirectRules)

    const port = await getAvailablePort()
    server = await preview({
      configFile: path.join(projectRoot, 'vite.config.js'),
      root: projectRoot,
      preview: { host: '127.0.0.1', port, strictPort: true },
      build: { outDir: outputDirectory },
    })

    const baseUrl = `http://127.0.0.1:${port}`
    let appHtml
    for (const route of adminPaths) {
      for (let request = 0; request < 2; request += 1) {
        const response = await fetch(`${baseUrl}${route}`, { headers: { Accept: 'text/html' } })
        assert.equal(response.status, 200, `${route} should load on request ${request + 1}`)
        assert.match(response.headers.get('content-type') || '', /text\/html/)
        const html = await response.text()
        assert.match(html, /<div id="root"><\/div>/)
        if (appHtml === undefined) appHtml = html
        else assert.equal(html, appHtml, `${route} should return the SPA entry point on refresh`)
      }
    }

    const apiResponse = await fetch(`${baseUrl}/api/__admin_deep_link_test__`, {
      headers: { Accept: 'application/json' },
    })
    assert.equal(apiResponse.status, 404, 'unknown API paths must not be rewritten to the SPA')
    assert.doesNotMatch(apiResponse.headers.get('content-type') || '', /text\/html/)

    const scriptPath = appHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
    assert.ok(scriptPath, 'built index should reference a JavaScript asset')
    const assetResponse = await fetch(new URL(scriptPath, baseUrl))
    assert.equal(assetResponse.status, 200)
    assert.match(assetResponse.headers.get('content-type') || '', /javascript/)
    assert.doesNotMatch(await assetResponse.text(), /<div id="root"><\/div>/)
  } finally {
    if (server) await new Promise((resolve, reject) => {
      server.httpServer.close((error) => error ? reject(error) : resolve())
    })
    await rm(outputDirectory, { recursive: true, force: true })
  }
})
