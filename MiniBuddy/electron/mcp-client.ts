// MCP Client — Model Context Protocol support
// Connects to MCP servers via stdio, discovers tools, registers them in CoreBuddy
// Config stored in {userData}/corebuddy-mcp.json

import path from 'path'
import fs from 'fs'
import { spawn, fork } from 'child_process'
import { app } from 'electron'
import { registerTool, Tool } from './tool-registry'
import { getTestMcpTools, getGithubMcpTools, getFeishuMcpTools } from './builtin-mcp'

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

interface McpConfig {
  servers: Record<string, McpServerConfig>
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: any
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: { code: number; message: string }
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, any>
    required?: string[]
  }
}

const MCP_CONFIG = () => path.join(app.getPath('userData'), 'corebuddy-mcp.json')
const CONNECT_TIMEOUT = 10000  // 10s timeout — fast fail for UX

// Connection status tracking
type ServerStatus = 'connected' | 'disconnected' | 'connecting' | 'error'
const serverStatus: Record<string, ServerStatus> = {}
const serverTools: Record<string, McpTool[]> = {}

export function getServerStatus(name: string): ServerStatus {
  if (name === 'local-system') return 'builtin'
  return serverStatus[name] || 'disconnected'
}

export function getAllServerStatus(): Record<string, ServerStatus> {
  return { 'local-system': 'builtin' as ServerStatus, ...serverStatus }
}

export function getServerTools(name: string): McpTool[] {
  return serverTools[name] || []
}

function loadMcpConfig(): McpConfig {
  try {
    if (fs.existsSync(MCP_CONFIG())) {
      return JSON.parse(fs.readFileSync(MCP_CONFIG(), 'utf-8'))
    }
  } catch {}
  return { servers: {} }
}

/** Get MCP config (for UI/CLI display, not direct file access) */
export function getMcpServers(): McpConfig {
  return loadMcpConfig()
}

/** Save MCP config */
export function saveMcpConfig(config: McpConfig) {
  fs.writeFileSync(MCP_CONFIG(), JSON.stringify(config, null, 2))
}

/**
 * Connect to all configured MCP servers and register their tools.
 * Called at startup.
 */
export async function connectAllMcpServers(): Promise<string[]> {
  const config = loadMcpConfig()
  const connected: string[] = []

  for (const [name, server] of Object.entries(config.servers)) {
    if (server.enabled === false) {
      serverStatus[name] = 'disconnected'
      continue
    }
    connected.push(await connectOneMcpServer(name, server))
  }

  return connected
}

/** Connect a single MCP server — built-in or external */
export async function connectOneMcpServer(
  name: string,
  server: McpServerConfig
): Promise<string> {
  serverStatus[name] = 'connecting'

  // Resolve relative paths in args to resourcesPath (for bundled extraResources)
  const resolved = resolveServerArgs(server)

  // Built-in MCP servers: no subprocess, instant connection
  const builtinMap: Record<string, (env?: Record<string, string>) => McpTool[]> = {
    'test-mcp': getTestMcpTools,
    'github': getGithubMcpTools,
    'feishu': getFeishuMcpTools,
  }

  try {
    let tools: McpTool[]

    if (builtinMap[name]) {
      // Built-in: register tools directly from the main process
      tools = builtinMap[name](resolved.env || {})
    } else {
      // External: spawn subprocess via fork/spawn
      tools = await connectMcpServer(name, resolved)
    }

    serverTools[name] = tools
    for (const tool of tools) {
      registerBuiltinMcpTool(name, tool)
    }
    serverStatus[name] = 'connected'
    console.log(`MCP connected: ${name}, ${tools.length} tools`)
    return `${name} (${tools.length} tools)`
  } catch (e: any) {
    serverStatus[name] = 'error'
    serverTools[name] = []
    console.error(`MCP connection failed: ${name}: ${e.message}`)
    return `${name} (连接失败: ${e.message})`
  }
}

