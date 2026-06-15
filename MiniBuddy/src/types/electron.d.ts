export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'boundary'
  content: string
  time: string
}

export type PermissionLevel = 'default' | 'full'
export type ChatMode = 'chat' | 'craft' | 'plan'
export type PersonaMode = 'office' | 'creative'

export interface SkillInfo {
  name: string
  description: string
  type: 'skill' | 'tool'
  triggers?: string[]
}

export interface ArtifactInfo {
  tool: string
  path: string
  type: string
  time: string
  convId: string
}

export interface StreamDoneData {
  toolCount: number
  artifactCount: number
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  config: {
    get: (key: string) => Promise<string>
    set: (key: string, value: string) => Promise<boolean>
  }
  conv: {
    list: () => Promise<Conversation[]>
    create: (id: string) => Promise<Conversation>
    delete: (id: string) => Promise<void>
    messages: (id: string) => Promise<Message[]>
    status: () => Promise<Record<string, boolean>>
    onStatusChange: (callback: (data: { convId: string; loading: boolean }) => void) => () => void
  }
  chat: {
    sendMessage: (text: string, modelId: string, convId: string, permLevel?: number, persona?: string, scenePrompt?: string, userName?: string) => Promise<void>
    abort: (convId: string) => Promise<boolean>
    feedback: (convId: string, msgId: string, type: 'like' | 'dislike', content: string) => Promise<{ success: boolean; error?: string }>
    onStreamChunk: (callback: (chunk: string) => void) => () => void
    onStreamDone: (callback: (data?: StreamDoneData) => void) => () => void
    onStreamError: (callback: (error: string) => void) => () => void
    onArtifact: (callback: (artifact: ArtifactInfo) => void) => () => void
    onToolStart: (callback: (data: { count: number; names: string[] }) => void) => () => void
    onToolProgress: (callback: (data: { completed: number; total: number }) => void) => () => void
    onToolAction: (callback: (data: { action: string; completed: number; total: number }) => void) => () => void
  }
  progress: {
    get: () => Promise<{
      projects: Array<{ name: string; status: string; lastUpdate: string }>
      todos: Array<{ text: string; done: boolean }>
      factsCount: number
      prefsCount: number
    }>
  }
  mcp: {
    list: () => Promise<{ servers: Record<string, any> }>
    connect: () => Promise<string[]>
    connectOne: (name: string, config: any) => Promise<string>
    disconnect: (name: string) => Promise<boolean>
    reconnect: (name: string) => Promise<string>
    save: (name: string, config: any) => Promise<boolean>
    remove: (name: string) => Promise<boolean>
    status: () => Promise<Record<string, string>>
    tools: (name: string) => Promise<Array<{ name: string; description?: string }>>
    exportConfig: () => Promise<{ success: boolean; path?: string; error?: string }>
    importConfig: () => Promise<{ success: boolean; results?: string[]; error?: string }>
  }
  memory: {
    savePreset: (preset: any) => Promise<boolean>
  }
  models: {
    list: () => Promise<{ models: Array<{ id: string; name: string; apiUrl: string }>; defaultModel: string }>
    save: (config: any) => Promise<boolean>
    add: (model: { id: string; name: string; apiUrl: string }) => Promise<{ success: boolean; error?: string }>
    remove: (id: string) => Promise<boolean>
    setDefault: (id: string) => Promise<boolean>
  }
  skills: {
    list: () => Promise<SkillInfo[]>
  }
  oauth: {
    start: (service: string, config: any) => Promise<{ success: boolean; accessToken?: string; error?: string }>
  }
  file: {
    open: (filePath: string) => Promise<{ success: boolean; error?: string }>
    showInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
    read: (filePath: string) => Promise<{ success: boolean; content?: string; size?: number; ext?: string; error?: string }>
    listOutputs: () => Promise<{ success: boolean; files?: FileInfo[]; dir?: string; error?: string }>
    getInfo: (filePath: string) => Promise<{ success: boolean; name?: string; path?: string; size?: number; created?: string; modified?: string; ext?: string; isDir?: boolean; error?: string }>
  }
  openExternal: (url: string) => Promise<boolean>
}

export interface FileInfo {
  name: string
  path: string
  size: number
  time: string
  ext: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
