// OAuth Server for CoreBuddy — local HTTP server + BrowserWindow auth
// Fixed port 12345 for OAuth callback compatibility
import http from 'http'
import https from 'https'
import { BrowserWindow } from 'electron'

interface OAuthConfig {
  authorizeUrl: string
  tokenUrl: string
  clientId?: string
  clientSecret?: string
  scopes: string[]
  extraParams?: Record<string, string>
}

interface OAuthResult {
  accessToken: string
  refreshToken?: string
}

const OAUTH_PORT = 12345
let server: http.Server | null = null
const pendingAuths = new Map<string, { resolve: (r: OAuthResult) => void; reject: (e: Error) => void }>()

export function getOAuthPort(): number {
  return OAUTH_PORT
}

/** Start local OAuth callback server on fixed port */
export function startOAuthServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${OAUTH_PORT}`)
      
      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        
        if (code && state && pendingAuths.has(state)) {
          const pending = pendingAuths.get(state)!
          pendingAuths.delete(state)
          
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:80px;background:#f7f8fa"><h2 style="color:#165DFF">授权成功</h2><p>窗口即将关闭...</p><script>setTimeout(()=>window.close(),1000)</script></body></html>`)
          
          pending.resolve({ accessToken: code })
        } else {
          res.writeHead(400)
          res.end('Invalid callback')
        }
      } else if (url.pathname === '/health') {
        res.writeHead(200)
        res.end('OK')
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      console.log(`OAuth server started on port ${OAUTH_PORT}`)
      resolve(OAUTH_PORT)
    })

    server.on('error', (e: unknown) => {
      if ((e as any).code === 'EADDRINUSE') {
        console.error(`Port ${OAUTH_PORT} in use — trying to recover, closing existing server`)
        try { server?.close() } catch {}
        // Retry once
        setTimeout(() => {
          server?.listen(OAUTH_PORT, '127.0.0.1', () => {
            console.log(`OAuth server started on port ${OAUTH_PORT} (retry)`)
            resolve(OAUTH_PORT)
          })
        }, 500)
      } else {
        reject(e)
      }
    })
  })
}

/** Start OAuth flow for a service */
export async function startOAuthFlow(
  serviceName: string,
  config: OAuthConfig
): Promise<OAuthResult> {
  // Resolve credentials: prefer config, fallback to env vars
  const clientId = config.clientId || process.env.GITHUB_CLIENT_ID || ''
  const clientSecret = config.clientSecret || process.env.GITHUB_CLIENT_SECRET || ''

  if (!clientId || !clientSecret) {
    throw new Error('缺少 OAuth 凭据，请设置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET 环境变量')
  }

  const state = `${serviceName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const redirectUri = `http://localhost:${OAUTH_PORT}/oauth/callback`
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state,
    response_type: 'code',
    ...(config.extraParams || {}),
  })

  const authUrl = `${config.authorizeUrl}?${params.toString()}`

  return new Promise((resolve, reject) => {
    pendingAuths.set(state, { resolve, reject })

    const authWindow = new BrowserWindow({
      width: 800,
      height: 700,
      title: `连接 ${serviceName}`,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    const timeout = setTimeout(() => {
      pendingAuths.delete(state)
      if (!authWindow.isDestroyed()) authWindow.close()
      reject(new Error('授权超时'))
    }, 180000)

    authWindow.on('closed', () => {
      clearTimeout(timeout)
      if (pendingAuths.has(state)) {
        pendingAuths.delete(state)
        reject(new Error('用户取消了授权'))
      }
    })

    authWindow.loadURL(authUrl)

    // Override resolve to exchange code for token
    const originalResolve = pendingAuths.get(state)!.resolve
    pendingAuths.get(state)!.resolve = async (result: OAuthResult) => {
      clearTimeout(timeout)
      if (!authWindow.isDestroyed()) authWindow.close()
      
      try {
        const tokenResult = await exchangeCodeForToken(
          { ...config, _clientId: clientId, _clientSecret: clientSecret },
          result.accessToken,
          redirectUri
        )
        originalResolve(tokenResult)
      } catch (e: unknown) {
        reject(e)
      }
    }
  })
}

/** Exchange authorization code for access token */
async function exchangeCodeForToken(
  config: OAuthConfig & { _clientId: string; _clientSecret: string },
  code: string,
  redirectUri: string
): Promise<OAuthResult> {
  const body = new URLSearchParams({
    client_id: config._clientId,
    client_secret: config._clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString()

  return new Promise((resolve, reject) => {
    const url = new URL(config.tokenUrl)
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.access_token) {
            resolve({ accessToken: json.access_token, refreshToken: json.refresh_token })
          } else {
            reject(new Error(`Token exchange failed: ${data}`))
          }
        } catch {
          reject(new Error(`Token exchange failed: ${data.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export function stopOAuthServer() {
  if (server) {
    server.close()
    server = null
  }
}
