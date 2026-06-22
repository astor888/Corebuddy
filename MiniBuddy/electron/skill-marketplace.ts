// Skill Marketplace — built-in skill catalog with SKILL.md content
// Skills can be installed to {userData}/corebuddy-plugins/ and loaded by plugins.ts

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { loadAllPlugins } from './plugins'

export interface MarketplaceSkill {
  id: string
  name: string
  description: string
  category: '开发' | '办公' | '设计' | '数据分析' | '系统工具'
  author: string
  version: string
  installed: boolean
  skillMd: string
  jsCode?: string
  triggers?: string[]
}

// ─── Built-in Skill Catalog ───

const allSkills: MarketplaceSkill[] = [
  // ========== 开发类 ==========
  {
    id: 'code-review-checklist',
    name: '代码审查检查清单',
    description: '系统性代码审查检查清单，逐项排查常见但容易被遗漏的 bug：导入完整性、前后端字段名匹配、Content-Type 配置、文件上传、错误处理、状态同步、构建验证等。',
    category: '开发',
    author: 'CoreBuddy',
    version: '1.1.0',
    installed: false,
    triggers: ['检查代码', '代码审查', 'review', '代码检查', 'review code'],
    skillMd: `---
name: code-review-checklist
description: 系统性代码审查检查清单。当用户要求检查代码、代码审查、review、有没有问题、检查一下、全面检查、部署前检查等时触发。逐项排查常见但容易被遗漏的 bug：导入完整性、前后端字段名匹配、Content-Type 配置、文件上传、错误处理、状态同步、构建验证等。
type: skill
triggers: [检查代码, 代码审查, review, 代码检查, 审查]
allowed-tools: [Read, Grep, Glob, Bash, PresentFiles]
---

# Code Review Checklist 代码审查检查清单

当用户要求进行代码审查时，必须按照以下清单逐项检查，并输出结构化报告。

## 排查清单

### 1. 导入与依赖完整性
- 所有 import/require 语句引用的模块均已安装
- 检查 tsconfig.json / package.json 中缺失的依赖
- 检查路径别名是否能正确解析（如 @/ 映射）
- 确认 dynamic import 路径正确

### 2. 前后端字段名匹配
- 前端请求参数名与后端接口定义一致
- 后端返回的 JSON key 名与前端解构/访问时的名称一致
- 特别注意大小写（camelCase vs snake_case）
- 检查类型定义文件中的字段名是否匹配

### 3. Content-Type 配置
- 文件上传接口的 Content-Type 是否为 multipart/form-data
- JSON API 的 Content-Type 是否为 application/json
- 确保 axios/fetch 没有覆盖默认 Content-Type
- 检查服务端 body parser 中间件配置

### 4. 文件上传处理
- multer 或类似中间件配置是否正确（路径、大小限制、文件类型过滤）
- 前后端字段名是否一致
- 上传文件的安全检测（类型校验、文件名消毒）
- 文件大小限制前后端是否同步

### 5. 错误处理
- try-catch 是否覆盖了所有异步操作
- API 错误响应是否有统一格式
- 前端是否有 error boundary
- 网络错误、超时是否有兜底处理

### 6. 状态同步
- loading / error / empty / success 四种状态是否都有处理
- 竞态条件：同一接口多次调用时的状态管理
- React hooks 依赖数组是否完整
- 表单重置逻辑

### 7. 构建验证
- TypeScript 编译是否通过（无错误）
- ESLint 是否通过
- 写死的 host/port/config 是否应该放入环境变量
- 生产环境构建配置

## 输出格式

按照以下格式输出审查报告：

\`\`\`
## 代码审查报告：[文件路径]

### ✅ 通过
- [条目1]
- [条目2]

### ⚠️ 警告
- [条目3] — 建议修复

### ❌ 问题
- [条目4] — 必须修复
  - 原因：[说明]
  - 建议：[修复方案]

### 其他建议
- [优化建议]
\`\`\`

## 示例

用户说"帮我 review 一下这段代码"，你应该读取目标文件，逐项检查清单中的项目，输出结构化报告。`,
  },

  {
    id: 'oracle',
    name: '第二模型代码审查',
    description: '使用 Oracle 模式进行跨模型代码审查：将一个模型的输出交给另一个模型审查，发现深层问题和优化机会。',
    category: '开发',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['oracle审查', '第二模型', 'double check', '交叉验证', 'oracle review'],
    skillMd: `---
name: oracle
description: 使用 @steipete/oracle CLI 来将当前 prompt 和相关文件打包发送给第二个模型进行审查。适用于调试、重构、架构审查等场景。
type: skill
triggers: [oracle审查, 第二模型, 交叉验证, oracle review, 双重检查]
allowed-tools: [Read, Grep, Glob, Bash, PresentFiles]
---

# Oracle 第二模型审查指南

当用户需要第二模型交叉验证时，使用此技能。

## 工作流程

1. 确定需要审查的文件和当前 prompt
2. 使用 oracle CLI 打包文件 + prompt 发送给第二个模型
3. 获取审查结果并与用户分享

## 适用场景

- 代码重构前检查可能遗漏的边界情况
- 算法实现正确性验证
- 安全漏洞排查
- 架构设计评审
- API 设计合理性检查

## 使用示例

用户："用 oracle 审查一下这个重构方案"
→ 获取当前上下文中的重构方案文件
→ 运行 oracle 打包进行第二模型审查
→ 返回审查结果和对比分析`,
  },

  {
    id: 'git-helper',
    name: 'Git 操作助手',
    description: 'Git 常用操作助手：提交代码、创建分支、管理 PR、解决冲突等。自动识别当前仓库状态并执行正确的 Git 命令。',
    category: '开发',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['git', '提交', '分支', '合并', 'push', 'pull', 'commit', 'PR'],
    skillMd: `---
name: git-helper
description: Git 操作助手。帮助用户完成常见的 Git 操作：提交代码、分支管理、PR 创建、解决冲突等。
type: skill
triggers: [git, git操作, 提交代码, 创建分支, 合并分支, pull request, pr, 解决冲突, git commit, 推送代码]
allowed-tools: [Bash, Read, Grep]
---

# Git 操作助手

帮助用户完成 Git 相关的常见操作，使用 GUI 化的步骤提示。

## 支持的操作

### 1. 提交代码
- git status → git add → git commit -m "xxx"
- 检查暂存区是否有未跟踪文件
- 生成规范的 commit message

### 2. 分支管理
- 创建新分支（git checkout -b）
- 切换分支
- 删除本地/远程分支
- 分支重命名

### 3. 合并与 PR
- git merge / git rebase
- 解决合并冲突指导
- 创建 PR

### 4. 回退操作
- git reset / git revert
- 撤销暂存区更改

## 使用规范

1. 任何修改前先执行 git status 确认当前状态
2. 提交前检查是否有敏感信息（密码、token、API Key）
3. 提交信息使用中文或英文标签前缀
4. 推送前确认目标分支正确

## 示例

用户："帮我提交这个修改"
→ 运行 git status 检查变更
→ git add 相关文件
→ git commit -m "feat: xxx"
→ 询问是否需要 git push`,
  },

  {
    id: 'api-tester',
    name: 'API 测试与调试',
    description: 'API 接口测试与调试辅助：构建请求、分析响应、生成测试用例、检查接口文档一致性。',
    category: '开发',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['api测试', '接口调试', 'postman', 'curl', 'rest api', '接口测试'],
    skillMd: `---
name: api-tester
description: API 接口测试与调试辅助。帮助用户构建 API 请求、分析响应、生成测试用例。
type: skill
triggers: [api测试, 接口测试, 接口调试, 测试接口, curl, rest api, http请求]
allowed-tools: [Bash, Read, Write]
---

# API 测试与调试

帮助用户快速测试和调试 API 接口。

## 能力

### 1. 构建请求
- 使用 curl 或 fetch 发送 HTTP 请求
- 支持 GET/POST/PUT/DELETE/PATCH
- 自动处理 Headers、Cookie、Authorization
- 支持文件上传测试

### 2. 响应分析
- 格式化 JSON 响应
- 检查响应结构是否符合预期
- 分析错误码和错误信息

### 3. 测试用例生成
- 根据接口文档生成测试用例
- 边界值测试
- 参数校验测试

### 4. 接口文档一致性检查
- 对比实际响应与文档差异
- 检查必填字段缺失

## 使用示例

用户："测试一下这个登录接口"
→ 根据用户提供的接口信息构建 curl 请求
→ 发送请求并格式化输出响应
→ 分析响应状态码和数据结构
→ 生成建议的测试用例`,
  },

  {
    id: 'docker-helper',
    name: 'Docker 命令助手',
    description: 'Docker 命令和配置助手：镜像管理、容器操作、Compose 编排、Dockerfile 编写、排查容器问题。',
    category: '开发',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['docker', '容器', '镜像', 'docker-compose', 'Dockerfile', 'docker命令'],
    skillMd: `---
name: docker-helper
description: Docker 命令和配置助手。帮助用户管理 Docker 容器、镜像、网络、卷，编写 Dockerfile 和 docker-compose.yml。
type: skill
triggers: [docker, 容器, docker命令, dockerfile, docker-compose, 镜像, docker镜像]
allowed-tools: [Bash, Read, Write]
---

# Docker 命令助手

## 能力

### 1. 镜像管理
- 列出镜像（docker images）
- 搜索和拉取镜像
- 构建镜像（docker build）
- 标记和推送镜像
- 清理未使用的镜像

### 2. 容器操作
- 创建和运行容器
- 查看容器日志
- 进入容器调试
- 端口映射和卷挂载
- 容器资源监控

### 3. Dockerfile 编写
- 多阶段构建
- 最佳实践指导
- 安全建议

### 4. Docker Compose
- 编写 docker-compose.yml
- 启动/停止服务
- 查看服务日志
- 扩缩容配置

## 使用示例

用户："帮我写一个 Node.js 的 Dockerfile"
→ 分析项目结构
→ 生成 Dockerfile（多阶段构建）
→ 生成 .dockerignore
→ 提供构建和运行命令`,
  },

  // ========== 办公类 ==========
  {
    id: 'meeting-minutes',
    name: '会议纪要生成',
    description: '从会议录音转写文字或笔记中自动整理生成结构化会议纪要，包含议程、讨论要点、决议、待办事项等。',
    category: '办公',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['会议纪要', '会议记录', 'minutes', '纪要', '会议总结'],
    skillMd: `---
name: meeting-minutes
description: 会议纪要生成。从录音转写文字或笔记内容中自动整理生成结构化会议纪要。
type: skill
triggers: [会议纪要, 会议记录, 生成纪要, 会议总结, 整理会议, meeting minutes]
allowed-tools: [Read, Write, PresentFiles]
---

# 会议纪要生成器

将零散的会议笔记或录音转写内容整理成结构化的会议纪要。

## 输出格式

### 标题
会议名称 | 日期 | 时长

### 基本信息
- 会议时间：
- 参会人员：
- 主持人：
- 记录人：

### 议程
1. [议程项1]
2. [议程项2]

### 讨论要点
#### [议程项1]
- 关键讨论：
- 提出的方案：
- 不同意见：

#### [议程项2]
- ...

### 决议
- [决议1]
- [决议2]

### 待办事项
| 事项 | 负责人 | 截止日期 |
|------|--------|---------|
| xxx  | @姓名  | yyyy-mm-dd |

## 处理要求

1. 保留原始信息的准确性和完整性
2. 区分事实陈述和个人意见
3. 标注不确定的内容
4. 归类整理，去掉冗余重复
5. 确保待办事项有明确的责任人和时间节点

## 示例

用户："帮我整理这个会议笔记：[粘贴笔记内容]"
→ 分析内容提取会议基本信息
→ 归类讨论要点
→ 总结决议
→ 提取待办事项
→ 输出结构化 MD 格式文档`,
  },

  {
    id: 'weekly-report',
    name: '周报生成器',
    description: '从工作日志、任务列表、提交记录中自动生成周报。支持周报模板自定义，包含工作内容、成果、问题和下周计划。',
    category: '办公',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['周报', '周报生成', 'weekly', '工作总结', '周报汇总'],
    skillMd: `---
name: weekly-report
description: 周报生成器。从工作日志、任务记录、Git 提交日志等数据源生成格式化的周报。
type: skill
triggers: [周报, 周报生成, 写周报, 工作总结, 周报汇总, weekly report, 本周工作]
allowed-tools: [Read, Write, PresentFiles]
---

# 周报生成器

帮助用户从碎片化的日常工作记录中整理生成专业的周报。

## 输出格式

### 本周工作内容
#### 1. [项目/模块名称]
- ✅ 完成：[具体完成事项]
- 🔄 进行中：[正在进行的事项]
- 📅 计划调整：[如有]

#### 2. ...

### 工作成果
- 完成 [项目A] 的 [功能X] 开发和上线
- 修复 [Bug Y]（影响用户数 N）
- 输出 [文档/方案名称]

### 遇到的问题及解决方案
- 问题：[描述]
- 原因：[分析]
- 解决：[方案]

### 下周计划
1. [计划1]
2. [计划2]

## 数据来源处理

- 工作日志：按天归类整理
- Git 提交：分析 commit message 提取功能点和修复
- 任务系统：提取已完成和进行中的任务
- 会议纪要：提取与当前工作相关的内容

## 示例

用户："生成这周的周报" → 如果用户没有提供日志，引导用户输入本周的关键工作内容 → 按模板整理输出`,
  },

  {
    id: 'email-writer',
    name: '邮件撰写助手',
    description: '根据场景和收件人生成不同风格的邮件：正式商务、团队内部、客户沟通、求职信等。支持语气调节和模板复用。',
    category: '办公',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['邮件', '写邮件', 'email', '邮件模板', '撰写邮件', '商务邮件'],
    skillMd: `---
name: email-writer
description: 邮件撰写助手。根据用户提供的场景描述和目标收件人，生成不同风格和用途的邮件。
type: skill
triggers: [写邮件, 邮件撰写, 邮件模板, email, 商务邮件, 邮件写作]
allowed-tools: [Read, Write, PresentFiles]
---

# 邮件撰写助手

## 邮件风格库

### 1. 正式商务邮件
- 尊敬的 [收件人]
- 结构严谨，措辞专业
- 用于客户沟通、合作邀约、商务确认

### 2. 团队内部邮件
- 简洁直接
- 明确的行动项和负责人
- 用于周报同步、进度更新、会议通知

### 3. 求职/申请邮件
- 展示热情和能力
- 个性化定制
- 用于求职申请、合作邀请、学校申请

### 4. 跟进/催办邮件
- 礼貌但明确
- 提供价值信息
- 温和提醒

## 参数调节
- 语气：正式 ↔ 亲切
- 长度：简洁 ↔ 详细
- 紧急度：普通 ↔ 紧急

## 示例

用户："帮我写一封给客户的商务邮件，通知项目延期" → 生成正式道歉 + 原因说明 + 新时间表 + 补救措施 →
输出完整邮件并提供继续修改的选项`,
  },

  {
    id: 'document-formatter',
    name: '文档排版格式化',
    description: '对文档进行排版优化：统一的标题层级、段落间距、表格格式化、代码块高亮、引用规范化。',
    category: '办公',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['排版', '格式化', '文档排版', '格式整理', '美化文档', '格式规范'],
    skillMd: `---
name: document-formatter
description: 文档排版格式化工具。对 Markdown 或文本内容进行规范化排版和美化。
type: skill
triggers: [排版, 格式化, 文档排版, 美化文档, 格式整理, 规范格式, 文档美化]
allowed-tools: [Read, Write, Edit]
---

# 文档排版格式化

## 排版规范清单

### 1. 标题层级
- 一级标题（#）仅用于文档标题
- 二级标题（##）用于主要章节
- 三级标题（###）用于子章节
- 确保标题层级不跳级（如 ## → #### 中间缺 ###）

### 2. 段落间距
- 段落之间空一行
- 列表项之间统一间距
- 代码块前后保留空行

### 3. 列表规范
- 有序列表使用 1. 2. 3.
- 无序列表统一使用 -
- 子列表缩进 2 或 4 空格

### 4. 表格格式化
- 列宽对齐
- 表头加粗
- 内容居左对齐

### 5. 代码块
- 指定语言（\`\`\`typescript / \`\`\`bash 等）
- 保持一致的缩进
- 长行适当换行

### 6. 引用和链接
- 引用使用 > 符号
- 链接格式 [文本](URL)
- 引用来源可追溯

## 示例

用户："帮我把这份文档排一下版" → 分析文档结构 → 调整标题层级 → 统一空格和缩进 → 格式化表格 → 输出优化后的文档`,
  },

  {
    id: 'slides-creator',
    name: '幻灯片大纲生成',
    description: '从主题或文档内容一键生成幻灯片大纲，包含每一页的标题、要点、配图建议和备注。支持自定义页数和风格。',
    category: '办公',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['幻灯片', 'PPT', 'slides', '演示文稿', 'ppt大纲', '演讲稿'],
    skillMd: `---
name: slides-creator
description: 幻灯片大纲和内容生成。从主题描述或长文档自动生成演示文稿的完整大纲结构。
type: skill
triggers: [幻灯片, ppt, 演示文稿, 生成ppt, ppt大纲, slides, 演讲稿, 演示稿]
allowed-tools: [Read, Write, PresentFiles]
---

# 幻灯片大纲生成器

## 输出结构

### 封面页
- 标题：[主题]
- 副标题：[可选]
- 作者/日期

### 目录页
- 各章节标题

### 正文页
每页包含：
- 标题
- 核心要点（3-5条）
- 配图建议
- 演讲备注

### 总结页
- 关键回顾
- Q&A 提示

### 附录页
- 参考资料
- 数据来源

## 风格选择

1. **专业简报** — 简洁、数据驱动、图表展示
2. **产品路演** — 问题→方案→优势 叙事结构
3. **教学培训** — 知识点递进、案例穿插
4. **项目汇报** — 背景→进展→成果→计划

## 示例

用户："帮我做一个 AI 项目介绍的 PPT 大纲" → 确定风格 → 生成 8-12 页的完整大纲 →
每页包含标题、要点、配图建议、演讲备注`,
  },

  // ========== 数据分析类 ==========
  {
    id: 'data-analyzer',
    name: '数据自动分析',
    description: '对 CSV/Excel 数据自动进行分析：统计摘要、异常检测、相关性分析、趋势分析、自动生成洞察结论。',
    category: '数据分析',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['数据分析', 'csv分析', 'excel分析', '数据统计', '数据洞察', '数据分析报告'],
    skillMd: `---
name: data-analyzer
description: 数据自动分析工具。对 CSV/Excel 数据进行统计分析、异常检测、相关性分析、趋势识别并生成分析报告。
type: skill
triggers: [数据分析, csv分析, excel分析, 分析数据, 数据统计, 数据洞察, 数据分析报告]
allowed-tools: [Read, Bash, Write, PresentFiles]
---

# 数据自动分析

## 分析流程

### 1. 数据加载与预览
- 读取 CSV/Excel 文件
- 展示前 5 行数据预览
- 列出所有列名和数据类型

### 2. 基本统计分析
- 数值列：均值、中位数、标准差、最小值、最大值、四分位数
- 类别列：频次统计、唯一值数量
- 缺失值统计
- 异常值检测（IQR 方法）

### 3. 深度分析
- 相关性矩阵（数值列之间）
- 分组统计（按类别列分组）
- 时间趋势分析（如果有时间列）
- Top-N 排序分析

### 4. 结论与建议
- 关键发现（3-5条）
- 建议关注的异常
- 可能的数据质量问题

## 输出格式

\`\`\`
## 数据分析报告

### 数据概览
- 行数: N, 列数: M
- 缺失值: N 处

### 统计摘要
| 列名 | 均值 | 中位数 | 标准差 | 最小 | 最大 |
|------|------|--------|--------|------|------|

### 关键发现
1. ...
2. ...

### 建议
- ...
\`\`\`

## 示例

用户："分析这份销售数据" → 读取 CSV → 输出统计分析报告 → 自动生成可视化代码或图表`,
  },

  {
    id: 'chart-maker',
    name: '图表生成器',
    description: '从数据生成可直接运行的图表代码：柱状图、折线图、饼图、散点图、热力图等，支持 ECharts / Chart.js。',
    category: '数据分析',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['图表', '图表生成', 'chart', '可视化', 'echarts', 'chart.js', '画图'],
    skillMd: `---
name: chart-maker
description: 图表生成器。从结构化数据生成可直接运行的 HTML 图表代码。支持多种图表类型和框架。
type: skill
triggers: [图表, 图表生成, 可视化, 画图, 生成图表, chart, echarts, 数据可视化]
allowed-tools: [Read, Write, PresentFiles]
---

# 图表生成器

## 支持的图表类型

1. **柱状图/条形图** — 分类对比
2. **折线图** — 趋势展示
3. **饼图/环形图** — 占比展示
4. **散点图** — 相关性展示
5. **热力图** — 密度分布
6. **雷达图** — 多维度对比
7. **箱线图** — 数据分布

## 框架选择

- **ECharts** — 功能最全，适合复杂图表
- **Chart.js** — 轻量简洁，适合简单图表
- **Pure SVG** — 无需依赖，适合嵌入文档

## 输出格式

生成可直接运行的 HTML 文件包含：
- 完整 HTML 结构
- 数据嵌入
- 交互功能（tooltip、缩放等）
- 响应式设计

## 示例

用户："把这份数据画成柱状图" → 读取数据 → 选择 ECharts → 生成包含交互功能的 HTML 图表文件`,
  },

  {
    id: 'report-generator',
    name: '报告生成器',
    description: '从原始数据和分析结果一键生成结构化报告。支持数据分析报告、市场调研报告、项目总结报告等多种模板。',
    category: '数据分析',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['报告', '报告生成', '生成报告', '数据分析报告', '市场报告', '项目报告'],
    skillMd: `---
name: report-generator
description: 报告生成器。将数据分析结果或项目信息整理为结构化、可交付的专业报告。
type: skill
triggers: [报告, 生成报告, 数据分析报告, 市场报告, 项目报告, 研究报告]
allowed-tools: [Read, Write, PresentFiles]
---

# 报告生成器

## 报告模板类型

### 1. 数据分析报告
- 摘要
- 数据来源与方法
- 分析结果
- 关键发现
- 结论与建议
- 附录

### 2. 项目总结报告
- 项目背景
- 目标与范围
- 执行过程
- 成果与数据
- 经验教训
- 下一步计划

### 3. 市场调研报告
- 行业概况
- 竞品分析
- 用户洞察
- 市场趋势
- 策略建议

## 质量要求

1. 数据支撑的结论必须有数据引用
2. 图表与文字内容相辅相成
3. 报告结构层次清晰
4. 建议要具体可执行
5. 标注数据来源和时效性

## 示例

用户："生成一份项目总结报告" → 收集项目信息 → 选择报告模板 → 填充内容 →
生成完整的 Markdown 报告文档`,
  },

  // ========== 设计类 ==========
  {
    id: 'ui-prototype',
    name: '界面原型设计',
    description: '根据功能描述生成 HTML/CSS 界面原型：仪表盘、表单、列表页、登录页、卡片组件等。使用纯前端技术栈。',
    category: '设计',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['界面', 'UI', '原型', 'html原型', '页面设计', '界面设计', '设计原型'],
    skillMd: `---
name: ui-prototype
description: 界面原型设计辅助。根据功能描述快速生成可交互的 HTML/CSS 界面原型。
type: skill
triggers: [界面设计, ui设计, html原型, 原型设计, 页面设计, 界面原型, ui prototype]
allowed-tools: [Read, Write, PresentFiles]
---

# 界面原型设计助手

## 能力

### 1. 页面类型
- 登录/注册页面
- 仪表盘（Dashboard）
- 数据表格/列表页
- 表单页面
- 详情页/展示页
- 导航/侧边栏布局

### 2. 技术栈
- HTML5 + CSS3（Flexbox/Grid）
- Tailwind CSS（推荐）
- 纯 CSS 动画
- 可交互原型（点击切换、表单验证）

### 3. 设计原则
- 信息层级清晰
- 一致的间距和配色
- 响应式布局
- 可访问性基础

## 输出

生成独立的 HTML 文件，可直接在浏览器中打开查看。

## 示例

用户："做一个用户管理页面的原型" → 设计表格 + 搜索 + 分页 + 操作按钮 →
生成完整 HTML 文件并展示`,
  },

  {
    id: 'brand-designer',
    name: '品牌设计方案生成',
    description: '根据品牌定位和行业属性生成品牌设计方案：配色方案、字体搭配、Logo 概念、视觉风格指南。',
    category: '设计',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['品牌设计', '配色', 'logo设计', '品牌方案', '视觉设计', '品牌指南'],
    skillMd: `---
name: brand-designer
description: 品牌设计方案生成。根据行业属性、品牌调性和目标受众生成完整的品牌视觉方案。
type: skill
triggers: [品牌设计, 配色方案, logo设计, 品牌方案, 视觉设计, 品牌指南, brand design]
allowed-tools: [Read, Write, PresentFiles]
---

# 品牌设计方案生成

## 输出内容

### 1. 品牌定位
- 品牌调性描述
- 目标受众画像
- 竞品风格定位

### 2. 配色方案
- 主色（Primary）：HEX 色值
- 辅色（Secondary）
- 强调色（Accent）
- 中性色（Neutral）
- 配色使用比例和建议

### 3. 字体方案
- 标题字体
- 正文字体
- 字号层级
- 中英文搭配建议

### 4. Logo 设计概念
- Logo 风格方向（文字/图形/组合）
- 设计理念说明
- 配色/字体/布局建议
- 应用效果描述

### 5. 视觉风格指南
- 图标风格
- 图片风格
- 间距系统
- 圆角/阴影规范

## 示例

用户："为一个人工智能教育产品做品牌设计" → 分析行业特征 →
生成完整的品牌设计方案：配色、字体、Logo、视觉风格`,
  },

  // ========== 系统工具类 ==========
  {
    id: 'file-organizer',
    name: '文件自动整理',
    description: '按文件类型、日期、文件名规则自动分类整理文件。支持自定义规则、预览操作、一键归档。',
    category: '系统工具',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['文件整理', '文件分类', '整理文件', '归档', 'file organize', '文件管理'],
    skillMd: `---
name: file-organizer
description: 文件自动整理工具。按类型、日期、自定义规则对目录中的文件进行分类整理。
type: skill
triggers: [文件整理, 文件分类, 整理文件, 归档文件, 文件管理, file organize]
allowed-tools: [Bash, Read, Glob]
---

# 文件自动整理

## 分类规则

### 按文件类型
\`\`\`
图片/    → .jpg .png .gif .bmp .svg .webp
文档/    → .doc .docx .pdf .txt .md .xlsx
代码/    → .js .ts .py .java .go .html .css
压缩包/  → .zip .rar .7z .tar.gz
视频/    → .mp4 .avi .mkv .mov
音频/    → .mp3 .wav .flac .aac
\`\`\`

### 按日期
\`\`\`
YYYY/         → 按年归类
YYYY-MM/      → 按年月归类
YYYY-MM-DD/   → 按日期归类
\`\`\`

### 按文件名规则
- 匹配特定前缀/后缀
- 匹配正则表达式
- 按文件大小分类

## 安全措施

1. 操作前预览即将移动的文件列表
2. 默认使用复制模式，确认后再删除原文件
3. 保留原始文件时间戳
4. 生成操作日志

## 示例

用户："整理一下下载目录" → 扫描下载目录 → 统计文件类型和数量 →
展示分类预览 → 确认后执行整理操作`,
  },

  {
    id: 'batch-processor',
    name: '批量文件处理',
    description: '批量文件处理：批量重命名（替换/添加前缀后缀/编号）、格式转换、压缩解压、内容批量替换。',
    category: '系统工具',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['批量重命名', '批量处理', '批量转换', '文件批量', 'batch rename', '批量压缩'],
    skillMd: `---
name: batch-processor
description: 批量文件处理工具。支持批量重命名、格式转换、压缩解压、文本内容批量替换。
type: skill
triggers: [批量重命名, 批量处理, 批量转换, 批量压缩, 批量改名, batch, 批量替换]
allowed-tools: [Bash, Read, Glob]
---

# 批量文件处理

## 功能列表

### 1. 批量重命名
- 添加前缀/后缀
- 替换文本（如 图片1 → photo1）
- 编号模式（如 file_001, file_002）
- 删除指定字符
- 大小写转换
- 使用正则表达式

### 2. 格式转换
- 图片格式：jpg ↔ png ↔ webp
- 文档格式：md → html, docx → md
- 压缩：单个或批量

### 3. 内容批量替换
- 跨文件文本替换
- 正则匹配替换
- 仅替换特定文件类型

## 安全措施

1. 操作前展示变更预览
2. 支持撤销操作
3. 保留备份选项
4. 分步确认关键操作

## 示例

用户："把所有 .PNG 改成 .png" → 先搜索目标文件 → 展示要改的文件列表 →
确认后执行 → 输出操作结果统计`,
  },

  {
    id: 'system-cleaner',
    name: '系统清理助手',
    description: '分析和清理系统：扫描临时文件、大文件、重复文件、缓存目录。显示磁盘空间使用情况，安全清理建议。',
    category: '系统工具',
    author: 'CoreBuddy',
    version: '1.0.0',
    installed: false,
    triggers: ['系统清理', '清理缓存', '临时文件', '大文件扫描', '磁盘清理', '重复文件'],
    skillMd: `---
name: system-cleaner
description: 系统清理助手。扫描和分析系统中的临时文件、缓存、大文件、重复文件，提供清理建议。
type: skill
triggers: [系统清理, 清理缓存, 临时文件, 大文件扫描, 磁盘清理, 清理垃圾, 重复文件]
allowed-tools: [Bash, Read, Glob]
---

# 系统清理助手

## 扫描项目

### 1. 临时文件扫描
- 系统临时目录
- 浏览器缓存
- npm/yarn/pip 缓存
- 应用程序缓存

### 2. 大文件扫描
- 搜索指定目录下的大文件
- 按大小排序展示 Top 20
- 支持自定义大小阈值

### 3. 重复文件检测
- 基于文件大小和名称检测
- MD5 校验确认
- 展示重复文件组

### 4. 磁盘使用分析
- 各目录大小占比
- 文件类型分布
- 增长趋势（如有历史数据）

## 安全措施

1. 只读模式下分析，不自动删除
2. 清理前向用户展示详细列表
3. 标记系统关键文件（不可删除）
4. 支持排除目录配置

## 示例

用户："帮我清理一下系统" → 扫描临时文件和缓存 → 展示可清理的文件列表和大小 →
标记大文件和重复文件 → 确认后执行清理`,
  },
]

