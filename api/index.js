import { handleApiRequest } from '../server/index.js'

export const config = {
  api: { bodyParser: false },
}

function restoreRewrittenApiPath(req) {
  const requestUrl = new URL(req.url || '/api', `http://${req.headers.host || 'localhost'}`)
  const apiPath = requestUrl.searchParams.get('__skillbridge_path')
  if (apiPath !== null) {
    requestUrl.pathname = `/api/${apiPath.replace(/^\/+/, '')}`
    requestUrl.searchParams.delete('__skillbridge_path')
    req.url = `${requestUrl.pathname}${requestUrl.search}`
  }
}

export default async function handleVercelRequest(req, res) {
  restoreRewrittenApiPath(req)
  if (req.url === '/api/health' || req.url.startsWith('/api/health?')) {
    req.url = req.url.replace(/^\/api\/health/, '/health')
  }

  try {
    await handleApiRequest(req, res)
  } catch (error) {
    console.error('[api] Unhandled Vercel function request failure.', {
      requestId: req.skillbridgeRequestId,
      errorName: error?.name || 'Error',
      errorCode: typeof error?.code === 'string' && /^[A-Z0-9_-]{2,40}$/i.test(error.code)
        ? error.code
        : undefined,
    })
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        ok: false,
        error: 'Unable to process your request right now.',
        statusCode: 500,
      }))
    }
  }
}
