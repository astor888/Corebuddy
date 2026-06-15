// MiniBuddy GitHub MCP Server — uses PAT to call GitHub REST API
// Zero dependency, JSON-RPC over stdio
// Usage: node github-mcp-server.js
const readline = require('readline')
const https = require('https')

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || ''
if (!GITHUB_TOKEN) {
  process.stderr.write('[github-mcp] ERROR: No GitHub token in env\n')
}

function gh(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MiniBuddy-GitHub-MCP/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
    const req = https.request(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(d)
          if (res.statusCode && res.statusCode >= 400) {
            resolve(`GitHub API error (${res.statusCode}): ${json.message || d}`)
          } else {
            resolve(json)
          }
        } catch { resolve(d) }
      })
    })
    req.on('error', e => resolve(`Request error: ${e.message}`))
    req.end()
  })
}

const tools = [
  { name: 'get_user', description: '获取当前登录用户信息', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_repos', description: '列出你的 GitHub 仓库', inputSchema: { type: 'object', properties: { sort: { type: 'string', description: '排序方式：created/updated/pushed/full_name' } } } },
  { name: 'get_repo', description: '获取指定仓库信息', inputSchema: { type: 'object', properties: { owner: { type: 'string', description: '仓库拥有者' }, repo: { type: 'string', description: '仓库名' } }, required: ['owner', 'repo'] } },
  { name: 'list_issues', description: '列出仓库的 Issues', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', description: 'open/closed/all' } }, required: ['owner', 'repo'] } },
  { name: 'list_prs', description: '列出仓库的 Pull Requests', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', description: 'open/closed/all' } }, required: ['owner', 'repo'] } },
  { name: 'get_ratelimit', description: '查看 GitHub API 速率限制', inputSchema: { type: 'object', properties: {} } },
]

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  try {
    const req = JSON.parse(line)
    if (!req.jsonrpc || !req.method) return

    let result
    switch (req.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'MiniBuddy-GitHub-MCP', version: '1.0.0' } }
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
            case 'get_user':
              data = await gh('/user')
              content = data.login ? `用户: ${data.login} (${data.name || 'N/A'})\n关注: ${data.following}\n粉丝: ${data.followers}\n仓库: ${data.public_repos}` : JSON.stringify(data)
              break
            case 'list_repos':
              data = await gh(`/user/repos?sort=${args.sort || 'updated'}&per_page=20`)
              if (Array.isArray(data)) {
                content = `仓库列表 (${data.length}):\n${data.map(r => `  ${r.full_name} - ${r.description || '(无描述)'} [${r.stargazers_count}⭐ ${r.language || ''}]`).join('\n')}`
              } else { content = JSON.stringify(data) }
              break
            case 'get_repo':
              data = await gh(`/repos/${args.owner}/${args.repo}`)
              content = data.full_name ? `${data.full_name}\n${data.description || ''}\n⭐ ${data.stargazers_count}  🍴 ${data.forks_count}\n语言: ${data.language || 'N/A'}\n${data.html_url}` : JSON.stringify(data)
              break
            case 'list_issues':
              data = await gh(`/repos/${args.owner}/${args.repo}/issues?state=${args.state || 'open'}&per_page=20`)
              if (Array.isArray(data)) {
                content = `Issues (${data.filter(i=>!i.pull_request).length}):\n${data.filter(i=>!i.pull_request).map(i => `  #${i.number} ${i.title} [${i.state}] ${i.user.login}`).join('\n')}`
              } else { content = JSON.stringify(data) }
              break
            case 'list_prs':
              data = await gh(`/repos/${args.owner}/${args.repo}/pulls?state=${args.state || 'open'}&per_page=20`)
              if (Array.isArray(data)) {
                content = `PRs (${data.length}):\n${data.map(p => `  #${p.number} ${p.title} [${p.state}] ${p.user.login}`).join('\n')}`
              } else { content = JSON.stringify(data) }
              break
            case 'get_ratelimit':
              data = await gh('/rate_limit')
              const core = data.resources?.core
              content = core ? `API 限额: ${core.remaining}/${core.limit} 剩余, 重置时间: ${new Date(core.reset * 1000).toLocaleString('zh-CN')}` : JSON.stringify(data)
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
process.stderr.write('[github-mcp] Server ready, PAT=' + (GITHUB_TOKEN ? 'yes' : 'NO') + '\n')