// ─── Check installed status by scanning plugin directories ───

function getPluginDir(): string {
  return path.join(app.getPath('userData'), 'corebuddy-plugins')
}

function scanInstalledSkills(): Set<string> {
  const installed = new Set<string>()
  const dir = getPluginDir()
  if (!fs.existsSync(dir)) return installed

  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      if (fs.statSync(fullPath).isDirectory()) {
        const skillMdPath = path.join(fullPath, 'SKILL.md')
        if (fs.existsSync(skillMdPath)) {
          installed.add(entry)
        }
      } else if (entry === 'SKILL.md' || entry.endsWith('.skill.md')) {
        installed.add(path.basename(entry, '.skill.md'))
      }
    }
  } catch {}
  return installed
}

// ─── Public API ───

/** Get all marketplace skills with installed status */
export function getMarketplaceSkills(): MarketplaceSkill[] {
  const installed = scanInstalledSkills()
  return allSkills.map(s => ({
    ...s,
    installed: installed.has(s.id) || installed.has(s.name),
  }))
}

/** Get a single marketplace skill by id */
export function getMarketplaceSkill(id: string): MarketplaceSkill | undefined {
  const all = getMarketplaceSkills()
  return all.find(s => s.id === id)
}

/** Search marketplace by name, description, or triggers */
export function searchMarketplace(query: string): MarketplaceSkill[] {
  const q = query.toLowerCase().trim()
  if (!q) return getMarketplaceSkills()
  const all = getMarketplaceSkills()
  return all.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.triggers?.some(t => t.toLowerCase().includes(q))
  )
}

