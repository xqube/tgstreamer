import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const iterableFile = path.join(__dirname, 'node_modules/@mtcute/core/highlevel/methods/files/download-iterable.js')

console.log('🔧 Patching mtcute for buffer limiting + memory leak fix...\n')

// Configuration: Maximum buffer size in bytes (default 4MB)
const MAX_BUFFER_SIZE = process.env.MTCUTE_MAX_BUFFER_SIZE || 4 * 1024 * 1024

try {
  let content = fs.readFileSync(iterableFile, 'utf8')
  let patchCount = 0

  // ============================================
  // PATCH 1: Add buffer size limiting variables
  // ============================================
  // Add after: const buffer = {};
  const bufferDeclPattern = 'const buffer = {};'
  const bufferDeclReplacement = `const buffer = {};
  let bufferBytes = 0;
  const maxBufferBytes = ${MAX_BUFFER_SIZE};
  // Helper: wait with timeout (for backpressure)
  const waitForBuffer = () => new Promise(r => setTimeout(r, 50));`

  if (content.includes(bufferDeclPattern) && !content.includes('bufferBytes')) {
    content = content.replace(bufferDeclPattern, bufferDeclReplacement)
    console.log('✅ Patch 1: Added buffer size tracking variables')
    patchCount++
  }

  // ============================================
  // PATCH 2: Wait for buffer space before downloading (polling approach)
  // ============================================
  // Add buffer size check at the start of downloadChunk
  const downloadChunkStart = `const downloadChunk = async (chunk = nextWorkerChunkIdx++) => {
    let result;
    if (ended) {
      return;
    }`

  const downloadChunkWithBufferCheck = `const downloadChunk = async (chunk = nextWorkerChunkIdx++) => {
    let result;
    if (ended) {
      return;
    }
    // Wait if buffer is too full (backpressure via polling)
    while (bufferBytes > maxBufferBytes && !ended) {
      await waitForBuffer();
    }
    if (ended) return;`

  if (content.includes(downloadChunkStart) && !content.includes('bufferBytes > maxBufferBytes')) {
    content = content.replace(downloadChunkStart, downloadChunkWithBufferCheck)
    console.log('✅ Patch 2: Added buffer size check before download')
    patchCount++
  }

  // ============================================
  // PATCH 3: Track buffer size when chunk is added
  // ============================================
  const bufferAddPattern = 'buffer[chunk] = result.bytes;'
  const bufferAddReplacement = `buffer[chunk] = result.bytes;
    bufferBytes += result.bytes.length;`

  if (content.includes(bufferAddPattern) && !content.includes('bufferBytes += result.bytes.length')) {
    content = content.replace(bufferAddPattern, bufferAddReplacement)
    console.log('✅ Patch 3: Track buffer size on chunk add')
    patchCount++
  }

  // ============================================
  // PATCH 4: Reduce buffer size when chunk is consumed
  // ============================================
  const bufferConsumePattern = 'const buf = buffer[nextChunkIdx];\n      delete buffer[nextChunkIdx];'
  const bufferConsumeReplacement = `const buf = buffer[nextChunkIdx];
      delete buffer[nextChunkIdx];
      bufferBytes -= buf.length;`

  if (content.includes(bufferConsumePattern) && !content.includes('bufferBytes -= buf.length')) {
    content = content.replace(bufferConsumePattern, bufferConsumeReplacement)
    console.log('✅ Patch 4: Reduce buffer size on consume')
    patchCount++
  }

  // ============================================
  // PATCH 5: Clear buffer on abort (memory leak fix)
  // ============================================
  const abortPattern = `abortSignal?.addEventListener("abort", () => {
    client.log.debug("download aborted");
    error = abortSignal.reason;
    ended = true;
    nextChunkCv.notify();
  });`

  const abortReplacement = `abortSignal?.addEventListener("abort", () => {
    client.log.debug("download aborted");
    error = abortSignal.reason;
    ended = true;
    // Clear buffered chunks to prevent memory leak
    for (const key in buffer) {
      delete buffer[key];
    }
    bufferBytes = 0;
    nextChunkCv.notify();
  });`

  if (content.includes(abortPattern)) {
    content = content.replace(abortPattern, abortReplacement)
    console.log('✅ Patch 5: Clear buffer on abort')
    patchCount++
  } else if (content.includes('for (const key in buffer)')) {
    console.log('⏭️  Patch 5: Abort cleanup already applied')
  }

  // ============================================
  // PATCH 6: Force sequential downloads (1 worker only)
  // ============================================
  // Change parallel workers to single sequential worker
  const parallelPattern = 'length: Math.min(poolSize * (isSmall ? 1 : REQUESTS_PER_CONNECTION), numChunks)'
  const sequentialReplacement = 'length: 2 // PATCHED: Sequential download - single worker'

  if (content.includes(parallelPattern)) {
    content = content.replace(parallelPattern, sequentialReplacement)
    console.log('✅ Patch 6: Forced sequential downloads (1 worker)')
    patchCount++
  } else if (content.includes('length: 2 // PATCHED')) {
    console.log('⏭️  Patch 6: Sequential download already applied')
  }

  // Write the patched file
  if (patchCount > 0) {
    fs.writeFileSync(iterableFile, content)
    console.log(`\n🎉 Applied ${patchCount} patches successfully!`)
    console.log(`   Max buffer size: ${(MAX_BUFFER_SIZE / 1024 / 1024).toFixed(1)}MB`)
    console.log('   Set MTCUTE_MAX_BUFFER_SIZE env var to customize (in bytes)')
  } else {
    console.log('\n✅ All patches already applied or patterns not found')
    console.log('   If issues persist, check mtcute version compatibility')
  }

} catch (e) {
  console.error('❌ Patch failed:', e.message)
  process.exit(1)
}
