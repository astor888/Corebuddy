// MiniBuddy Feishu MCP Server — uses App ID + Secret to call Feishu API
// Zero dependency, JSON-RPC over stdio
// Env: FEISHU_APP_ID, FEISHU_APP_SECRET
const readline = require('readline')
const https = require('https')

const APP_ID = process.env.FEISHU_APP_ID || ''
const APP_SECRET = process.env.FEISHU_APP_SECRET || ''

if (!APP_ID || !APP_SECRET) {
  process.stderr.write('[feishu-mcp] ERROR: FEISHU_APP_ID and FEISHU_APP_SECRET required\n')
}

let tenantToken = ''
let tokenExpire = 0

function feishu(path, method = 'GET', body = null) {
  return request('open.feishu.cn', path, method, body)
}

async function ensureToken() {
  if (tenantToken && Date.now() < tokenExpire) return tenantToken
  const data = await request('open.feishu.cn', '/open-apis/auth/v3/tenant_access_token/internal', 'POST', { app_id: APP_ID, app_secret: APP_SECRET })
  if (data.tenant_access_token) {
    tenantToken = data.tenant_access_token
    tokenExpire = Date.now() + (data.expire || 7200) * 1000 - 60000
    return tenantToken
  }
  throw new Error('Failed to get tenant token: ' + JSON.stringify(data))
}

function request(host, path, method = 'GET', body = null) {
  return new Promise(async (resolve, reject) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' }
    if (!path.includes('/auth/')) {
      try { headers['Authorization'] = `Bearer ${await ensureToken()}` } catch (e) { return reject(e) }
    }
    const opts = { hostname: host, path, method, headers }
    const req = https.request(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch { resolve({ _raw: d }) }
      })
    })
    req.on('error', e => resolve({ error: e.message }))
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

const tools = [
  { name: 'whoami', description: '获取当前飞书应用和租户信息', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_users', description: '列出企业通讯录用户（最多50个）', inputSchema: { type: 'object', properties: { department_id: { type: 'string', description: '部门ID（可选）' } } } },
  { name: 'send_message', description: '给飞书用户发送消息', inputSchema: { type: 'object', properties: { user_id: { type: 'string', description: '用户 open_id' }, content: { type: 'string', description: '消息内容（JSON格式）' } }, required: ['user_id', 'content'] } },
  { name: 'list_docs', description: '列出飞书云文档', inputSchema: { type: 'object', properties: { search_key: { type: 'string', description: '搜索关键词（可选）' } } } },
  { name: 'get_doc', description: '读取飞书文档内容', inputSchema: { type: 'object', properties: { doc_token: { type: 'string', description: '文档token从URL中获取' } }, required: ['doc_token'] } },
  { name: 'get_calendar', description: '查看日历事件', inputSchema: { type: 'object', properties: { days: { type: 'string', description: '查看未来几天（默认7）' } } } },
  { name: 'get_approvals', description: '获取审批列表', inputSchema: { type: 'object', properties: { status: { type: 'string', description: '审批状态：PENDING/APPROVED/REJECTED' } } } },
]

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  try {
    const req = JSON.parse(line)
    if (!req.jsonrpc || !req.method) return

    let result
    switch (req.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'MiniBuddy-Feishu-MCP', version: '1.0.0' } }
        send({ jsonrpc: '2.0', id: req.id, result })
        break
      case 'tools/list':
        result = { tools }
        send({ jsonrpc: '2.0', id: req.id, result })
        break
      case 'tools/call': {
        const { name, arguments: args = {} } = req.params || {}
        let data, content
        try {
          switch (name) {
            case 'whoami':
              data = await feishu('/open-apis/auth/v3/tenant_access_token/internal', 'POST', { app_id: APP_ID, app_secret: APP_SECRET })
              content = data.tenant_access_token ? `飞书应用已连接，租户Token有效期: ${data.expire || 7200}秒` : `认证失败: ${JSON.stringify(data)}`
              break
            case 'list_users':
              data = await feishu(`/open-apis/contact/v3/users?page_size=50${args.department_id ? '&department_id=' + args.department_id : ''}`)
              if (data.data?.items) {
                content = `用户列表 (${data.data.items.length}):\n${data.data.items.map(u => `  ${u.name} (${u.email || u.mobile || 'N/A'}) [${u.department_names?.join(',') || ''}]`).join('\n')}`
              } else { content = `获取用户失败: ${JSON.stringify(data)}` }
              break
            case 'send_message':
              data = await feishu('/open-apis/im/v1/messages?receive_id_type=open_id', 'POST', {
                receive_id: args.user_id,
                msg_type: 'text',
                content: args.content,
              })
              content = data.code === 0 ? '消息发送成功' : `发送失败: ${data.msg || JSON.stringify(data)}`
              break
            case 'list_docs':
              data = await feishu(`/open-apis/drive/v1/files?page_size=20${args.search_key ? '&name=' + encodeURIComponent(args.search_key) : ''}`)
              if (data.data?.files) {
                content = `文档列表 (${data.data.files.length}):\n${data.data.files.map(f => `  ${f.name} (${f.type}) ${f.url || ''}`).join('\n')}`
              } else { content = `获取文档失败: ${JSON.stringify(data)}` }
              break
            case 'get_doc':
              data = await feishu(`/open-apis/docx/v1/documents/${args.doc_token}/raw_content`)
              content = data.data?.content ? `文档内容:\n${JSON.stringify(data.data.content).slice(0, 2000)}` : `获取失败: ${JSON.stringify(data)}`
              break
            case 'get_calendar':
              const days = parseInt(args.days || '7')
              const startTime = Math.floor(Date.now() / 1000)
              const endTime = startTime + days * 86400
              data = await feishu('/open-apis/calendar/v4/calendars/primary/events?page_size=20&start_time=' + startTime + '&end_time=' + endTime)
              if (data.data?.items) {
                content = `日历 (${data.data.items.length}):\n${data.data.items.map(e => `  ${e.summary || '(无标题)'} ${new Date(e.start_time?.timestamp * 1000).toLocaleString('zh-CN')}`).join('\n')}`
              } else { content = `获取日历失败: ${JSON.stringify(data)}` }
              break
            case 'get_approvals':
              data = await feishu('/open-apis/approval/v4/instances?page_size=20')
              if (data.data?.instance_list) {
                content = `审批 (${data.data.instance_list.length}):\n${data.data.instance_list.map(i => `  #${i.instance_code} ${i.approval_name} [${i.status}]`).join('\n')}`
              } else { content = `获取审批失败: ${JSON.stringify(data)}` }
              break
            default:
              content = `未知工具: ${name}`
          }
        } catch (e) {
          content = `调用失败: ${e.message}`
        }
        send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: content }] } })
        break
      }
    }
  } catch {}
})

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
process.stderr.write('[feishu-mcp] Server ready, AppID=' + (APP_ID ? 'yes' : 'NO') + '\n')
