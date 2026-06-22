// CoreBuddy OCR Worker — runs in a forked child_process to avoid asar/worker_threads issues
// Receives { imagePath, language, langPath } via IPC, runs Tesseract, sends result back

const Tesseract = require('tesseract.js')

// Crash handlers — ensure parent process is notified on any failure
process.on('uncaughtException', (err) => {
  try { process.send({ success: false, error: `Worker crash: ${err.message}` }) } catch {}
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  try { process.send({ success: false, error: `Worker rejection: ${reason}` }) } catch {}
  process.exit(1)
})

process.on('message', async (msg) => {
  const { imagePath, language, langPath } = msg
  try {
    const result = await Tesseract.recognize(imagePath, language, {
      logger: (m) => { if (m.status === 'recognizing text') console.log(`[OCR] ${Math.round(m.progress * 100)}%`) },
      langPath,
    })
    const text = result.data.text || ''
    const confidence = Math.round((result.data.confidence || 0))
    process.send({ success: true, text: text.trim(), confidence })
  } catch (err) {
    process.send({ success: false, error: err.message || String(err) })
  }
  process.exit(0)
})