/** Resolve relative .js paths in args to resourcesPath (where extraResources live) */
function resolveServerArgs(server: McpServerConfig): McpServerConfig {
  if (!server.args || server.args.length === 0) return server
  const resolved = server.args.map(arg => {
    if (arg.endsWith('.js') && !arg.startsWith('/') && !arg.match(/^[A-Za-z]:/)) {
      return path.join(process.resourcesPath, arg)
    }
    return arg
  })
  return { ...server, args: resolved }
}

/** Register a built-in MCP tool (no subprocess needed) */
function registerBuiltinMcpTool(serverName: string, mcpTool: McpTool & { handler: (args: any) => Promise<string> }) {
  const fullName = `mcp_${serverName}_${mcpTool.name}`
  const tool: Tool = {
    name: fullName,
    description: `[MCP:${serverName}] ${mcpTool.description || mcpTool.name}`,
    parameters: buildParamsFromSchema(mcpTool.inputSchema),
    permission: 3,
    parallelSafe: true,
    execute: async (params) => {
      try {
        return await mcpTool.handler(params)
      } catch (e: any) {
        return `工具调用失败: ${e.message}`
      }
    },
  }
  registerTool(tool)
}

/** Disconnect a server (mark as disconnected) */
export function disconnectMcpServer(name: string) {
  serverStatus[name] = 'disconnected'
}

/** Add or update a server config and optionally connect */
export async function updateMcpServer(name: string, config: McpServerConfig & { connect?: boolean }) {
  const cfg = loadMcpConfig()
  const { connect, ...serverConfig } = config
  cfg.servers[name] = serverConfig
  saveMcpConfig(cfg)
  if (connect) {
    await connectOneMcpServer(name, serverConfig)
  }
}

/** Remove a server from config */
export function removeMcpServer(name: string) {
  const cfg = loadMcpConfig()
  delete cfg.servers[name]
  saveMcpConfig(cfg)
  serverStatus[name] = 'disconnected'
}

/**
 * Connect to a single MCP server via stdio and discover its tools.
 */
async function connectMcpServer(
  name: string,
  config: McpServerConfig
): Promise<McpTool[]> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...(config.env || {}) }
    const scriptPath = config.args?.[0]
    const isJsFile = scriptPath?.endsWith('.js')
    
    let proc: any
    if (isJsFile) {
      // fork() is faster and always finds the right Node binary
      proc = fork(scriptPath, [], { env, stdio: ['pipe', 'pipe', 'pipe'], cwd: config.cwd || process.cwd() })
    } else {
      proc = spawn(config.command, config.args || [], { env, cwd: config.cwd || process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] })
    }

    const tools: McpTool[] = []
    let buffer = ''
    let initialized = false
    let requestId = 0
    const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
    let connectTimeout: NodeJS.Timeout

    const sendRequest = (method: string, params?: any): Promise<any> => {
      return new Promise((res, rej) => {
        const id = ++requestId
        pendingRequests.set(id, { resolve: res, reject: rej })
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
        proc.stdin?.write(JSON.stringify(req) + '\n')
      })
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg: JsonRpcResponse = JSON.parse(line)

          // Handle notifications (no id)
          if (msg.id === undefined) continue

          const pending = pendingRequests.get(msg.id)
          if (!pending) continue
          pendingRequests.delete(msg.id)

          if (msg.error) {
            pending.reject(new Error(msg.error.message))
          } else {
            pending.resolve(msg.result)
          }
        } catch {}
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      console.error(`MCP [${name}] stderr:`, chunk.toString().slice(0, 200))
    })

    proc.on('error', (err) => {
      clearTimeout(connectTimeout)
      for (const [, p] of pendingRequests) p.reject(err)
      reject(err)
    })

    proc.on('exit', (code) => {
      clearTimeout(connectTimeout)
      if (!initialized) {
        reject(new Error(`MCP server exited with code ${code}`))
      }
    })

    // Connection timeout
    connectTimeout = setTimeout(() => {
      proc.kill()
      for (const [, p] of pendingRequests) p.reject(new Error('Connection timeout'))
      reject(new Error('MCP server connection timeout'))
    }, CONNECT_TIMEOUT)

    // Run MCP handshake
    ;(async () => {
      try {
        // 1. Initialize
        const initResult = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'CoreBuddy', version: '1.0.0' },
        })
        initialized = true
        clearTimeout(connectTimeout)

        // 2. Send initialized notification
        proc.stdin?.write(JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }) + '\n')

        // 3. List tools
        const toolsResult = await sendRequest('tools/list')
        const discovered = toolsResult?.tools || []
        
        for (const t of discovered) {
          if (t.name && typeof t.name === 'string') {
            tools.push(t)
          }
        }

        resolve(tools)
      } catch (e: any) {
        proc.kill()
        reject(e)
      }
    })()
  })
}

