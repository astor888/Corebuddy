// MiniBuddy MCP Test Server — zero dependency, JSON-RPC over stdio
// Usage: node test-mcp-server.js
const readline = require('readline')

const tools = [
  { name: 'get_time', description: '获取当前日期和时间，支持指定时区', inputSchema: { type: 'object', properties: { timezone: { type: 'string', description: '时区，例如 Asia/Shanghai' } } } },
  { name: 'get_env', description: '获取系统环境变量值', inputSchema: { type: 'object', properties: { key: { type: 'string', description: '环境变量名' } } } },
  { name: 'echo', description: '回声测试 — 返回你输入的内容', inputSchema: { type: 'object', properties: { message: { type: 'string', description: '要回声的消息' } } } },
  { name: 'calc', description: '简单四则运算', inputSchema: { type: 'object', properties: { expr: { type: 'string', description: '算术表达式，例如 2+3*4' } } } },
  { name: 'list_files', description: '列出当前目录的文件', inputSchema: { type: 'object', properties: { pattern: { type: 'string', description: '文件名匹配模式（可选）' } } } },
]

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  try {
    const req = JSON.parse(line)
    if (!req.jsonrpc || !req.method) return

    let result
    switch (req.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'MiniBuddy-Test-MCP', version: '1.0.0' } }
        send({ jsonrpc: '2.0', id: req.id, result })
        // After initialize, client expects initialized notification — we don't need to do anything
        break
      case 'tools/list':
        result = { tools }
        send({ jsonrpc: '2.0', id: req.id, result })
        break
      case 'tools/call': {
        const { name, arguments: args = {} } = req.params || {}
        let content
        switch (name) {
          case 'get_time':
            content = `当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: args.timezone || 'Asia/Shanghai' })} (${args.timezone || 'Asia/Shanghai'})`
            break
          case 'get_env':
            content = args.key && process.env[args.key] ? `${args.key}=${process.env[args.key]}` : `环境变量 ${args.key || '(未指定)'} 未设置`
            break
          case 'echo':
            content = `Echo: ${args.message || '(空)'}`
            break
          case 'calc':
            try {
              content = `结果: ${Function('"use strict"; return (' + (args.expr || '0') + ')')()} = ${eval?.(args.expr || '0') ?? 'error'}`
            } catch (e) {
              content = `计算错误: ${e.message}`
            }
            break
          case 'list_files':
            const fs = require('fs')
            const files = fs.readdirSync('.')
            const filtered = args.pattern ? files.filter(f => f.includes(args.pattern)) : files
            content = `文件列表 (${filtered.length}):\n${filtered.slice(0, 20).join('\n')}${filtered.length > 20 ? '\n...' : ''}`
            break
          default:
            content = `未知工具: ${name}`
        }
        send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: content }] } })
        break
      }
    }
  } catch {}
})

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

process.stderr.write('[test-mcp] Server ready, waiting for requests...\n')
