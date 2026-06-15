// Built-in MCP Tools — inline implementation, no subprocess needed
// Eliminates spawn/fork reliability issues for local MCP servers
import https from 'https'

interface McpTool {
  name: string
  description: string
  inputSchema: any
  handler: (args: any) => Promise<string>
}

// ====== Test MCP ======
export function getTestMcpTools(): McpTool[] {
  const fs = require('fs')
  return [
    {
      name: 'get_time', description: '获取当前日期和时间',
      inputSchema: { type: 'object', properties: { timezone: { type: 'string', description: '时区' } } },
      handler: (args) => Promise.resolve(`当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: args.timezone || 'Asia/Shanghai' })} (${args.timezone || 'Asia/Shanghai'})`),
    },
    {
      name: 'echo', description: '回声测试 — 返回你输入的内容',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      handler: (args) => Promise.resolve(`Echo: ${args.message || '(空)'}`),
    },
    {
      name: 'calc', description: '简单四则运算',
      inputSchema: { type: 'object', properties: { expr: { type: 'string' } } },
      handler: async (args) => {
        try {
          const val = Function(`"use strict"; return (${args.expr || '0'})`)()
          return `结果: ${args.expr} = ${val}`
        } catch (e: any) { return `计算错误: ${e.message}` }
      },
    },
    {
      name: 'list_files', description: '列出当前目录的文件',
      inputSchema: { type: 'object', properties: { pattern: { type: 'string' } } },
      handler: (args) => {
        const files = fs.readdirSync(process.cwd())
        const filtered = args.pattern ? files.filter((f: string) => f.includes(args.pattern)) : files
        return Promise.resolve(`文件 (${filtered.length}):\n${filtered.slice(0, 20).join('\n')}`)
      },
    },
    {
      name: 'get_env', description: '获取环境变量',
      inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
      handler: (args) => {
        const v = args.key ? process.env[args.key] : undefined
        return Promise.resolve(v ? `${args.key}=${v}` : `环境变量 ${args.key || '(未指定)'} 未设置`)
      },
    },
  ]
}

// ====== GitHub MCP ======
export function getGithubMcpTools(env: Record<string, string> = {}): McpTool[] {
  const token = env.GITHUB_PERSONAL_ACCESS_TOKEN || env.GITHUB_TOKEN || ''
  
  function gh(path: string, method = 'GET'): Promise<any> {
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.github.com', path, method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CoreBuddy', 'X-GitHub-Api-Version': '2022-11-28' },
      }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => {
          try { const j = JSON.parse(d); resolve(res.statusCode! >= 400 ? `GitHub API (${res.statusCode}): ${j.message || d}` : j) } catch { resolve(d) }
        })
      })
      req.on('error', e => resolve(`Request: ${e.message}`))
      req.end()
    })
  }

  return [
    {
      name: 'get_user', description: '获取当前 GitHub 用户信息', inputSchema: { type: 'object', properties: {} },
      handler: async () => { const d = await gh('/user'); return d.login ? `用户: ${d.login} (${d.name || 'N/A'})\n关注: ${d.following} 粉丝: ${d.followers}\n仓库: ${d.public_repos}` : JSON.stringify(d) },
    },
    {
      name: 'list_repos', description: '列出你的 GitHub 仓库', inputSchema: { type: 'object', properties: { sort: { type: 'string' } } },
      handler: async (args) => {
        const d = await gh(`/user/repos?sort=${args.sort || 'updated'}&per_page=20`)
        return Array.isArray(d) ? `仓库 (${d.length}):\n${d.map((r: any) => `  ${r.full_name} [${r.stargazers_count}⭐]`).join('\n')}` : JSON.stringify(d)
      },
    },
    {
      name: 'list_issues', description: '列出仓库的 Issues', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }, required: ['owner', 'repo'] },
      handler: async (args) => {
        const d = await gh(`/repos/${args.owner}/${args.repo}/issues?state=${args.state || 'open'}&per_page=20`)
        return Array.isArray(d) ? `Issues (${d.filter((i: any) => !i.pull_request).length}):\n${d.filter((i: any) => !i.pull_request).map((i: any) => `  #${i.number} ${i.title} [${i.user.login}]`).join('\n')}` : JSON.stringify(d)
      },
    },
    {
      name: 'list_prs', description: '列出仓库的 Pull Requests', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }, required: ['owner', 'repo'] },
      handler: async (args) => {
        const d = await gh(`/repos/${args.owner}/${args.repo}/pulls?state=${args.state || 'open'}&per_page=20`)
        return Array.isArray(d) ? `PRs (${d.length}):\n${d.map((p: any) => `  #${p.number} ${p.title} [${p.user.login}]`).join('\n')}` : JSON.stringify(d)
      },
    },
  ]
}

