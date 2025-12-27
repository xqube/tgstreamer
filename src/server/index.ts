import http from 'node:http'
import { Readable, Transform } from 'node:stream'
import type { TelegramClient } from '@mtcute/node'

import { env } from '../config/env.js'
import { ALIGN_LARGE_FILE, ALIGN_SMALL_FILE, LARGE_FILE_THRESHOLD } from '../config/constants.js'
import { streamLogger } from '../utils/logger.js'
import { getFileEntry } from './utils/file-store.js'
import { getMimeType } from './utils/mime.js'
import { checkRateLimit, incrementStreamCount, decrementStreamCount } from './middleware/rate-limit.js'

/**
 * Send error message to browser (plain text)
 */
function sendErrorMessage(res: http.ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' })
    res.end(message)
}

/**
 * Get client IP from request
 */
function getClientIP(req: http.IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || req.socket.remoteAddress 
        || 'unknown'
}

/**
 * Handle streaming/download request using downloadAsIterable API
 */
async function handleStreamRequest(
    req: http.IncomingMessage, 
    res: http.ServerResponse,
    tg: TelegramClient,
    token: string,
    isDownload: boolean
): Promise<void> {
    const fileEntry = getFileEntry(token)

    if (!fileEntry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('File not found or link expired')
        return
    }

    const clientIP = getClientIP(req)

    // Check rate limits
    const rateLimit = checkRateLimit(token, clientIP)
    if (!rateLimit.allowed) {
        sendErrorMessage(res, 503, rateLimit.reason!)
        return
    }

    // Increment active stream counts
    incrementStreamCount(token, clientIP)

    try {
        const { fileId, fileName, fileSize, mimeType } = fileEntry
        const contentType = mimeType || getMimeType(fileName)

        // Parse Range header
        const rangeHeader = req.headers.range
        let start = 0
        let end = fileSize - 1

        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
            if (match) {
                start = match[1] ? parseInt(match[1], 10) : 0
                end = match[2] ? parseInt(match[2], 10) : fileSize - 1
            }
        }

        const chunkSize = end - start + 1
        streamLogger.http(`${fileName}`, { bytes: `${start}-${end}` })

        // Headers
        const disposition = isDownload ? 'attachment' : 'inline'
        const headers: Record<string, string | number> = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName)}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        }

        if (rangeHeader) {
            headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
            res.writeHead(206, headers)
        } else {
            res.writeHead(200, headers)
        }

        // Flush headers immediately to prevent buffering delays
        res.flushHeaders()

        // Handle HEAD request - return headers only, no body
        if (req.method === 'HEAD') {
            decrementStreamCount(token, clientIP)
            res.end()
            return
        }

        // Alignment for Telegram API - offset must be aligned
        const isLargeFile = fileSize > LARGE_FILE_THRESHOLD
        const ALIGN = isLargeFile ? ALIGN_LARGE_FILE : ALIGN_SMALL_FILE
        const alignedStart = Math.floor(start / ALIGN) * ALIGN
        const skipBytes = start - alignedStart

        // Abort controller for cleanup
        const abortController = new AbortController()
        let cleanedUp = false
        let bytesStreamed = 0
        let skipped = 0
        let written = 0

        // Stall timeout - kill connection if client stops reading but doesn't disconnect
        let stallTimeout: ReturnType<typeof setTimeout> | null = null
        let lastProgress = Date.now()

        // Cleanup function
        const cleanup = (reason: string) => {
            if (cleanedUp) return
            cleanedUp = true
            if (stallTimeout) clearInterval(stallTimeout)
            decrementStreamCount(token, clientIP)
            abortController.abort()
            const mem = process.memoryUsage()
            streamLogger.debug(`Cleanup: ${reason}`, { 
                bytesStreamed,
                heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
                rssMB: Math.round(mem.rss / 1024 / 1024)
            })
        }

        req.on('close', () => cleanup('client disconnect'))
        res.on('error', (err) => {
            streamLogger.warn('Response error', { error: err.message })
            cleanup('response error')
        })

        // Create readable stream from downloadAsIterable
        // Do NOT pass fileSize - mtcute's determinePartSize() throws "File is too large" for files >2GB
        // Do NOT pass limit - mtcute requires limit to equal fileSize or be a factor of 1MB
        // Use partSize: 512 (512KB) for optimal video streaming throughput
        // We let it stream from offset and abort when we have enough bytes
        // highWaterMark: 1 means we only buffer one chunk at a time for backpressure
        const readable = Readable.from(
            tg.downloadAsIterable(fileId, {
                offset: alignedStart,
                partSize: 1024,  // 1MB chunks for faster streaming
                abortSignal: abortController.signal,
                // Throttle: wait for HTTP response to drain before downloading more
                // Called multiple times simultaneously since downloads are parallelized
                throttle: async () => {
                    if (res.writableNeedDrain) {
                        await new Promise<void>(resolve => res.once('drain', resolve))
                    }
                }
            }),
            { highWaterMark: 1, objectMode: true }
        )

        // Transform stream for slicing (handles alignment skip + byte limit)
        const sliceTransform = new Transform({
            transform(chunk: Buffer, encoding, callback) {
                bytesStreamed += chunk.length
                lastProgress = Date.now()
                
                // Skip alignment bytes at the start
                if (skipped < skipBytes) {
                    const toSkip = Math.min(skipBytes - skipped, chunk.length)
                    skipped += toSkip
                    chunk = chunk.subarray(toSkip) as Buffer
                    if (chunk.length === 0) {
                        callback()
                        return
                    }
                }
                
                // Limit to requested size
                const remaining = chunkSize - written
                if (remaining <= 0) {
                    this.push(null) // End the stream
                    callback()
                    return
                }
                
                if (chunk.length > remaining) {
                    chunk = chunk.subarray(0, remaining) as Buffer
                }
                
                written += chunk.length
                this.push(chunk)
                
                if (written >= chunkSize) {
                    this.push(null) // End the stream
                    cleanup('stream complete')  // Abort download early - we have enough bytes
                }
                callback()
            }
        })

        // Set stall check interval - 2 minutes of no progress triggers cleanup
        stallTimeout = setInterval(() => {
            if (!cleanedUp && Date.now() - lastProgress > 120000 && written < chunkSize) {
                cleanup('stall timeout')
                res.destroy()
            }
        }, 30000)  // Check every 30 seconds

        // Pipe: Readable (chunks) -> Transform (slice) -> HTTP Response
        readable
            .pipe(sliceTransform)
            .pipe(res)

        // Handle stream events
        sliceTransform.on('end', () => cleanup('stream complete'))
        readable.on('error', (err) => {
            if (!abortController.signal.aborted) {
                streamLogger.warn('Stream error', { error: err.message, bytesStreamed })
            }
            cleanup('stream error')
        })
        sliceTransform.on('error', (err) => {
            streamLogger.warn('Transform error', { error: err.message, bytesStreamed })
            cleanup('transform error')
        })

    } catch (error) {
        // Decrement counters on error
        decrementStreamCount(token, clientIP)
        streamLogger.error('Streaming error', { error })
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
        }
        res.end('Failed to stream file')
    }
}

/**
 * Start the HTTP streaming server
 */
export function startStreamServer(tg: TelegramClient): http.Server {
    
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`)
        const pathParts = url.pathname.split('/').filter(Boolean)

        // Health check endpoint
        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('OK')
            return
        }

        // Stream endpoint: /stream/:token
        // Download endpoint: /download/:token
        if ((pathParts[0] === 'stream' || pathParts[0] === 'download') && pathParts[1]) {
            const isDownload = pathParts[0] === 'download'
            const token = pathParts[1]
            await handleStreamRequest(req, res, tg, token, isDownload)
            return
        }

        // 404 for unknown routes
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
    })

    // HTTP server timeouts for connection management
    server.setTimeout(300000)        // 5 min overall request timeout
    server.keepAliveTimeout = 60000  // 60s keep-alive timeout
    server.headersTimeout = 30000    // 30s to receive request headers

    server.listen(env.PORT, '0.0.0.0', () => {
        streamLogger.info(`Server listening on 0.0.0.0:${env.PORT}`)
        streamLogger.info(`Public URL: ${env.HOST}`)
    })

    return server
}
