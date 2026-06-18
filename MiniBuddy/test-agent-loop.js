// Standalone test: simulate agentLoop startup to find the "namenamenamename" crash
// Run: node test-agent-loop.js
// This isolates the crash without needing the full Electron app

const path = require('path')
const fs = require('fs')

console.log('=== CoreBuddy Agent Loop Crash Investigation ===')
console.log('')

// Step 1: Check bootstrap files loaded by loadClaudeMd
try {
  const homeDir = process.env.HOME || process.env.USERPROFILE || require('os').homedir()
  const base = path.join(homeDir, '.workbuddy')
  const files = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'MINIBUDDY_RULES.md']
  
  console.log('[1] Bootstrap files at:', base)
  for (const f of files) {
    const p = path.join(base, f)
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8')
      console.log(`  ✅ ${f}: ${content.length} chars`)
    } else {
      console.log(`  ⬜ ${f}: not found`)
    }
  }
} catch (e) {
  console.log('  ❌ Bootstrap load error:', e.message)
}

console.log('')

// Step 2: Try loading the tool registry (no Electron APIs)
try {
  console.log('[2] Loading tool-registry...')
  // Can't directly import TS modules, so load the compiled version
  const mainPath = path.join(__dirname, 'dist-electron', 'main.js')
  if (fs.existsSync(mainPath)) {
    console.log(`  Dist-electron exists: ${mainPath} (${(fs.statSync(mainPath).size / 1024).toFixed(0)} KB)`)
    
    // Check if the fix is in the compiled code
    const code = fs.readFileSync(mainPath, 'utf-8')
    const hasOldBug = code.includes('existing.function.name += tcDelta.function.name')
    const hasFix = code.includes('!existing.function.name')
    console.log(`  Old bug (+=): ${hasOldBug ? '❌ STILL PRESENT' : '✅ Removed'}`)
    console.log(`  Fix (!existing): ${hasFix ? '✅ Present' : '❌ MISSING'}`)
  } else {
    console.log('  ❌ dist-electron/main.js not found')
    console.log('  (This test must be run after "npx vite build")')
  }
} catch (e) {
  console.log('  ❌ Load error:', e.message)
}

console.log('')

// Step 3: DeepSeek API test - send "你好" and check response
console.log('[3] DeepSeek API streaming test...')
console.log('  (Requires apiKey from config)')

const userDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'corebuddy') : path.join(require('os').homedir(), 'AppData', 'Roaming', 'corebuddy')
const configPath = path.join(userDataDir, 'config.json')

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const apiKey = config.apiKey
  
  if (!apiKey) {
    console.log('  ⬜ No apiKey configured, skipping API test')
  } else {
    console.log('  ✅ Config loaded, testing DeepSeek API...')
    
    // Get models config
    const modelsPath = path.join(userDataDir, 'models.json')
    let modelsCfg = { defaultModel: 'deepseek-v4-pro', models: [] }
    try { modelsCfg = JSON.parse(fs.readFileSync(modelsPath, 'utf-8')) } catch {}
    
    const modelId = modelsCfg.defaultModel || 'deepseek-v4-pro'
    const modelEntry = modelsCfg.models.find(m => m.id === modelId)
    const apiUrl = modelEntry?.apiUrl || 'https://api.deepseek.com/v1'
    const effectiveKey = modelEntry?.apiKey || apiKey
    
    // Load system prompt template
    const sysPrompt = `You are a helpful assistant. Respond concisely in Chinese.`
    
    const requestBody = {
      model: modelId,
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: '你好' }
      ]
    }
    
    console.log(`  Model: ${modelId}`)
    console.log(`  API: ${apiUrl}`)
    
    fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`
      },
      body: JSON.stringify(requestBody)
    }).then(async response => {
      if (!response.ok) {
        const err = await response.text()
        console.log(`  ❌ API error (${response.status}): ${err.slice(0, 200)}`)
        return
      }
      
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let content = '', buffer = ''
      let chunkCount = 0
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t || !t.startsWith('data: ')) continue
          const d = t.slice(6)
          if (d === '[DONE]') continue
          try {
            const p = JSON.parse(d)
            const delta = p.choices?.[0]?.delta
            if (delta?.content) content += delta.content
            chunkCount++
            if (delta?.tool_calls) {
              console.log(`  ⚠️ Tool call delta at chunk ${chunkCount}:`, JSON.stringify(delta.tool_calls).slice(0, 200))
            }
          } catch {}
        }
      }
      
      console.log(`  ✅ Response: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`)
      console.log(`  Total chunks: ${chunkCount}, Response length: ${content.length} chars`)
      console.log('  No errors - API communication works fine.')
    }).catch(e => {
      console.log(`  ❌ Network error: ${e.message}`)
    })
    
    // Need to wait for async
    console.log('  (Waiting for response...)')
    await new Promise(r => setTimeout(r, 5000))
  }
} catch (e) {
  console.log('  ❌ Config error:', e.message)
}

console.log('')
console.log('=== Investigation Complete ===')
console.log('If the test above shows no API errors, the crash is in the Electron')
console.log('layer (system prompt building, tool registry, or IPC communication).')
console.log('Check the Electron DevTools console (Ctrl+Shift+I) for the exact stack trace.')
