// ── 连接器注册表 ──
// 预装连接器配置系统，类比 WorkBuddy 的 30+ 连接器

export interface ConnectorConfig {
  id: string
  name: string
  description: string
  category: '开发' | '办公协作' | '数据查询' | '云服务' | '法律' | '沟通' | '邮箱' | '项目管理' | '设计创意'
  icon: string
  configSchema: Array<{ key: string; label: string; placeholder: string; type?: 'password' | 'text' }>
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  mcpCommand?: string
  mcpArgs?: string[]
  helpUrl?: string
}

// ── 存储连接器状态（运行时） ──
const connectorStatuses = new Map<string, ConnectorConfig['status']>()

function c(id: string): ConnectorConfig {
  return PRESET_CONNECTORS.find(c => c.id === id)!
}

// ── 30 个预装连接器 ──

const PRESET_CONNECTORS: ConnectorConfig[] = [
  // ======== 开发类 ========
  {
    id: 'github',
    name: 'GitHub',
    description: '代码托管、PR 审查、Issue 管理',
    category: '开发',
    icon: '🔧',
    configSchema: [
      { key: 'token', label: 'GitHub Token', placeholder: 'ghp_xxxxxxxxxx', type: 'password' },
    ],
    status: 'disconnected',
    mcpCommand: 'node',
    mcpArgs: ['github-mcp-server.js'],
    helpUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=CoreBuddy',
  },
  {
    id: 'cnb',
    name: 'CNB',
    description: '腾讯云代码托管',
    category: '开发',
    icon: '☁️',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://cloud.tencent.com/product/cnb',
  },
  {
    id: 'ci-cd',
    name: '智研构建部署',
    description: 'CI/CD 流水线',
    category: '开发',
    icon: '🚀',
    configSchema: [
      { key: 'apiKey', label: 'API Key', placeholder: '请输入 API Key', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://cloud.tencent.com/product/cicd',
  },

  // ======== 办公协作类 ========
  {
    id: 'feishu',
    name: '飞书',
    description: '即时通讯、文档、日历、审批',
    category: '办公协作',
    icon: '📱',
    configSchema: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_xxxxxxxxxxxx' },
      { key: 'appSecret', label: 'App Secret', placeholder: '••••••••••••', type: 'password' },
    ],
    status: 'disconnected',
    mcpCommand: 'node',
    mcpArgs: ['feishu-mcp-server.js'],
    helpUrl: 'https://open.feishu.cn/app',
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    description: '即时通讯、审批',
    category: '办公协作',
    icon: '📱',
    configSchema: [
      { key: 'appKey', label: 'AppKey', placeholder: 'dingxxxxxxxxxxxx' },
      { key: 'appSecret', label: 'AppSecret', placeholder: '••••••••••••', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://open.dingtalk.com',
  },
  {
    id: 'wecom',
    name: '企业微信',
    description: '即时通讯、OA',
    category: '办公协作',
    icon: '💼',
    configSchema: [
      { key: 'corpId', label: 'CorpID', placeholder: 'wwxxxxxxxxxxxx' },
      { key: 'corpSecret', label: 'CorpSecret', placeholder: '••••••••••••', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://work.weixin.qq.com/api/doc',
  },
  {
    id: 'tencent-docs',
    name: '腾讯文档',
    description: '在线文档协作',
    category: '办公协作',
    icon: '📄',
    configSchema: [
      { key: 'cookie', label: 'Cookie', placeholder: '从浏览器控制台复制', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://docs.qq.com',
  },
  {
    id: 'kdocs',
    name: '金山文档',
    description: '在线文档',
    category: '办公协作',
    icon: '📄',
    configSchema: [
      { key: 'apiKey', label: 'API Key', placeholder: '请输入 API Key', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.kdocs.cn/',
  },
  {
    id: 'tencent-cc',
    name: '腾讯企点客服',
    description: '客服系统',
    category: '办公协作',
    icon: '🎧',
    configSchema: [
      { key: 'appId', label: 'App ID', placeholder: '请输入 App ID' },
    ],
    status: 'disconnected',
    helpUrl: 'https://qidian.qq.com/',
  },
  {
    id: 'weisheng-scrm',
    name: '微盛企微管家SCRM',
    description: 'SCRM',
    category: '办公协作',
    icon: '🤝',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://scrm.weishengs.com/',
  },
  {
    id: 'xiaoe-tech',
    name: '小鹅通',
    description: '知识付费',
    category: '办公协作',
    icon: '🎓',
    configSchema: [
      { key: 'appId', label: 'App ID', placeholder: '请输入 App ID' },
      { key: 'appSecret', label: 'App Secret', placeholder: '••••••••••••', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.xiaoe-tech.com/',
  },
  {
    id: 'fuhelper',
    name: '福帮手',
    description: '企业服务',
    category: '办公协作',
    icon: '🛠️',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.fubangshou.com/',
  },

  // ======== 数据查询类 ========
  {
    id: 'tianyancha',
    name: '天眼查',
    description: '企业工商信息查询',
    category: '数据查询',
    icon: '🔍',
    configSchema: [
      { key: 'apiKey', label: 'API Key', placeholder: '请输入 API Key', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.tianyancha.com/',
  },
  {
    id: 'qichacha',
    name: '企查查',
    description: '企业信用查询',
    category: '数据查询',
    icon: '🔍',
    configSchema: [
      { key: 'apiKey', label: 'API Key', placeholder: '请输入 API Key', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.qichacha.com/',
  },
  {
    id: 'tdx',
    name: '通达信',
    description: '股票/金融数据',
    category: '数据查询',
    icon: '📈',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.tdx.com.cn/',
  },
  {
    id: 'pkulaw',
    name: '北大法宝法律',
    description: '法律数据检索',
    category: '数据查询',
    icon: '⚖️',
    configSchema: [
      { key: 'apiKey', label: 'API Key', placeholder: '请输入 API Key', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.pkulaw.com/',
  },
  {
    id: 'huayuanyd',
    name: '华宇元典法律',
    description: '法律智能检索',
    category: '数据查询',
    icon: '⚖️',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.yuandian.com/',
  },
  {
    id: 'ctrip-wenda',
    name: '携程问道',
    description: '旅游出行数据',
    category: '数据查询',
    icon: '✈️',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://wenda.ctrip.com/',
  },

  // ======== 云服务类 ========
  {
    id: 'tencent-cloudbase',
    name: '腾讯云 CloudBase',
    description: '云开发/云托管',
    category: '云服务',
    icon: '☁️',
    configSchema: [
      { key: 'secretId', label: 'SecretId', placeholder: 'AKIDxxxxxxxxxxxx' },
      { key: 'secretKey', label: 'SecretKey', placeholder: '••••••••••••', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://console.cloud.tencent.com/cam/capi',
  },
  {
    id: 'baidu-pan',
    name: '百度网盘',
    description: '个人云存储',
    category: '云服务',
    icon: '💾',
    configSchema: [
      { key: 'accessToken', label: 'Access Token', placeholder: '请输入 Access Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://pan.baidu.com/',
  },
  {
    id: 'tencent-weiyun',
    name: '腾讯微云',
    description: '腾讯云存储',
    category: '云服务',
    icon: '💾',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.weiyun.com/',
  },

  // ======== 邮箱类 ========
  {
    id: 'qq-mail',
    name: 'QQ邮箱',
    description: '邮件收发',
    category: '邮箱',
    icon: '📧',
    configSchema: [
      { key: 'account', label: '邮箱账号', placeholder: 'xxx@qq.com' },
      { key: 'authCode', label: '授权码', placeholder: '16 位授权码', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://mail.qq.com/',
  },
  {
    id: 'netease-mail',
    name: '网易邮箱',
    description: '邮件收发',
    category: '邮箱',
    icon: '📧',
    configSchema: [
      { key: 'account', label: '邮箱账号', placeholder: 'xxx@163.com' },
      { key: 'authCode', label: '授权码', placeholder: '16 位授权码', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://mail.163.com/',
  },

  // ======== 项目管理类 ========
  {
    id: 'tapd',
    name: 'TAPD',
    description: '腾讯敏捷研发管理',
    category: '项目管理',
    icon: '📋',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.tapd.cn/',
  },
  {
    id: 'xiaoshouyi',
    name: '销售易CRM',
    description: '客户关系管理',
    category: '项目管理',
    icon: '👥',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.xiaoshouyi.com/',
  },
  {
    id: 'iwiki',
    name: 'iWiki',
    description: '企业知识库',
    category: '项目管理',
    icon: '📚',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://iwiki.woa.com/',
  },
  {
    id: 'km',
    name: 'KM',
    description: '知识管理',
    category: '项目管理',
    icon: '📚',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
  },
  {
    id: 'lexiang',
    name: '乐享知识库',
    description: '腾讯乐享',
    category: '项目管理',
    icon: '🎉',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://lexiang.tencent.com/',
  },

  // ======== 其他 ========
  {
    id: 'ima-kb',
    name: 'ima知识库',
    description: 'AI 知识库',
    category: '办公协作',
    icon: '🧠',
    configSchema: [
      { key: 'token', label: 'Token', placeholder: '请输入 Token', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://ima.qq.com/',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: '笔记/知识库',
    category: '办公协作',
    icon: '📝',
    configSchema: [
      { key: 'integrationToken', label: 'Integration Token', placeholder: 'ntn_xxxxxxxxxx', type: 'password' },
    ],
    status: 'disconnected',
    helpUrl: 'https://www.notion.so/my-integrations',
  },
]

// ── 辅助函数 ──

export function getAllConnectors(): ConnectorConfig[] {
  return PRESET_CONNECTORS.map(c => ({
    ...c,
    status: connectorStatuses.get(c.id) || 'disconnected',
  }))
}

export function getConnector(id: string): ConnectorConfig | undefined {
  const found = PRESET_CONNECTORS.find(c => c.id === id)
  if (!found) return undefined
  return {
    ...found,
    status: connectorStatuses.get(found.id) || 'disconnected',
  }
}

export function getConnectorCategory(cat: string): ConnectorConfig[] {
  return getAllConnectors().filter(c => c.category === cat)
}

export function getConnectedConnectors(): ConnectorConfig[] {
  return getAllConnectors().filter(c => c.status === 'connected')
}

export function getDisconnectedConnectors(): ConnectorConfig[] {
  return getAllConnectors().filter(c => c.status === 'disconnected')
}

// ── 状态管理 ──

export function setConnectorStatus(id: string, status: ConnectorConfig['status']) {
  connectorStatuses.set(id, status)
}

export function getAllConnectorStatuses(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const c of PRESET_CONNECTORS) {
    result[c.id] = connectorStatuses.get(c.id) || 'disconnected'
  }
  return result
}