/**
 * Register an MCP server's tool in CoreBuddy's tool registry.
 */
function registerMcpTool(serverName: string, mcpTool: McpTool) {
  const fullName = `mcp_${serverName}_${mcpTool.name}`

  const tool: Tool = {
    name: fullName,
    description: `[MCP:${serverName}] ${mcpTool.description || mcpTool.name}`,
    parameters: buildParamsFromSchema(mcpTool.inputSchema),
    permission: 3, // MCP tools default to L3 (moderate)
    parallelSafe: false,
    execute: async (params) => {
      // We need a persistent connection for tool calls.
      // For now, spawn a new connection for each call.
      // In production, keep connections alive.
      const config = loadMcpConfig()
      const server = config.servers[serverName]
      if (!server) return `MCP server "${serverName}" not configured`

      return new Promise((resolve) => {
        const env = { ...process.env, ...(server.env || {}) }
        const scriptPath = server.args?.[0]
        let tproc: any
        if (scriptPath?.endsWith('.js')) {
          tproc = fork(scriptPath, [], { env, stdio: ['pipe', 'pipe', 'pipe'], cwd: server.cwd || process.cwd() })
        } else {
          tproc = spawn(server.command, server.args || [], { env, cwd: server.cwd || process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] })
        }

        let buffer = ''
        let requestId = 0

        const sendRequest = (method: string, rpcParams?: any): Promise<any> => {
          return new Promise((res, rej) => {
            const id = ++requestId
            const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params: rpcParams }
            tproc.stdin?.write(JSON.stringify(req) + '\n')
            const timeout = setTimeout(() => {
              tproc.kill()
              rej(new Error('Tool call timeout'))
            }, 30000)

            const onData = (chunk: Buffer) => {
              buffer += chunk.toString()
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                if (!line.trim()) continue
                try {
                  const msg: JsonRpcResponse = JSON.parse(line)
                  if (msg.id === id) {
                    clearTimeout(timeout)
                    tproc.stdout?.removeListener('data', onData)
                    if (msg.error) rej(new Error(msg.error.message))
                    else res(msg.result)
                  }
                } catch {}
              }
            }
            tproc.stdout?.on('data', onData)
          })
        }

        ;(async () => {
          try {
            await sendRequest('initialize', {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              clientInfo: { name: 'CoreBuddy', version: '1.0.0' },
            })
            tproc.stdin?.write(JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            }) + '\n')
            const result = await sendRequest('tools/call', {
              name: mcpTool.name,
              arguments: params || {},
            })
            tproc.kill()
            resolve(JSON.stringify(result, null, 2))
          } catch (e: any) {
            tproc.kill()
            resolve(`MCP tool call failed: ${e.message}`)
          }
        })()
      })
    },
  }

  registerTool(tool)
}

function buildParamsFromSchema(schema: any): Record<string, string> {
  if (!schema || !schema.properties) return {}
  const params: Record<string, string> = {}
  for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
    params[key] = prop.description || prop.type || 'string'
  }
  return params
}