// ====== Feishu MCP ======
export function getFeishuMcpTools(env: Record<string, string> = {}): McpTool[] {
  const APP_ID = env.FEISHU_APP_ID || ''
  const APP_SECRET = env.FEISHU_APP_SECRET || ''
  let tenantToken = ''
  let tokenExpire = 0

  function feishu(path: string, method = 'GET', body: any = null): Promise<any> {
    return new Promise(async (resolve) => {
      const headers: any = { 'Content-Type': 'application/json; charset=utf-8' }
      if (!path.includes('/auth/')) {
        try {
          if (!tenantToken || Date.now() >= tokenExpire) {
            const td = await feishu('/open-apis/auth/v3/tenant_access_token/internal', 'POST', { app_id: APP_ID, app_secret: APP_SECRET })
            if (td.tenant_access_token) {
              tenantToken = td.tenant_access_token
              tokenExpire = Date.now() + (td.expire || 7200) * 1000 - 60000
            } else {
              return resolve(`飞书认证失败: ${JSON.stringify(td)}`)
            }
          }
          headers['Authorization'] = `Bearer ${tenantToken}`
        } catch (e: any) { return resolve(`飞书认证异常: ${e.message}`) }
      }
      const req = https.request({ hostname: 'open.feishu.cn', path, method, headers }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve({ _raw: d }) } })
      })
      req.on('error', e => resolve({ error: e.message }))
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }

  return [
    {
      name: 'whoami', description: '获取当前飞书应用和租户信息', inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const d = await feishu('/open-apis/auth/v3/tenant_access_token/internal', 'POST', { app_id: APP_ID, app_secret: APP_SECRET })
        return d.tenant_access_token ? `飞书应用已连接，Token 有效期: ${d.expire || 7200}秒` : `认证失败: ${JSON.stringify(d)}`
      },
    },
    {
      name: 'list_users', description: '列出企业通讯录用户', inputSchema: { type: 'object', properties: { department_id: { type: 'string' } } },
      handler: async (args) => {
        const d = await feishu(`/open-apis/contact/v3/users?page_size=50${args.department_id ? '&department_id=' + args.department_id : ''}`)
        return d.data?.items ? `用户 (${d.data.items.length}):\n${d.data.items.map((u: any) => `  ${u.name}`).join('\n')}` : `获取失败: ${JSON.stringify(d)}`
      },
    },
    {
      name: 'send_message', description: '给飞书用户发送消息', inputSchema: { type: 'object', properties: { user_id: { type: 'string' }, content: { type: 'string' } }, required: ['user_id', 'content'] },
      handler: async (args) => {
        const d = await feishu('/open-apis/im/v1/messages?receive_id_type=open_id', 'POST', { receive_id: args.user_id, msg_type: 'text', content: args.content })
        return d.code === 0 ? '消息发送成功' : `发送失败: ${d.msg || JSON.stringify(d)}`
      },
    },
    {
      name: 'list_docs', description: '列出飞书云文档', inputSchema: { type: 'object', properties: { search_key: { type: 'string' } } },
      handler: async (args) => {
        const d = await feishu(`/open-apis/drive/v1/files?page_size=20${args.search_key ? '&name=' + encodeURIComponent(args.search_key) : ''}`)
        return d.data?.files ? `文档 (${d.data.files.length}):\n${d.data.files.map((f: any) => `  ${f.name} (${f.type})`).join('\n')}` : `获取失败: ${JSON.stringify(d)}`
      },
    },
    {
      name: 'get_doc', description: '读取飞书文档内容', inputSchema: { type: 'object', properties: { doc_token: { type: 'string' } }, required: ['doc_token'] },
      handler: async (args) => {
        const d = await feishu(`/open-apis/docx/v1/documents/${args.doc_token}/raw_content`)
        return d.data?.content ? `文档:\n${JSON.stringify(d.data.content).slice(0, 2000)}` : `获取失败: ${JSON.stringify(d)}`
      },
    },
    {
      name: 'get_calendar', description: '查看日历事件', inputSchema: { type: 'object', properties: { days: { type: 'string' } } },
      handler: async (args) => {
        const days = parseInt(args.days || '7')
        const start = Math.floor(Date.now() / 1000)
        const d = await feishu(`/open-apis/calendar/v4/calendars/primary/events?page_size=20&start_time=${start}&end_time=${start + days * 86400}`)
        return d.data?.items ? `日历 (${d.data.items.length}):\n${d.data.items.map((e: any) => `  ${e.summary || '(无标题)'} ${new Date(e.start_time?.timestamp * 1000).toLocaleString('zh-CN')}`).join('\n')}` : `获取失败: ${JSON.stringify(d)}`
      },
    },
    {
      name: 'get_approvals', description: '获取审批列表', inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
      handler: async () => {
        const d = await feishu('/open-apis/approval/v4/instances?page_size=20')
        return d.data?.instance_list ? `审批 (${d.data.instance_list.length}):\n${d.data.instance_list.map((i: any) => `  #${i.instance_code} ${i.approval_name} [${i.status}]`).join('\n')}` : `获取失败: ${JSON.stringify(d)}`
      },
    },
  ]
}