/** Install a skill: write SKILL.md to plugin directory */
export function installSkill(id: string): { success: boolean; error?: string; path?: string } {
  const skill = allSkills.find(s => s.id === id)
  if (!skill) return { success: false, error: `Skill "${id}" 不存在` }

  const pluginDir = getPluginDir()
  const skillDir = path.join(pluginDir, skill.id)

  try {
    // Check if already installed
    const installed = scanInstalledSkills()
    if (installed.has(skill.id)) {
      return { success: false, error: `Skill "${skill.name}" 已经安装` }
    }

    fs.mkdirSync(skillDir, { recursive: true })

    // Write SKILL.md
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(skillMdPath, skill.skillMd, 'utf-8')

    // Write index.js if jsCode is provided
    if (skill.jsCode) {
      const jsPath = path.join(skillDir, 'index.js')
      fs.writeFileSync(jsPath, skill.jsCode, 'utf-8')
    }

    // Trigger hot-reload by calling loadAllPlugins directly
    try {
      loadAllPlugins()
    } catch {
      // Hot reload is best-effort; next app restart will pick up changes
    }

    return { success: true, path: skillMdPath }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `安装失败: ${msg}` }
  }
}

/** Uninstall a skill: remove the plugin directory */
export function uninstallSkill(id: string): boolean {
  const pluginDir = getPluginDir()
  const skillDir = path.join(pluginDir, id)

  try {
    // Validate skill ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
      return false
    }
    const skillDir = path.join(pluginDir, id)
    // Extra safety: verify resolved path is within pluginDir
    if (!path.resolve(skillDir).startsWith(path.resolve(pluginDir) + path.sep)) {
      console.error(`[skill-marketplace] Path traversal blocked for skill: ${id}`)
      return false
    }

    if (!fs.existsSync(skillDir)) return false

    // Remove directory recursively
    fs.rmSync(skillDir, { recursive: true, force: true })

    // Hot-reload plugins
    try {
      loadAllPlugins()
    } catch {}

    return true
  } catch {
    return false
  }
}
