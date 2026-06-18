import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('config:set', key, value),
  },
  conv: {
    list: () => ipcRenderer.invoke('conv:list'),
    create: (id: string) => ipcRenderer.invoke('conv:create', id),
    delete: (id: string) => ipcRenderer.invoke('conv:delete', id),
    messages: (id: string) => ipcRenderer.invoke('conv:messages', id),
    status: () => ipcRenderer.invoke('conv:status'),
    onStatusChange: (cb: (data: { convId: string; loading: boolean }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('conv:status', h)
      return () => ipcRenderer.removeListener('conv:status', h)
    },
  },
  chat: {
    sendMessage: (text: string, modelId: string, convId: string, permLevel?: number, persona?: string, scenePrompt?: string, userName?: string, executionMode?: string, attachments?: Array<{type: string; name: string; data?: string; path?: string; size?: number}>) => {
      // Sanitize attachments: ensure all values are primitive/cloneable
      const safeAttachments = attachments?.map(a => ({
        type: String(a.type || ''),
        name: String(a.name || ''),
        path: String(a.path || ''),
        size: Number(a.size) || 0,
        data: a.data ? String(a.data) : undefined,
      }))
      return ipcRenderer.invoke('chat:sendMessage', text, modelId, convId, permLevel, persona, scenePrompt, userName, executionMode, safeAttachments)
    },
    abort: (convId: string) => ipcRenderer.invoke('chat:abort', convId),
    feedback: (convId: string, msgId: string, type: 'like' | 'dislike', content: string) =>
      ipcRenderer.invoke('chat:feedback', convId, msgId, type, content),
    onStreamChunk: (cb: (chunk: string) => void) => {
      const h = (_: any, c: string) => cb(c)
      ipcRenderer.on('chat:streamChunk', h)
      return () => ipcRenderer.removeListener('chat:streamChunk', h)
    },
    onStreamDone: (cb: (data?: any) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:streamDone', h)
      return () => ipcRenderer.removeListener('chat:streamDone', h)
    },
    onStreamError: (cb: (err: string) => void) => {
      const h = (_: any, e: string) => cb(e)
      ipcRenderer.on('chat:streamError', h)
      return () => ipcRenderer.removeListener('chat:streamError', h)
    },
    onArtifact: (cb: (artifact: { tool: string; path: string; type: string; time: string; convId: string }) => void) => {
      const h = (_: any, a: any) => cb(a)
      ipcRenderer.on('chat:artifact', h)
      return () => ipcRenderer.removeListener('chat:artifact', h)
    },
    onToolStart: (cb: (data: { count: number; names: string[] }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:toolStart', h)
      return () => ipcRenderer.removeListener('chat:toolStart', h)
    },
    onToolProgress: (cb: (data: { completed: number; total: number }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:toolProgress', h)
      return () => ipcRenderer.removeListener('chat:toolProgress', h)
    },
    onToolAction: (cb: (data: { action: string; completed: number; total: number }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:toolAction', h)
      return () => ipcRenderer.removeListener('chat:toolAction', h)
    },
    onCompacting: (cb: (data: { active: boolean; convId?: string }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:compacting', h)
      return () => ipcRenderer.removeListener('chat:compacting', h)
    },
    onPipelineStart: (cb: (data: { pipelineId: string; pipelineName: string; stages: Array<{id: string; name: string; description: string; agentRole: string; status: string}>; totalStages: number; convId?: string }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:pipelineStart', h)
      return () => ipcRenderer.removeListener('chat:pipelineStart', h)
    },
    onPipelineStageUpdate: (cb: (data: { pipelineId: string; stageId: string; status: string; stageName: string; agentRole: string; stageIndex: number; totalStages: number; error?: string; convId?: string }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:pipelineStageUpdate', h)
      return () => ipcRenderer.removeListener('chat:pipelineStageUpdate', h)
    },
    onPipelineComplete: (cb: (data: { pipelineId: string; status: string; totalStages: number; duration: number; error?: string; convId?: string }) => void) => {
      const h = (_: any, d: any) => cb(d)
      ipcRenderer.on('chat:pipelineComplete', h)
      return () => ipcRenderer.removeListener('chat:pipelineComplete', h)
    },
  },
  progress: {
    get: () => ipcRenderer.invoke('progress:get'),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    connect: () => ipcRenderer.invoke('mcp:connect'),
    connectOne: (name: string, config: any) => ipcRenderer.invoke('mcp:connectOne', name, config),
    disconnect: (name: string) => ipcRenderer.invoke('mcp:disconnect', name),
    reconnect: (name: string) => ipcRenderer.invoke('mcp:reconnect', name),
    save: (name: string, config: any) => ipcRenderer.invoke('mcp:save', name, config),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    status: () => ipcRenderer.invoke('mcp:status'),
    tools: (name: string) => ipcRenderer.invoke('mcp:tools', name),
    exportConfig: () => ipcRenderer.invoke('mcp:export'),
    importConfig: () => ipcRenderer.invoke('mcp:import'),
  },
  memory: {
    savePreset: (preset: any) => ipcRenderer.invoke('memory:savePreset', preset),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    save: (config: any) => ipcRenderer.invoke('models:save', config),
    add: (model: any) => ipcRenderer.invoke('models:add', model),
    remove: (id: string) => ipcRenderer.invoke('models:remove', id),
    setDefault: (id: string) => ipcRenderer.invoke('models:setDefault', id),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    marketplace: () => ipcRenderer.invoke('skills:marketplace'),
    search: (query: string) => ipcRenderer.invoke('skills:search', query),
    install: (id: string) => ipcRenderer.invoke('skills:install', id),
    uninstall: (id: string) => ipcRenderer.invoke('skills:uninstall', id),
  },
  connectors: {
    list: () => ipcRenderer.invoke('connectors:list'),
    connect: (id: string, config: Record<string, string>) => ipcRenderer.invoke('connectors:connect', id, config),
    disconnect: (id: string) => ipcRenderer.invoke('connectors:disconnect', id),
    status: () => ipcRenderer.invoke('connectors:status'),
  },
  oauth: {
    start: (service: string, config: any) => ipcRenderer.invoke('oauth:start', service, config),
    port: () => ipcRenderer.invoke('oauth:port'),
  },
  file: {
    saveTemp: (data: string, fileName: string) => ipcRenderer.invoke('file:saveTemp', data, fileName),
    open: (filePath: string) => ipcRenderer.invoke('file:open', filePath),
    showInFolder: (filePath: string) => ipcRenderer.invoke('file:showInFolder', filePath),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    listOutputs: () => ipcRenderer.invoke('file:listOutputs'),
    getInfo: (filePath: string) => ipcRenderer.invoke('file:getInfo', filePath),
  },
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
})
