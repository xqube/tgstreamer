import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const iterableFile = path.join(__dirname, 'node_modules/@mtcute/core/highlevel/methods/files/download-iterable.js')

console.log('🔧 Patching mtcute for memory leak fix...\n')

try {
    let content = fs.readFileSync(iterableFile, 'utf8')

    if (content.includes('clearBuffer')) {
        console.log('✅ Patch already applied!')
        process.exit(0)
    }

    const oldPattern = `abortSignal?.addEventListener("abort", () => {
    client.log.debug("download aborted");
    error = abortSignal.reason;
    ended = true;
    nextChunkCv.notify();
  });`

    const newCode = `abortSignal?.addEventListener("abort", () => {
    client.log.debug("download aborted");
    error = abortSignal.reason;
    ended = true;
    // Clear buffered chunks to prevent memory leak
    for (const key in buffer) {
      delete buffer[key];
    }
    nextChunkCv.notify();
  });`

    if (content.includes(oldPattern)) {
        content = content.replace(oldPattern, newCode)
        fs.writeFileSync(iterableFile, content)
        console.log('✅ Memory leak patch applied successfully!')
        console.log('   Buffered chunks will now be cleared on abort.')
    } else {
        console.warn('⚠️ Pattern not found - mtcute version may differ')
        console.log('   Please check the file manually:', iterableFile)
    }
} catch (e) {
    console.error('❌ Patch failed:', e.message)
    process.exit(1)
}
